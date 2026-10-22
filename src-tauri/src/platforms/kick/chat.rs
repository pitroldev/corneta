//! Kick chat over its public Pusher WebSocket: messages, alerts and moderation events.

use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tungstenite::Message;

use crate::chat::{
    chat_status_gen, delete_message, delete_user, emit_alert, emit_chat_gen, frags_to_text,
    next_id, now_ms, text_frag, Alert, ChatBadge, ChatFragment, ChatMessage,
};
use crate::http_client as ureq;
use crate::i18n::Msg;

/// Chatroom ID carries chat; channel ID carries engagement events.
fn get_kick_ids(slug: &str) -> Option<(u64, u64)> {
    let url = format!("https://kick.com/api/v2/channels/{slug}");
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(6))
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .set("Accept", "application/json")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    let chatroom = v.pointer("/chatroom/id").and_then(|x| x.as_u64())?;
    let channel = v.get("id").and_then(|x| x.as_u64()).unwrap_or(0);
    Some((chatroom, channel))
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
pub(crate) fn run_kick(
    slug: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return false;
    }
    let (chatroom_id, channel_id) = match get_kick_ids(&slug) {
        Some(ids) => ids,
        None => {
            log::warn!("kick chat: chatroom resolution failed");
            chat_status_gen(&app, gen, "kick", source, "error");
            return false;
        }
    };
    let url = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=corneta&version=1.0&flash=false";
    let mut socket = match tungstenite::connect(url) {
        Ok((s, _)) => s,
        Err(_) => {
            log::warn!("kick chat: Pusher connection failed");
            chat_status_gen(&app, gen, "kick", source, "error");
            return false;
        }
    };
    if let tungstenite::stream::MaybeTlsStream::Rustls(s) = socket.get_mut() {
        let _ = s.sock.set_read_timeout(Some(Duration::from_millis(400)));
    }
    let _ = socket.send(Message::Text(format!(
        "{{\"event\":\"pusher:subscribe\",\"data\":{{\"auth\":\"\",\"channel\":\"chatrooms.{chatroom_id}.v2\"}}}}"
    )
    .into()));

    if channel_id != 0 {
        let _ = socket.send(Message::Text(format!(
            "{{\"event\":\"pusher:subscribe\",\"data\":{{\"auth\":\"\",\"channel\":\"channel.{channel_id}\"}}}}"
        )
        .into()));
    }
    log::info!(
        "kick chat: connected; event channel={}",
        if channel_id == 0 { "missing" } else { "active" }
    );
    chat_status_gen(&app, gen, "kick", source, "connected");

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(t)) => {
                // Inspect the event field so user text containing pusher:ping is not swallowed.

                let is_ping = serde_json::from_str::<Value>(&t)
                    .ok()
                    .and_then(|v| Some(v.get("event")?.as_str()? == "pusher:ping"))
                    .unwrap_or(false);
                if is_ping {
                    let _ = socket.send(Message::Text(
                        "{\"event\":\"pusher:pong\",\"data\":{}}".into(),
                    ));
                } else if let Some(msg) = parse_kick(&t, source) {
                    emit_chat_gen(&app, gen, msg);
                } else if let Some(alert) = parse_kick_alert(&t, source) {
                    emit_alert(&app, alert);
                } else {
                    let _ = handle_kick_moderation(&t, source, &app);
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
    chat_status_gen(&app, gen, "kick", source, "disconnected");
    true
}

fn parse_kick(raw: &str, source: &str) -> Option<ChatMessage> {
    let v: Value = serde_json::from_str(raw).ok()?;
    if !v.get("event")?.as_str()?.ends_with("ChatMessageEvent") {
        return None;
    }
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    let content = d.get("content")?.as_str()?.to_string();
    if content.is_empty() {
        return None;
    }
    let author = d
        .pointer("/sender/username")
        .and_then(|x| x.as_str())
        .unwrap_or("anon")
        .to_string();
    let color = d
        .pointer("/sender/identity/color")
        .and_then(|x| x.as_str())
        .filter(|c| !c.is_empty())
        .map(String::from);
    let fragments = kick_fragments(&content);
    // Pusher has sent the sender ID both as a number and as a string.
    let author_id = d.pointer("/sender/id").and_then(|id| match id {
        Value::Number(n) => n.as_u64().map(|n| n.to_string()),
        Value::String(s) if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) => {
            Some(s.clone())
        }
        _ => None,
    });
    Some(ChatMessage {
        id: next_id(),
        platform: "kick".into(),
        source: source.to_string(),
        author,
        author_id,
        native_id: d.get("id").and_then(|x| x.as_str()).map(String::from),
        color,
        text: frags_to_text(&fragments),
        badges: kick_badges(d.pointer("/sender/identity/badges")),
        fragments,
        ts: now_ms(),
    })
}

fn handle_kick_moderation(raw: &str, source: &str, app: &AppHandle) -> Option<()> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let event = v.get("event")?.as_str()?;
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    if event.ends_with("MessageDeletedEvent") {
        let id = d.pointer("/message/id").and_then(|x| x.as_str())?;
        delete_message(app, "kick", id);
    } else if event.ends_with("UserBannedEvent") {
        let u = d.pointer("/user/username").and_then(|x| x.as_str())?;
        delete_user(app, "kick", source, u);
    }
    Some(())
}

fn parse_kick_alert(raw: &str, source: &str) -> Option<Alert> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let event = v.get("event")?.as_str()?;
    let d: Value = serde_json::from_str(v.get("data")?.as_str()?).ok()?;
    let mk = |kind: &str, user: String, amount: Option<f64>| Alert {
        id: next_id(),
        platform: "kick".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency: None,
        tier: None,
        message: None,
        fragments: Vec::new(),
        ts: now_ms(),
    };
    if event.ends_with("SubscriptionEvent") {
        let user = d
            .get("username")
            .and_then(|x| x.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        Some(mk(
            "sub",
            user,
            d.get("months").and_then(|x| x.as_u64()).map(|m| m as f64),
        ))
    } else if event.ends_with("GiftedSubscriptionsEvent") {
        let user = d
            .get("gifter_username")
            .and_then(|x| x.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        let count = d
            .get("gifted_usernames")
            .and_then(|x| x.as_array())
            .map(|a| a.len() as f64);
        Some(mk("subgift", user, count))
    } else if event.ends_with("StreamHostEvent") {
        let user = d
            .get("host_username")
            .and_then(|x| x.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        Some(mk(
            "raid",
            user,
            d.get("number_viewers")
                .and_then(|x| x.as_u64())
                .map(|m| m as f64),
        ))
    } else {
        None
    }
}

fn kick_fragments(content: &str) -> Vec<ChatFragment> {
    let mut frags = vec![];
    let mut rest = content;
    while let Some(start) = rest.find("[emote:") {
        if start > 0 {
            frags.push(text_frag(&rest[..start]));
        }
        let after = &rest[start..];
        if let Some(end) = after.find(']') {
            let inner = &after[7..end];
            let mut it = inner.splitn(2, ':');
            let id = it.next().unwrap_or("");
            let name = it.next().unwrap_or("");
            if !id.is_empty() {
                frags.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(if name.is_empty() {
                        id.to_string()
                    } else {
                        name.to_string()
                    }),
                    url: Some(format!("https://files.kick.com/emotes/{id}/fullsize")),
                });
            }
            rest = &after[end + 1..];
        } else {
            frags.push(text_frag(after));
            rest = "";
            break;
        }
    }
    if !rest.is_empty() {
        frags.push(text_frag(rest));
    }
    if frags.is_empty() {
        frags.push(text_frag(content));
    }
    frags
}

fn kick_badges(badges: Option<&Value>) -> Vec<ChatBadge> {
    let Some(arr) = badges.and_then(|v| v.as_array()) else {
        return vec![];
    };
    arr.iter()
        .filter_map(|b| {
            let kind = b.get("type").and_then(|x| x.as_str()).unwrap_or("");
            let text = b.get("text").and_then(|x| x.as_str()).unwrap_or("");
            let label = match kind {
                "broadcaster" => "HOST".to_string(),
                "moderator" => "MOD".to_string(),
                "vip" => "VIP".to_string(),
                "subscriber" => "SUB".to_string(),
                "founder" => "FND".to_string(),
                "og" => "OG".to_string(),
                "verified" => "✓".to_string(),
                _ if !text.is_empty() => text.to_uppercase(),
                _ => return None,
            };
            let kind = if kind.is_empty() { "subscriber" } else { kind };
            Some(ChatBadge {
                label,
                kind: kind.to_string(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn kick_fragments_preserve_text_and_extract_emotes() {
        let frags = kick_fragments("oi [emote:37226:Kappa] tudo bem");
        let text: String = frags
            .iter()
            .filter(|f| f.kind == "text")
            .filter_map(|f| f.text.clone())
            .collect();
        assert_eq!(text, "oi  tudo bem");
        let emote = frags
            .iter()
            .find(|f| f.kind == "emote")
            .expect("has an emote");
        assert_eq!(emote.text.as_deref(), Some("Kappa"));
        assert_eq!(
            emote.url.as_deref(),
            Some("https://files.kick.com/emotes/37226/fullsize")
        );
    }

    #[test]
    fn kick_fragments_handle_emotes_adjacent_to_multibyte_text() {
        for case in [
            "😀[emote:1:a]",
            "[emote:1:a]😀",
            "ção[emote:1:ção]ção",
            "[emote:1:😀][emote:2:😀]",
        ] {
            let frags = kick_fragments(case);
            assert!(!frags.is_empty(), "empty for {case:?}");
        }
    }

    #[test]
    fn kick_parsers_tolerate_hostile_network_fixtures() {
        for case in crate::chat::hostile_chat_corpus() {
            let _ = parse_kick(&case, "fonte");
            let _ = parse_kick_alert(&case, "fonte");
            let frags = kick_fragments(&case);
            // An empty fragment list would hide a message instead of showing its plain-text fallback.

            assert!(
                !frags.is_empty(),
                "kick_fragments returned an empty list for {case:?}"
            );
        }
    }

    #[test]
    fn moderation_ids_come_from_the_kick_feed() {
        let kick = |sender: Value| {
            let data = json!({ "id": "kick-1", "content": "oi", "sender": sender }).to_string();
            parse_kick(
                &json!({ "event": "App\\Events\\ChatMessageEvent", "data": data }).to_string(),
                "fonte",
            )
            .expect("kick message")
            .author_id
        };
        assert_eq!(
            kick(json!({ "id": 123456, "username": "ana" })).as_deref(),
            Some("123456")
        );
        assert_eq!(
            kick(json!({ "id": "654321", "username": "ana" })).as_deref(),
            Some("654321")
        );
        assert_eq!(kick(json!({ "id": "12a", "username": "ana" })), None);
        assert_eq!(kick(json!({ "username": "ana" })), None);
    }
}
