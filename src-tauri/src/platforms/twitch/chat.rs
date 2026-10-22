//! Twitch chat over the IRC WebSocket: messages, notices (subs, raids, bits) and moderation.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tungstenite::Message;

use super::emotes::{apply_thirdparty, fetch_channel_thirdparty, fetch_global_thirdparty};
use crate::chat::{
    chat_auth, chat_status, chat_status_gen, clear_source, delete_message, delete_user, emit_alert,
    emit_chat_gen, next_id, now_ms, reply_id, sanitize_outgoing, text_frag, Alert, ChatBadge,
    ChatFragment, ChatMessage, Outgoing, CHAT_GEN,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::AppState;

fn twitch_privmsg(channel: &str, text: &str, reply_to: Option<&str>) -> String {
    match reply_to.and_then(reply_id) {
        Some(id) => format!("@reply-parent-msg-id={id} PRIVMSG #{channel} :{text}"),
        None => format!("PRIVMSG #{channel} :{text}"),
    }
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
pub(crate) fn run_twitch(
    channel: &str,
    source: &str,
    source_id: &str,
    send_token: Option<String>,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return false;
    }

    // Invalid tokens or missing chat:edit scope fall back to anonymous reading.

    let creds: Option<(String, String)> = match send_token.as_ref() {
        Some(t) => {
            let raw = t.trim().trim_start_matches("oauth:").trim().to_string();
            match twitch_validate(&raw) {
                TokenCheck::Valid(login, true) => Some((login, raw)),
                TokenCheck::Valid(login, false) => {
                    chat_auth(&app, source_id, &login, false);
                    None
                }
                TokenCheck::Invalid => {
                    chat_auth(&app, source_id, "", false);
                    None
                }
                // Retry network failures without invalidating a potentially valid token or downgrading to anonymous.
                TokenCheck::Network => return false,
            }
        }
        None => None,
    };

    let mut socket = match tungstenite::connect("wss://irc-ws.chat.twitch.tv:443") {
        Ok((s, _)) => s,
        Err(_) => {
            log::warn!("twitch chat: connection failed");
            chat_status_gen(&app, gen, "twitch", source, "error");
            return false;
        }
    };
    match socket.get_mut() {
        tungstenite::stream::MaybeTlsStream::Rustls(s) => {
            let _ = s.sock.set_read_timeout(Some(Duration::from_millis(400)));
        }
        tungstenite::stream::MaybeTlsStream::Plain(tcp) => {
            let _ = tcp.set_read_timeout(Some(Duration::from_millis(400)));
        }
        _ => {}
    }
    let _ = socket.send(Message::Text(
        "CAP REQ :twitch.tv/tags twitch.tv/commands".into(),
    ));

    if let Some((login, raw)) = &creds {
        let _ = socket.send(Message::Text(format!("PASS oauth:{raw}").into()));
        let _ = socket.send(Message::Text(format!("NICK {login}").into()));
    } else {
        let _ = socket.send(Message::Text("PASS SCHMOOPIIE".into()));
        let _ = socket.send(Message::Text(
            format!("NICK justinfan{}", now_ms() % 100000).into(),
        ));
    }
    let _ = socket.send(Message::Text(format!("JOIN #{ch}").into()));
    log::info!("twitch chat: connected");
    chat_status_gen(&app, gen, "twitch", source, "connected");

    let mut out_rx: Option<mpsc::Receiver<Outgoing>> = None;
    let mut send_login: Option<String> = None;
    if let Some((login, _)) = &creds {
        let (tx, rx) = mpsc::channel::<Outgoing>();
        let senders = app.state::<AppState>().chat.lock().unwrap().senders.clone();
        // A late old connection must not overwrite the current sender with a dead receiver.

        let registered = {
            let mut map = senders.lock().unwrap();
            if CHAT_GEN.load(Ordering::SeqCst) == gen && running.load(Ordering::Relaxed) {
                map.insert(source_id.to_string(), tx);
                true
            } else {
                false
            }
        };
        if registered {
            chat_auth(&app, source_id, login, true);
            out_rx = Some(rx);
            send_login = Some(login.clone());
        }
    }
    let mut sends: Vec<Instant> = Vec::new();

    // Load before parsing messages; late emote lookup would leave them permanently rendered as text.

    let mut emotes = fetch_global_thirdparty();
    let mut channel_emotes_done = false;

    while running.load(Ordering::Relaxed) {
        // Drain on read timeouts too, so quiet channels do not stall outgoing messages.

        if let (Some(rx), Some(login)) = (&out_rx, &send_login) {
            loop {
                sends.retain(|t| t.elapsed() < Duration::from_secs(30));
                if sends.len() >= 18 {
                    break;
                }
                let outgoing = match rx.try_recv() {
                    Ok(t) => t,
                    Err(_) => break,
                };
                let clean = sanitize_outgoing(&outgoing.text);
                if clean.is_empty() {
                    continue;
                }
                let line = twitch_privmsg(&ch, &clean, outgoing.reply_to.as_deref());
                if socket.send(Message::Text(line.into())).is_ok() {
                    sends.push(Instant::now());
                    // Twitch does not echo the sender's own PRIVMSG.
                    emit_chat_gen(
                        &app,
                        gen,
                        ChatMessage {
                            id: next_id(),
                            platform: "twitch".into(),
                            source: source.to_string(),
                            author: login.clone(),
                            author_id: None,
                            native_id: None,
                            color: Some("#ffb323".into()),
                            text: clean.clone(),
                            fragments: vec![text_frag(&clean)],
                            badges: vec![],
                            ts: now_ms(),
                        },
                    );
                }
            }
        }

        match socket.read() {
            Ok(Message::Text(t)) => {
                for line in t.split("\r\n").filter(|l| !l.is_empty()) {
                    if !channel_emotes_done {
                        if let Some(room_id) = tag_val(twitch_tags(line), "room-id") {
                            fetch_channel_thirdparty(&room_id, &mut emotes);
                            channel_emotes_done = true;
                        }
                    }
                    // Compare the IRC command, not substrings that may occur in user text.

                    let cmd = irc_command(line);
                    if cmd == "PING" {
                        let _ = socket.send(Message::Text("PONG :tmi.twitch.tv".into()));
                    } else if cmd == "PRIVMSG" {
                        if let Some(b) =
                            tag_val(twitch_tags(line), "bits").and_then(|v| v.parse::<f64>().ok())
                        {
                            if b > 0.0 {
                                emit_alert(
                                    &app,
                                    Alert {
                                        id: next_id(),
                                        platform: "twitch".into(),
                                        source: source.to_string(),
                                        kind: "bits".into(),
                                        user: tag_val(twitch_tags(line), "display-name")
                                            .unwrap_or_else(|| Msg::ChatUnknownUser.now()),
                                        amount: Some(b),
                                        currency: None,
                                        tier: None,
                                        message: None,
                                        fragments: Vec::new(),
                                        ts: now_ms(),
                                    },
                                );
                            }
                        }
                        if let Some(msg) = parse_privmsg(line, source, &emotes) {
                            emit_chat_gen(&app, gen, msg);
                        }
                    } else if cmd == "USERNOTICE" {
                        if let Some(alert) = parse_usernotice(line, source, &emotes) {
                            emit_alert(&app, alert);
                        }
                    } else if cmd == "CLEARMSG" {
                        if let Some(id) = tag_val(twitch_tags(line), "target-msg-id") {
                            delete_message(&app, "twitch", &id);
                        }
                    } else if cmd == "CLEARCHAT" {
                        match clearchat_user(line) {
                            Some(u) => delete_user(&app, "twitch", source, &u),
                            None => clear_source(&app, "twitch", source),
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue;
            }
            Err(_) => break,
        }
    }
    let _ = socket.close(None);
    // Old connection cleanup must not remove a new generation's queue or report it disconnected.

    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        if send_login.is_some() {
            let senders = app.state::<AppState>().chat.lock().unwrap().senders.clone();
            senders.lock().unwrap().remove(source_id);
        }
        chat_status(&app, "twitch", source, "disconnected");
    }
    true
}

enum TokenCheck {
    Valid(String, bool), // Lowercase login and chat:edit permission.
    Invalid,
    Network,
}

fn twitch_validate(token: &str) -> TokenCheck {
    let body = match ureq::get("https://id.twitch.tv/oauth2/validate")
        .set("Authorization", &format!("OAuth {token}"))
        .timeout(Duration::from_secs(5))
        .call()
    {
        Ok(r) => match r.into_string() {
            Ok(b) => b,
            Err(_) => return TokenCheck::Network,
        },
        Err(ureq::Error::Status(401, _)) => return TokenCheck::Invalid,
        Err(_) => return TokenCheck::Network,
    };
    let parsed = (|| -> Option<(String, bool)> {
        let v: Value = serde_json::from_str(&body).ok()?;
        let login = v.get("login")?.as_str()?.to_lowercase();
        let can_send = v
            .get("scopes")
            .and_then(|s| s.as_array())
            .map(|arr| arr.iter().any(|x| x.as_str() == Some("chat:edit")))
            .unwrap_or(false);
        Some((login, can_send))
    })();
    match parsed {
        Some((login, can_send)) => TokenCheck::Valid(login, can_send),
        None => TokenCheck::Network,
    }
}

// Skip IRC tags and prefix before examining the command; message text is not a command.

fn irc_command(line: &str) -> &str {
    let mut rest = line;
    if rest.starts_with('@') {
        rest = match rest.find(' ') {
            Some(i) => &rest[i + 1..],
            None => return "",
        };
    }
    if rest.starts_with(':') {
        rest = match rest.find(' ') {
            Some(i) => &rest[i + 1..],
            None => return "",
        };
    }
    rest.split(' ').next().unwrap_or("")
}

fn twitch_tags(line: &str) -> &str {
    line.strip_prefix('@')
        .and_then(|s| s.split(' ').next())
        .unwrap_or("")
}

fn tag_val(tags: &str, key: &str) -> Option<String> {
    for kv in tags.split(';') {
        let mut it = kv.splitn(2, '=');
        if it.next() == Some(key) {
            let v = it.next().unwrap_or("");
            return (!v.is_empty()).then(|| v.to_string());
        }
    }
    None
}

fn clearchat_user(line: &str) -> Option<String> {
    let after = line.split("CLEARCHAT").nth(1)?;
    let idx = after.find(':')?;
    let u = after[idx + 1..].trim();
    (!u.is_empty()).then(|| u.to_string())
}

fn parse_usernotice(line: &str, source: &str, emotes: &HashMap<String, String>) -> Option<Alert> {
    let tags = twitch_tags(line);
    let msg_id = tag_val(tags, "msg-id")?;
    let user = tag_val(tags, "display-name")
        .or_else(|| tag_val(tags, "login"))
        .unwrap_or_else(|| Msg::ChatUnknownUser.now());
    let tier = tag_val(tags, "msg-param-sub-plan").map(|p| match p.as_str() {
        "Prime" => "Prime".into(),
        "1000" => "T1".into(),
        "2000" => "T2".into(),
        "3000" => "T3".into(),
        other => other.to_string(),
    });
    let (kind, amount) = match msg_id.as_str() {
        "sub" => ("sub", Some(1.0)),
        "resub" => (
            "resub",
            tag_val(tags, "msg-param-cumulative-months").and_then(|v| v.parse().ok()),
        ),
        "subgift" => ("subgift", Some(1.0)),
        "submysterygift" | "anonsubmysterygift" => (
            "subgift",
            tag_val(tags, "msg-param-mass-gift-count").and_then(|v| v.parse().ok()),
        ),
        "raid" => (
            "raid",
            tag_val(tags, "msg-param-viewerCount").and_then(|v| v.parse().ok()),
        ),
        _ => return None,
    };
    let emotes_tag = tag_val(tags, "emotes").unwrap_or_default();
    let (message, fragments) = if kind == "subgift" {
        (
            tag_val(tags, "msg-param-recipient-display-name")
                .map(|r| Msg::ChatGiftRecipient { recipient: &r }.now()),
            Vec::new(),
        )
    } else {
        match usernotice_text(line) {
            Some(t) => {
                let frags = apply_thirdparty(twitch_fragments(&t, &emotes_tag), emotes);
                (Some(t), frags)
            }
            None => (None, Vec::new()),
        }
    };
    Some(Alert {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency: None,
        tier,
        message,
        fragments,
        ts: now_ms(),
    })
}

fn usernotice_text(line: &str) -> Option<String> {
    let idx = line.find("USERNOTICE")?;
    let after = &line[idx..];
    let mi = after.find(':')?;
    let t = after[mi + 1..].trim_end();
    (!t.is_empty()).then(|| t.to_string())
}

fn parse_privmsg(
    line: &str,
    source: &str,
    emotes: &HashMap<String, String>,
) -> Option<ChatMessage> {
    let (tags, rest) = if let Some(stripped) = line.strip_prefix('@') {
        let sp = stripped.find(' ')?;
        (&stripped[..sp], &stripped[sp + 1..])
    } else {
        ("", line)
    };
    let privmsg_idx = rest.find("PRIVMSG")?;
    let after = &rest[privmsg_idx..];
    let msg_idx = after.find(':')?;
    let mut text = after[msg_idx + 1..].trim_end().to_string();
    // Strip the CTCP /me envelope while preserving its action text.
    if let Some(inner) = text
        .strip_prefix("\u{1}ACTION ")
        .and_then(|s| s.strip_suffix('\u{1}'))
    {
        text = inner.to_string();
    }
    if text.is_empty() {
        return None;
    }

    let nick = rest
        .strip_prefix(':')
        .and_then(|r| r.split('!').next())
        .unwrap_or("anon")
        .to_string();

    let mut color = None;
    let mut display = nick;
    let mut emotes_tag = "";
    let mut badges_tag = "";
    let mut native_id = None;
    for kv in tags.split(';') {
        let mut it = kv.splitn(2, '=');
        let k = it.next().unwrap_or("");
        let v = it.next().unwrap_or("");
        match k {
            "color" if !v.is_empty() => color = Some(v.to_string()),
            "display-name" if !v.is_empty() => display = v.to_string(),
            "emotes" => emotes_tag = v,
            "badges" => badges_tag = v,
            "id" if !v.is_empty() => native_id = Some(v.to_string()),
            _ => {}
        }
    }

    Some(ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        author: display,
        author_id: tag_val(twitch_tags(line), "user-id"),
        native_id,
        color,
        fragments: apply_thirdparty(twitch_fragments(&text, emotes_tag), emotes),
        badges: twitch_badges(badges_tag),
        text,
        ts: now_ms(),
    })
}

fn twitch_fragments(text: &str, emotes_tag: &str) -> Vec<ChatFragment> {
    if emotes_tag.is_empty() {
        return vec![text_frag(text)];
    }
    let mut ranges: Vec<(usize, usize, String)> = vec![];
    for part in emotes_tag.split('/') {
        let mut it = part.splitn(2, ':');
        let id = it.next().unwrap_or("");
        let positions = it.next().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        for pos in positions.split(',') {
            let mut p = pos.splitn(2, '-');
            if let (Some(a), Some(b)) = (
                p.next().and_then(|x| x.parse::<usize>().ok()),
                p.next().and_then(|x| x.parse::<usize>().ok()),
            ) {
                ranges.push((a, b, id.to_string()));
            }
        }
    }
    if ranges.is_empty() {
        return vec![text_frag(text)];
    }
    ranges.sort_by_key(|r| r.0);

    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut frags = vec![];
    let mut cursor = 0usize;
    for (a, b, id) in ranges {
        if a >= n || a < cursor || b < a {
            continue;
        }
        if a > cursor {
            frags.push(text_frag(&chars[cursor..a].iter().collect::<String>()));
        }
        let end = (b + 1).min(n);
        frags.push(ChatFragment {
            kind: "emote".into(),
            text: Some(chars[a..end].iter().collect()),
            url: Some(format!(
                "https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/1.0"
            )),
        });
        cursor = end;
    }
    if cursor < n {
        frags.push(text_frag(&chars[cursor..].iter().collect::<String>()));
    }
    frags
}

fn twitch_badges(tag: &str) -> Vec<ChatBadge> {
    if tag.is_empty() {
        return vec![];
    }
    tag.split(',')
        .filter_map(|b| {
            let set = b.split('/').next().unwrap_or("");
            let (label, kind) = match set {
                "broadcaster" => ("HOST", "broadcaster"),
                "moderator" => ("MOD", "moderator"),
                "vip" => ("VIP", "vip"),
                "subscriber" => ("SUB", "subscriber"),
                "founder" => ("FND", "subscriber"),
                "premium" => ("PRIME", "premium"),
                "turbo" => ("TURBO", "premium"),
                "partner" => ("✓", "partner"),
                "staff" | "admin" | "global_mod" => ("STAFF", "staff"),
                "artist-badge" => ("ART", "artist"),
                _ => return None,
            };
            Some(ChatBadge {
                label: label.into(),
                kind: kind.into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privmsg_extracts_text_and_ignores_lines_without_messages() {
        let emotes: HashMap<String, String> = HashMap::new();
        let msg = parse_privmsg(
            "@id=1 :fulano!fulano@fulano.tmi.twitch.tv PRIVMSG #canal :bora cornetar 😀",
            "meu-canal",
            &emotes,
        )
        .expect("valid message");
        assert_eq!(msg.author, "fulano");
        assert_eq!(msg.text, "bora cornetar 😀");
        assert_eq!(msg.source, "meu-canal");
        assert_eq!(msg.platform, "twitch");

        assert!(parse_privmsg("@id=1 :a!a@a PRIVMSG #c :", "s", &emotes).is_none());
        assert!(parse_privmsg("PING :tmi.twitch.tv", "s", &emotes).is_none());
    }

    #[test]
    fn tag_value_matches_the_exact_key_not_its_prefix() {
        let tags = twitch_tags("@id=abc;bits=100;idade=9 :resto");
        assert_eq!(tag_val(tags, "id").as_deref(), Some("abc"));
        assert_eq!(tag_val(tags, "bits").as_deref(), Some("100"));

        assert_eq!(tag_val("id=;bits=", "bits"), None);
        assert_eq!(tag_val(tags, "nao-existe"), None);
    }

    #[test]
    fn twitch_parsers_tolerate_hostile_network_fixtures() {
        let emotes: HashMap<String, String> = HashMap::new();
        for case in crate::chat::hostile_chat_corpus() {
            let _ = parse_privmsg(&case, "fonte", &emotes);
            let _ = parse_usernotice(&case, "fonte", &emotes);
            let _ = clearchat_user(&case);
            let _ = tag_val(twitch_tags(&case), "id");
        }
    }

    #[test]
    fn replies_thread_only_with_plain_message_ids() {
        let id = "885196de-cb67-427a-baa8-82f9b0fcd05f";
        assert_eq!(
            twitch_privmsg("canal", "valeu", Some(id)),
            format!("@reply-parent-msg-id={id} PRIVMSG #canal :valeu")
        );
        assert_eq!(
            twitch_privmsg("canal", "valeu", None),
            "PRIVMSG #canal :valeu"
        );
        for unsafe_id in [
            "a b",
            "a;mod=1",
            "a\r\nPRIVMSG #x :y",
            "",
            "a".repeat(65).as_str(),
        ] {
            assert_eq!(reply_id(unsafe_id), None, "{unsafe_id:?}");
            assert_eq!(
                twitch_privmsg("canal", "valeu", Some(unsafe_id)),
                "PRIVMSG #canal :valeu"
            );
        }
    }
}
