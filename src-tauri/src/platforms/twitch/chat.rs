//! Twitch chat over the IRC WebSocket: messages, notices (subs, raids, bits) and moderation.

use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tungstenite::Message;

use super::assets::{ChannelAssets, Helix};
use super::irc::{is_ping, line_events, room_id, TwitchEvent};
use crate::chat::{
    chat_auth, chat_status, chat_status_gen, clear_source, delete_message, delete_user, emit_alert,
    emit_chat_gen, emit_modes, next_id, now_ms, reply_id, sanitize_outgoing, text_frag,
    ChatMessage, Outgoing, CHAT_GEN,
};
use crate::http_client as ureq;
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

    let helix = super::account::twitch_token(&app)
        .map(|token| Helix {
            token,
            client_id: crate::auth::oauth(&app).twitch_client_id,
        })
        .filter(|h| !h.client_id.is_empty());
    let mut assets = ChannelAssets::global(helix.as_ref());
    let mut channel_assets_done = false;

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
                            ..Default::default()
                        },
                    );
                }
            }
        }

        match socket.read() {
            Ok(Message::Text(t)) => {
                for line in t.split("\r\n").filter(|l| !l.is_empty()) {
                    if is_ping(line) {
                        let _ = socket.send(Message::Text("PONG :tmi.twitch.tv".into()));
                        continue;
                    }
                    if !channel_assets_done {
                        if let Some(room) = room_id(line) {
                            assets.load_channel(&room, helix.as_ref());
                            channel_assets_done = true;
                        }
                    }
                    for event in line_events(line, source, &assets) {
                        match event {
                            TwitchEvent::Message(msg) => emit_chat_gen(&app, gen, msg),
                            TwitchEvent::Alert(alert) => emit_alert(&app, alert),
                            TwitchEvent::Delete(id) => delete_message(&app, "twitch", &id),
                            TwitchEvent::DeleteUser {
                                login,
                                user_id,
                                seconds,
                            } => delete_user(
                                &app,
                                "twitch",
                                source,
                                &login,
                                user_id.as_deref(),
                                seconds,
                            ),
                            TwitchEvent::Clear => clear_source(&app, "twitch", source),
                            TwitchEvent::Modes(modes) => {
                                emit_modes(&app, gen, "twitch", source, modes)
                            }
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

#[cfg(test)]
mod tests {
    use super::*;

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
