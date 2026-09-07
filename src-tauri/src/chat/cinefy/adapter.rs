//! Cinefy's undocumented REST and Pusher contracts are isolated behind OutputPort.

use super::domain::{Badge, ChatMessage, ConnectionStatus, Event};
use super::ports::OutputPort;
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tungstenite::Message;

use crate::http_client as ureq;

const CONSTANTS_URL: &str = "https://cinefy.gg/api/constants?v=v1.0.1";
const FALLBACK_API_URL: &str = "https://api.cinefy.gg";
const FALLBACK_PUSHER_KEY: &str = "69544a8f3c11bd825651";
const FALLBACK_PUSHER_CLUSTER: &str = "sa1";
const MAX_SLUG_LEN: usize = 64;

#[derive(Debug)]
struct RuntimeConfig {
    api_url: String,
    pusher_key: String,
    pusher_cluster: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            api_url: FALLBACK_API_URL.into(),
            pusher_key: FALLBACK_PUSHER_KEY.into(),
            pusher_cluster: FALLBACK_PUSHER_CLUSTER.into(),
        }
    }
}

/// Reuse the web client's runtime constants, with fallbacks for auxiliary-endpoint outages.
fn runtime_config() -> RuntimeConfig {
    ureq::get(CONSTANTS_URL)
        .timeout(Duration::from_secs(6))
        .set("Accept", "application/json")
        .call()
        .ok()
        .and_then(|r| r.into_string().ok())
        .and_then(|body| decode_runtime_config(&body))
        .unwrap_or_default()
}

fn decode_runtime_config(body: &str) -> Option<RuntimeConfig> {
    let encoded = serde_json::from_str::<String>(body).ok()?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    let v = serde_json::from_slice::<Value>(&bytes).ok()?;
    Some(RuntimeConfig {
        api_url: v
            .get("apiUrl")
            .and_then(Value::as_str)
            // Remote configuration must not turn this client into an arbitrary-origin fetcher.
            .filter(|s| s.trim_end_matches('/') == FALLBACK_API_URL)
            .unwrap_or(FALLBACK_API_URL)
            .trim_end_matches('/')
            .to_string(),
        pusher_key: v
            .get("pusherKey")
            .and_then(Value::as_str)
            .filter(|s| {
                !s.is_empty() && s.len() <= 128 && s.chars().all(|c| c.is_ascii_alphanumeric())
            })
            .unwrap_or(FALLBACK_PUSHER_KEY)
            .to_string(),
        pusher_cluster: v
            .get("pusherCluster")
            .and_then(Value::as_str)
            .filter(|s| {
                !s.is_empty()
                    && s.len() <= 32
                    && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            })
            .unwrap_or(FALLBACK_PUSHER_CLUSTER)
            .to_string(),
    })
}

fn normalize_slug(input: &str) -> Option<String> {
    let without_query = input.trim().split(['?', '#']).next()?.trim_end_matches('/');
    let path = if let Some((_, rest)) = without_query.split_once("://") {
        let rest = rest.strip_prefix("www.").unwrap_or(rest);
        rest.strip_prefix("cinefy.gg/")?
    } else if let Some(rest) = without_query.strip_prefix("www.cinefy.gg/") {
        rest
    } else if let Some(rest) = without_query.strip_prefix("cinefy.gg/") {
        rest
    } else {
        without_query
    };
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let candidate = if parts
        .first()
        .is_some_and(|p| p.eq_ignore_ascii_case("popout"))
    {
        parts.get(1).copied()
    } else {
        parts.first().copied()
    }?
    .trim_start_matches('@')
    .to_ascii_lowercase();
    (!candidate.is_empty()
        && candidate.len() <= MAX_SLUG_LEN
        && candidate
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')))
    .then_some(candidate)
}

fn get_json(url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .timeout(Duration::from_secs(8))
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Corneta/1",
        )
        .set("Accept", "application/json")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn resolve_channel_id(api_url: &str, slug: &str) -> Option<String> {
    get_json(&format!("{api_url}/v1/user/{slug}"))?
        .get("id")?
        .as_str()
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 128
                && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        .map(String::from)
}

fn fetch_history(api_url: &str, channel_id: &str) -> Vec<Value> {
    let mut threads = get_json(&format!(
        "{api_url}/v1/threads?contextType=live&contextId={channel_id}&perPage=75"
    ))
    .and_then(|v| v.get("data").and_then(Value::as_array).cloned())
    .unwrap_or_default();
    threads.sort_by(|a, b| {
        a.get("publishedAt")
            .and_then(Value::as_str)
            .cmp(&b.get("publishedAt").and_then(Value::as_str))
    });
    threads
}

fn pusher_data(frame: &Value) -> Option<Value> {
    match frame.get("data")? {
        Value::String(raw) => serde_json::from_str(raw).ok(),
        value @ Value::Object(_) => Some(value.clone()),
        _ => None,
    }
}

fn pusher_event_is(raw: &str, expected: &str) -> bool {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|frame| Some(frame.get("event")?.as_str()? == expected))
        .unwrap_or(false)
}

fn subscription_succeeded(raw: &str, channel: &str) -> bool {
    serde_json::from_str::<Value>(raw)
        .ok()
        .map(|frame| {
            frame.get("event").and_then(Value::as_str)
                == Some("pusher_internal:subscription_succeeded")
                && frame.get("channel").and_then(Value::as_str) == Some(channel)
        })
        .unwrap_or(false)
}

fn safe_color(value: Option<&Value>) -> Option<String> {
    let color = value?.as_str()?;
    let hex = color.strip_prefix('#')?;
    ([3, 6, 8].contains(&hex.len()) && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .then(|| color.to_string())
}

fn badge(value: &Value) -> Option<Badge> {
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let (label, kind) = match id.as_str() {
        "creator" | "verified" => ("✓".into(), "partner".into()),
        "moderator" | "mod" => ("MOD".into(), "moderator".into()),
        "subscriber" | "sub" => ("SUB".into(), "subscriber".into()),
        _ if !name.is_empty() => (
            name.chars().take(10).collect::<String>().to_uppercase(),
            "subscriber".into(),
        ),
        _ => return None,
    };
    Some(Badge { label, kind })
}

fn parse_thread(thread: &Value) -> Option<ChatMessage> {
    let native_id = thread.get("id")?.as_str()?.to_string();
    let text = thread.get("content")?.as_str()?.to_string();
    if native_id.is_empty() || text.is_empty() {
        return None;
    }
    let author = thread.get("author")?;
    let username = author
        .get("displayName")
        .or_else(|| author.get("username"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("anon")
        .to_string();
    let published_at_ms = thread
        .get("publishedAt")
        .and_then(Value::as_str)
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis().max(0) as u64)
        .unwrap_or(0);
    Some(ChatMessage {
        native_id,
        author: username,
        author_id: author.get("id").and_then(Value::as_str).map(String::from),
        color: safe_color(author.pointer("/preferences/color")),
        text,
        badges: author
            .get("badges")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(badge).collect())
            .unwrap_or_default(),
        published_at_ms,
    })
}

fn parse_event(raw: &str) -> Option<Event> {
    let frame: Value = serde_json::from_str(raw).ok()?;
    match frame.get("event")?.as_str()? {
        "ThreadCreated" => parse_thread(&pusher_data(&frame)?).map(Event::Message),
        "ThreadDeleted" | "ThreadFailure" => {
            let data = pusher_data(&frame)?;
            data.get("threadId")
                .or_else(|| data.get("id"))
                .or_else(|| data.pointer("/thread/id"))
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .map(|native_id| Event::DeleteMessage {
                    native_id: native_id.to_string(),
                })
        }
        _ => None,
    }
}

pub(crate) fn run(input: &str, running: Arc<AtomicBool>, sink: &dyn OutputPort) -> bool {
    let Some(slug) = normalize_slug(input) else {
        sink.status(ConnectionStatus::Error);
        return false;
    };
    let config = runtime_config();
    let Some(channel_id) = resolve_channel_id(&config.api_url, &slug) else {
        log::warn!("cinefy chat: could not resolve channel {slug}");
        sink.status(ConnectionStatus::Error);
        return false;
    };
    let websocket_url = format!(
        "wss://ws-{}.pusher.com/app/{}?protocol=7&client=corneta&version=1.0&flash=false",
        config.pusher_cluster, config.pusher_key
    );
    let mut socket = match tungstenite::connect(websocket_url.as_str()) {
        Ok((socket, _)) => socket,
        Err(error) => {
            log::warn!("cinefy chat: Pusher connection failed: {error}");
            sink.status(ConnectionStatus::Error);
            return false;
        }
    };
    if let tungstenite::stream::MaybeTlsStream::Rustls(stream) = socket.get_mut() {
        let _ = stream
            .sock
            .set_read_timeout(Some(Duration::from_millis(400)));
    }
    let channel = format!("chatroom.{channel_id}");
    if socket
        .send(Message::Text(
            json!({
                "event": "pusher:subscribe",
                "data": { "auth": "", "channel": channel }
            })
            .to_string()
            .into(),
        ))
        .is_err()
    {
        sink.status(ConnectionStatus::Error);
        return false;
    }

    let mut seen = HashSet::new();

    // TCP/WebSocket acceptance is not channel authorization; wait for the expected subscription ack.
    let subscribe_deadline = Instant::now() + Duration::from_secs(8);
    let mut subscribed = false;
    while running.load(Ordering::Relaxed) && Instant::now() < subscribe_deadline {
        match socket.read() {
            Ok(Message::Text(raw)) if subscription_succeeded(raw.as_str(), &channel) => {
                subscribed = true;
                break;
            }
            Ok(Message::Text(raw)) if pusher_event_is(raw.as_str(), "pusher:ping") => {
                let _ = socket.send(Message::Text(
                    "{\"event\":\"pusher:pong\",\"data\":{}}".into(),
                ));
            }
            Ok(Message::Text(raw)) if pusher_event_is(raw.as_str(), "pusher:error") => break,
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(error))
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(_) => break,
        }
    }
    if !subscribed {
        let _ = socket.close(None);
        sink.status(if running.load(Ordering::Relaxed) {
            ConnectionStatus::Error
        } else {
            ConnectionStatus::Disconnected
        });
        return false;
    }

    sink.status(ConnectionStatus::Connected);
    for thread in fetch_history(&config.api_url, &channel_id) {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        if let Some(message) = parse_thread(&thread) {
            if seen.insert(message.native_id.clone()) {
                sink.publish(Event::Message(message));
            }
        }
    }

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(raw)) => {
                let raw = raw.as_str();
                if pusher_event_is(raw, "pusher:ping") {
                    let _ = socket.send(Message::Text(
                        "{\"event\":\"pusher:pong\",\"data\":{}}".into(),
                    ));
                    continue;
                }
                if let Some(event) = parse_event(raw) {
                    match &event {
                        Event::Message(message) if !seen.insert(message.native_id.clone()) => {}
                        _ => sink.publish(event),
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(error))
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(_) => break,
        }
    }
    let _ = socket.close(None);
    sink.status(ConnectionStatus::Disconnected);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn thread() -> Value {
        json!({
            "id": "PmiEPpZwe9LdM",
            "content": "galera",
            "publishedAt": "2026-08-31T22:48:50.813Z",
            "author": {
                "id": "53660e03-ebc3-4888-879d-058c5b876ef2",
                "username": "kett",
                "displayName": "Kett",
                "preferences": { "color": "#d2a70b" },
                "badges": [{ "id": "creator", "name": "Criador verificado" }]
            }
        })
    }

    fn constants_body(value: Value) -> String {
        let encoded = base64::engine::general_purpose::STANDARD.encode(value.to_string());
        serde_json::to_string(&encoded).unwrap()
    }

    #[test]
    fn runtime_constants_reject_unsafe_origins_and_identifiers() {
        let config = decode_runtime_config(&constants_body(json!({
            "apiUrl": "https://api.cinefy.gg/",
            "pusherKey": "novaChave123",
            "pusherCluster": "sa1"
        })))
        .expect("valid runtime constants");
        assert_eq!(config.api_url, FALLBACK_API_URL);
        assert_eq!(config.pusher_key, "novaChave123");
        assert_eq!(config.pusher_cluster, "sa1");

        let guarded = decode_runtime_config(&constants_body(json!({
            "apiUrl": "https://example.com",
            "pusherKey": "chave/com/barra",
            "pusherCluster": "sa1.example.com"
        })))
        .expect("JSON and Base64 remain valid");
        assert_eq!(guarded.api_url, FALLBACK_API_URL);
        assert_eq!(guarded.pusher_key, FALLBACK_PUSHER_KEY);
        assert_eq!(guarded.pusher_cluster, FALLBACK_PUSHER_CLUSTER);
        assert!(decode_runtime_config("não é json").is_none());
    }

    #[test]
    fn normalizes_slugs_and_popout_urls() {
        assert_eq!(normalize_slug("@Kett"), Some("kett".into()));
        assert_eq!(
            normalize_slug("https://cinefy.gg/popout/kett/chat?type=overlay"),
            Some("kett".into())
        );
        assert_eq!(normalize_slug("https://example.com/x"), None);
        assert_eq!(normalize_slug(&"a".repeat(MAX_SLUG_LEN + 1)), None);
    }

    #[test]
    fn thread_parsing_exposes_only_domain_fields() {
        let message = parse_thread(&thread()).expect("valid thread");
        assert_eq!(message.native_id, "PmiEPpZwe9LdM");
        assert_eq!(message.author, "Kett");
        assert_eq!(message.text, "galera");
        assert_eq!(message.color.as_deref(), Some("#d2a70b"));
        assert_eq!(message.badges[0].kind, "partner");
        assert_eq!(message.published_at_ms, 1_788_216_530_813);
    }

    #[test]
    fn pusher_events_accept_string_or_object_data() {
        let created = json!({
            "event": "ThreadCreated",
            "data": thread().to_string()
        });
        assert!(matches!(
            parse_event(&created.to_string()),
            Some(Event::Message(_))
        ));
        let deleted = json!({
            "event": "ThreadDeleted",
            "data": { "threadId": "PmiEPpZwe9LdM" }
        });
        assert_eq!(
            parse_event(&deleted.to_string()),
            Some(Event::DeleteMessage {
                native_id: "PmiEPpZwe9LdM".into()
            })
        );

        // ThreadFailure uses id, unlike ThreadDeleted's threadId.
        let failed = json!({
            "event": "ThreadFailure",
            "data": { "id": "PmiEPpZwe9LdM" }
        });
        assert_eq!(
            parse_event(&failed.to_string()),
            Some(Event::DeleteMessage {
                native_id: "PmiEPpZwe9LdM".into()
            })
        );
    }

    #[test]
    fn subscription_ack_must_match_the_expected_channel() {
        let expected = "chatroom.53660e03-ebc3-4888-879d-058c5b876ef2";
        let ok = json!({
            "event": "pusher_internal:subscription_succeeded",
            "channel": expected,
            "data": {}
        });
        assert!(subscription_succeeded(&ok.to_string(), expected));
        assert!(!subscription_succeeded(&ok.to_string(), "chatroom.outro"));
        assert!(!subscription_succeeded("não é json", expected));
    }

    #[test]
    fn parser_rejects_hostile_input_without_panicking() {
        for raw in [
            "",
            "[]",
            "null",
            "não é json",
            r#"{"event":"ThreadCreated"}"#,
        ] {
            let _ = parse_event(raw);
        }
        let mut malformed = thread();
        malformed["author"]["preferences"]["color"] = Value::String("url(javascript:x)".into());
        assert_eq!(parse_thread(&malformed).unwrap().color, None);
    }
}
