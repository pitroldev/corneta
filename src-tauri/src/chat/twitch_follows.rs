//! Native Twitch follower alerts over an EventSub WebSocket, run locally by the app. Only Pong may
//! be sent on this socket: any other outbound frame makes Twitch close it with 4001.

use super::{emit_alert, reconnect_for, Alert, CHAT_GEN};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const FOLLOWERS_SCOPE: &str = "moderator:read:followers";
/// Subscriptions must exist within 10 s of the welcome or Twitch closes the session.
const WELCOME_WAIT: Duration = Duration::from_secs(10);
/// Older notifications are dropped, as Twitch recommends against replays.
const MAX_AGE: Duration = Duration::from_secs(600);
/// Twitch requires validating a token in use at least hourly.
const REVALIDATE_EVERY: Duration = Duration::from_secs(3600);
const SEEN_CAPACITY: usize = 512;

type Socket = WebSocket<MaybeTlsStream<TcpStream>>;

pub struct FollowChannel {
    pub login: String,
    pub label: String,
}

#[derive(Debug, PartialEq)]
enum Frame {
    Welcome {
        session_id: String,
        keepalive: Duration,
    },
    Keepalive,
    Reconnect {
        url: String,
    },
    Follow {
        message_id: String,
        sent_at: Option<DateTime<Utc>>,
        broadcaster_id: String,
        user: String,
    },
    Revocation,
    Other,
}

fn parse_frame(text: &str) -> Frame {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Frame::Other;
    };
    let metadata = &value["metadata"];
    let payload = &value["payload"];
    match metadata["message_type"].as_str() {
        Some("session_welcome") => match (
            payload["session"]["id"].as_str(),
            payload["session"]["keepalive_timeout_seconds"].as_u64(),
        ) {
            (Some(id), Some(seconds)) if !id.is_empty() => Frame::Welcome {
                session_id: id.to_string(),
                keepalive: Duration::from_secs(seconds.clamp(10, 600)),
            },
            _ => Frame::Other,
        },
        Some("session_keepalive") => Frame::Keepalive,
        Some("session_reconnect") => payload["session"]["reconnect_url"]
            .as_str()
            .filter(|url| url.starts_with("wss://"))
            .map_or(Frame::Other, |url| Frame::Reconnect {
                url: url.to_string(),
            }),
        Some("revocation") => Frame::Revocation,
        Some("notification")
            if metadata["subscription_type"].as_str() == Some("channel.follow") =>
        {
            let event = &payload["event"];
            let user = event["user_name"]
                .as_str()
                .filter(|name| !name.trim().is_empty())
                .or_else(|| event["user_login"].as_str())
                .unwrap_or_default()
                .trim();
            match (
                metadata["message_id"].as_str(),
                event["broadcaster_user_id"].as_str(),
            ) {
                (Some(message_id), Some(broadcaster_id)) if !user.is_empty() => Frame::Follow {
                    message_id: message_id.to_string(),
                    sent_at: metadata["message_timestamp"]
                        .as_str()
                        .and_then(|stamp| DateTime::parse_from_rfc3339(stamp).ok())
                        .map(|stamp| stamp.with_timezone(&Utc)),
                    broadcaster_id: broadcaster_id.to_string(),
                    user: user.chars().take(60).collect(),
                },
                _ => Frame::Other,
            }
        }
        _ => Frame::Other,
    }
}

fn fresh(sent_at: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    sent_at.is_some_and(|sent| {
        now.signed_duration_since(sent)
            .to_std()
            .map_or(true, |age| age <= MAX_AGE)
    })
}

/// Delivery is at least once and a reconnect overlaps two sockets, so remember recent IDs.
#[derive(Default)]
struct Seen {
    order: VecDeque<String>,
    ids: HashSet<String>,
}

impl Seen {
    fn first_time(&mut self, id: &str) -> bool {
        if !self.ids.insert(id.to_string()) {
            return false;
        }
        self.order.push_back(id.to_string());
        if self.order.len() > SEEN_CAPACITY {
            if let Some(oldest) = self.order.pop_front() {
                self.ids.remove(&oldest);
            }
        }
        true
    }
}

fn subscription_body(broadcaster_id: &str, moderator_id: &str, session_id: &str) -> Value {
    json!({
        "type": "channel.follow",
        "version": "2",
        "condition": {
            "broadcaster_user_id": broadcaster_id,
            "moderator_user_id": moderator_id
        },
        "transport": { "method": "websocket", "session_id": session_id }
    })
}

enum Outcome {
    /// Nothing will change until chat restarts, which a new login also triggers.
    Stop,
    Retry {
        connected: bool,
    },
}

pub fn run(channels: Vec<FollowChannel>, running: Arc<AtomicBool>, app: AppHandle, gen: u64) {
    let current = || running.load(Ordering::Relaxed) && CHAT_GEN.load(Ordering::SeqCst) == gen;
    let mut seen = Seen::default();
    let mut backoff: u32 = 15; // 200 ms ticks, as in the other chat sources.
    while current() {
        match session(&channels, &current, &app, &mut seen) {
            Outcome::Stop => return,
            Outcome::Retry { connected } => {
                if connected {
                    backoff = 15;
                }
                reconnect_for(&running, backoff);
                backoff = (backoff * 2).min(300);
            }
        }
    }
}

fn set_read_timeout(socket: &mut Socket, timeout: Duration) {
    match socket.get_mut() {
        MaybeTlsStream::Rustls(stream) => {
            let _ = stream.sock.set_read_timeout(Some(timeout));
        }
        MaybeTlsStream::Plain(stream) => {
            let _ = stream.set_read_timeout(Some(timeout));
        }
        _ => {}
    }
}

fn connect(url: &str) -> Option<Socket> {
    let (mut socket, _) = tungstenite::connect(url).ok()?;
    set_read_timeout(&mut socket, Duration::from_millis(400));
    Some(socket)
}

fn timed_out(error: &tungstenite::Error) -> bool {
    matches!(error, tungstenite::Error::Io(io) if matches!(
        io.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
    ))
}

/// Reads until the session welcome; anything else in between is ignored.
fn await_welcome(socket: &mut Socket, current: &dyn Fn() -> bool) -> Option<(String, Duration)> {
    let deadline = Instant::now() + WELCOME_WAIT;
    while current() && Instant::now() < deadline {
        match socket.read() {
            Ok(Message::Text(text)) => {
                if let Frame::Welcome {
                    session_id,
                    keepalive,
                } = parse_frame(&text)
                {
                    return Some((session_id, keepalive));
                }
            }
            Ok(Message::Close(_)) => return None,
            Ok(_) => {}
            Err(error) if timed_out(&error) => {}
            Err(_) => return None,
        }
    }
    None
}

enum Subscribed {
    Some(usize),
    Unauthorized,
    Unreachable,
}

fn subscribe(
    token: &str,
    client_id: &str,
    moderator_id: &str,
    session_id: &str,
    broadcaster_ids: &[&String],
) -> Subscribed {
    let mut accepted = 0;
    let mut transient = false;
    for broadcaster_id in broadcaster_ids {
        let body = subscription_body(broadcaster_id, moderator_id, session_id).to_string();
        let response =
            crate::http_client::post("https://api.twitch.tv/helix/eventsub/subscriptions")
                .set("Authorization", &format!("Bearer {token}"))
                .set("Client-Id", client_id)
                .set("Content-Type", "application/json")
                .timeout(Duration::from_secs(8))
                .send_string(&body);
        match response {
            // 409: this channel's subscription already exists on the session.
            Ok(_) | Err(crate::http_client::Error::Status(409, _)) => accepted += 1,
            Err(crate::http_client::Error::Status(401, _)) => return Subscribed::Unauthorized,
            // 403: the login is neither the broadcaster nor a moderator of this channel.
            Err(crate::http_client::Error::Status(status, _)) => {
                transient |= status == 429 || status >= 500;
                log::info!("twitch follows: subscription refused (HTTP {status})");
            }
            Err(_) => {
                transient = true;
                log::info!("twitch follows: subscription request failed");
            }
        }
    }
    if accepted == 0 && transient {
        Subscribed::Unreachable
    } else {
        Subscribed::Some(accepted)
    }
}

fn session(
    channels: &[FollowChannel],
    current: &dyn Fn() -> bool,
    app: &AppHandle,
    seen: &mut Seen,
) -> Outcome {
    let Some(token) = crate::auth::twitch_token(app) else {
        return Outcome::Stop;
    };
    let Some(info) = crate::auth::twitch_validate(&token) else {
        return Outcome::Retry { connected: false };
    };
    if !info.scopes.iter().any(|scope| scope == FOLLOWERS_SCOPE) {
        log::info!("twitch follows: the login lacks {FOLLOWERS_SCOPE}; reconnect Twitch to enable");
        return Outcome::Stop;
    }
    let client_id = crate::auth::twitch_client_id(app);
    let logins: Vec<String> = channels
        .iter()
        .map(|channel| channel.login.clone())
        .collect();
    let ids = crate::auth::twitch_user_ids(&token, &client_id, &logins);
    if ids.is_empty() {
        return Outcome::Retry { connected: false };
    }
    let labels: HashMap<&String, &str> = channels
        .iter()
        .filter_map(|channel| Some((ids.get(&channel.login)?, channel.label.as_str())))
        .collect();

    let Some(mut socket) = connect(EVENTSUB_URL) else {
        return Outcome::Retry { connected: false };
    };
    let Some((session_id, mut keepalive)) = await_welcome(&mut socket, current) else {
        return Outcome::Retry { connected: false };
    };
    let broadcaster_ids: Vec<&String> = labels.keys().copied().collect();
    match subscribe(
        &token,
        &client_id,
        &info.user_id,
        &session_id,
        &broadcaster_ids,
    ) {
        Subscribed::Unauthorized => return Outcome::Stop,
        Subscribed::Unreachable => {
            let _ = socket.close(None);
            return Outcome::Retry { connected: false };
        }
        // Without one accepted subscription Twitch would keep closing the socket with 4003.
        Subscribed::Some(0) => return Outcome::Stop,
        Subscribed::Some(_) => {}
    }

    let mut last_activity = Instant::now();
    let mut validated_at = Instant::now();
    loop {
        if !current() {
            let _ = socket.close(None);
            return Outcome::Stop;
        }
        // Only notifications and keepalives prove the session alive; pings do not.
        if last_activity.elapsed() > keepalive + Duration::from_secs(5) {
            return Outcome::Retry { connected: true };
        }
        if validated_at.elapsed() > REVALIDATE_EVERY {
            if crate::auth::twitch_validate(&token).is_none() {
                return Outcome::Retry { connected: true };
            }
            validated_at = Instant::now();
        }
        match socket.read() {
            Ok(Message::Text(text)) => match parse_frame(&text) {
                Frame::Keepalive => last_activity = Instant::now(),
                Frame::Follow {
                    message_id,
                    sent_at,
                    broadcaster_id,
                    user,
                } => {
                    last_activity = Instant::now();
                    let Some(label) = labels.get(&broadcaster_id) else {
                        continue;
                    };
                    if seen.first_time(&message_id) && fresh(sent_at, Utc::now()) && current() {
                        emit_alert(
                            app,
                            Alert {
                                id: format!("twitch-follow-{message_id}"),
                                platform: "twitch".into(),
                                source: (*label).to_string(),
                                kind: "follow".into(),
                                user,
                                amount: None,
                                currency: None,
                                tier: None,
                                message: None,
                                fragments: Vec::new(),
                                ts: super::now_ms(),
                            },
                        );
                    }
                }
                // Subscriptions move to the new session; read it before dropping the old one.
                Frame::Reconnect { url } => {
                    let Some(mut next) = connect(&url) else {
                        return Outcome::Retry { connected: true };
                    };
                    let Some((_, next_keepalive)) = await_welcome(&mut next, current) else {
                        return Outcome::Retry { connected: true };
                    };
                    let _ = socket.close(None);
                    socket = next;
                    keepalive = next_keepalive;
                    last_activity = Instant::now();
                }
                // Revocations arrive once; resubscribing in a loop is discouraged.
                Frame::Revocation => return Outcome::Stop,
                Frame::Welcome { .. } | Frame::Other => {}
            },
            Ok(Message::Close(_)) => return Outcome::Retry { connected: true },
            Ok(_) => {}
            Err(error) if timed_out(&error) => {}
            Err(_) => return Outcome::Retry { connected: true },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notification(message_id: &str, stamp: &str) -> String {
        json!({
            "metadata": {
                "message_id": message_id,
                "message_type": "notification",
                "message_timestamp": stamp,
                "subscription_type": "channel.follow",
                "subscription_version": "2"
            },
            "payload": {
                "subscription": { "type": "channel.follow" },
                "event": {
                    "user_id": "1234",
                    "user_login": "cool_user",
                    "user_name": "Cool_User",
                    "broadcaster_user_id": "1337",
                    "broadcaster_user_login": "cooler_user",
                    "broadcaster_user_name": "Cooler_User",
                    "followed_at": stamp
                }
            }
        })
        .to_string()
    }

    #[test]
    fn eventsub_frames_are_read_by_type() {
        let welcome = json!({
            "metadata": { "message_type": "session_welcome" },
            "payload": { "session": { "id": "AQoQexAWVYKSTIu4ec_2VAxyuhAB", "keepalive_timeout_seconds": 10 } }
        });
        assert_eq!(
            parse_frame(&welcome.to_string()),
            Frame::Welcome {
                session_id: "AQoQexAWVYKSTIu4ec_2VAxyuhAB".into(),
                keepalive: Duration::from_secs(10)
            }
        );
        let keepalive =
            json!({ "metadata": { "message_type": "session_keepalive" }, "payload": {} });
        assert_eq!(parse_frame(&keepalive.to_string()), Frame::Keepalive);
        let reconnect = json!({
            "metadata": { "message_type": "session_reconnect" },
            "payload": { "session": { "reconnect_url": "wss://eventsub.wss.twitch.tv/ws?id=abc" } }
        });
        assert_eq!(
            parse_frame(&reconnect.to_string()),
            Frame::Reconnect {
                url: "wss://eventsub.wss.twitch.tv/ws?id=abc".into()
            }
        );
        let insecure = reconnect.to_string().replace("wss://", "ws://");
        assert_eq!(parse_frame(&insecure), Frame::Other);
        assert_eq!(parse_frame("not json"), Frame::Other);

        let Frame::Follow {
            message_id,
            broadcaster_id,
            user,
            sent_at,
        } = parse_frame(&notification("befa7b53", "2023-07-19T14:56:51.634234626Z"))
        else {
            panic!("follow notification");
        };
        assert_eq!(message_id, "befa7b53");
        assert_eq!(broadcaster_id, "1337");
        assert_eq!(user, "Cool_User");
        assert!(sent_at.is_some());
    }

    #[test]
    fn duplicates_and_stale_notifications_are_dropped() {
        let mut seen = Seen::default();
        assert!(seen.first_time("a"));
        assert!(!seen.first_time("a"));
        for index in 0..SEEN_CAPACITY {
            assert!(seen.first_time(&format!("id-{index}")));
        }
        assert!(
            seen.first_time("a"),
            "the oldest ID is forgotten past the cap"
        );

        let now = DateTime::parse_from_rfc3339("2026-10-18T22:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let at = |stamp: &str| {
            Some(
                DateTime::parse_from_rfc3339(stamp)
                    .unwrap()
                    .with_timezone(&Utc),
            )
        };
        assert!(fresh(at("2026-10-18T21:55:00Z"), now));
        assert!(!fresh(at("2026-10-18T21:49:00Z"), now));
        assert!(
            fresh(at("2026-10-18T22:00:30Z"), now),
            "slight clock skew is fine"
        );
        assert!(!fresh(None, now));
    }

    #[test]
    fn the_subscription_targets_this_session_as_a_moderator() {
        let body = subscription_body("1337", "42", "session-1");
        assert_eq!(body["type"], "channel.follow");
        assert_eq!(body["version"], "2");
        assert_eq!(body["condition"]["broadcaster_user_id"], "1337");
        assert_eq!(body["condition"]["moderator_user_id"], "42");
        assert_eq!(body["transport"]["method"], "websocket");
        assert_eq!(body["transport"]["session_id"], "session-1");
    }
}
