//! Twitch events that IRC does not carry, over an EventSub WebSocket run locally by the app:
//! follows, channel points, polls, predictions, Hype Trains and shared chat. Only Pong may be
//! sent on this socket: any other outbound frame makes Twitch close it with 4001.

use crate::chat::{
    emit_alert, emit_chat_gen, emit_poll, next_id, reconnect_for, rich_text_frags, Alert,
    ChatMessage, Poll, PollOption, CHAT_GEN,
};
use crate::i18n::Msg;
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

/// One subscription: type, version, the scope it needs, and whether only the channel owner may hold it.
struct Topic {
    kind: &'static str,
    version: &'static str,
    scope: Option<&'static str>,
    owner_only: bool,
}

const TOPICS: [Topic; 13] = [
    Topic {
        kind: "channel.follow",
        version: "2",
        scope: Some("moderator:read:followers"),
        owner_only: false,
    },
    Topic {
        kind: "channel.shared_chat.begin",
        version: "1",
        scope: None,
        owner_only: false,
    },
    Topic {
        kind: "channel.shared_chat.end",
        version: "1",
        scope: None,
        owner_only: false,
    },
    Topic {
        kind: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        scope: Some("channel:read:redemptions"),
        owner_only: true,
    },
    Topic {
        kind: "channel.poll.begin",
        version: "1",
        scope: Some("channel:read:polls"),
        owner_only: true,
    },
    Topic {
        kind: "channel.poll.progress",
        version: "1",
        scope: Some("channel:read:polls"),
        owner_only: true,
    },
    Topic {
        kind: "channel.poll.end",
        version: "1",
        scope: Some("channel:read:polls"),
        owner_only: true,
    },
    Topic {
        kind: "channel.prediction.begin",
        version: "1",
        scope: Some("channel:read:predictions"),
        owner_only: true,
    },
    Topic {
        kind: "channel.prediction.progress",
        version: "1",
        scope: Some("channel:read:predictions"),
        owner_only: true,
    },
    Topic {
        kind: "channel.prediction.lock",
        version: "1",
        scope: Some("channel:read:predictions"),
        owner_only: true,
    },
    Topic {
        kind: "channel.prediction.end",
        version: "1",
        scope: Some("channel:read:predictions"),
        owner_only: true,
    },
    Topic {
        kind: "channel.hype_train.begin",
        version: "2",
        scope: Some("channel:read:hype_train"),
        owner_only: true,
    },
    Topic {
        kind: "channel.hype_train.end",
        version: "2",
        scope: Some("channel:read:hype_train"),
        owner_only: true,
    },
];

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
    Notification {
        message_id: String,
        sent_at: Option<DateTime<Utc>>,
        kind: String,
        broadcaster_id: String,
        event: Value,
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
        Some("notification") => {
            let event = &payload["event"];
            match (
                metadata["message_id"].as_str(),
                metadata["subscription_type"].as_str(),
                event["broadcaster_user_id"].as_str(),
            ) {
                (Some(message_id), Some(kind), Some(broadcaster_id)) => Frame::Notification {
                    message_id: message_id.to_string(),
                    sent_at: metadata["message_timestamp"]
                        .as_str()
                        .and_then(|stamp| DateTime::parse_from_rfc3339(stamp).ok())
                        .map(|stamp| stamp.with_timezone(&Utc)),
                    kind: kind.to_string(),
                    broadcaster_id: broadcaster_id.to_string(),
                    event: event.clone(),
                },
                _ => Frame::Other,
            }
        }
        _ => Frame::Other,
    }
}

/// What a notification shows: an alert, the poll or prediction on screen, or a chat notice.
#[derive(Debug)]
enum Shown {
    Alert(Alert),
    Poll(Option<Poll>),
    Notice(String),
}

fn name_of(event: &Value, prefix: &str) -> String {
    let name = event[format!("{prefix}_name")]
        .as_str()
        .filter(|name| !name.trim().is_empty())
        .or_else(|| event[format!("{prefix}_login")].as_str())
        .unwrap_or_default()
        .trim();
    name.chars().take(60).collect()
}

fn alert(kind: &str, user: String, source: &str) -> Alert {
    Alert {
        id: next_id(),
        platform: "twitch".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        ts: crate::chat::now_ms(),
        ..Default::default()
    }
}

fn shown(kind: &str, event: &Value, source: &str) -> Option<Shown> {
    let text = |path: &str| {
        event
            .pointer(path)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
    };
    match kind {
        "channel.follow" => {
            let user = name_of(event, "user");
            (!user.is_empty()).then(|| Shown::Alert(alert("follow", user, source)))
        }
        "channel.channel_points_custom_reward_redemption.add" => Some(Shown::Alert(Alert {
            title: text("/reward/title").map(String::from),
            message: text("/user_input").map(String::from),
            fragments: text("/user_input").map(rich_text_frags).unwrap_or_default(),
            ..alert("reward", name_of(event, "user"), source)
        })),
        "channel.poll.begin" | "channel.poll.progress" | "channel.poll.end" => {
            // An archived poll leaves the screen; a finished one stays with its result.
            if text("/status") == Some("archived") {
                return Some(Shown::Poll(None));
            }
            let options: Vec<PollOption> = event["choices"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|c| PollOption {
                    label: c["title"].as_str().unwrap_or_default().to_string(),
                    votes: c["votes"].as_u64(),
                    percent: None,
                })
                .collect();
            Some(Shown::Poll(Some(Poll {
                id: text("/id").unwrap_or("poll").to_string(),
                kind: "poll".into(),
                question: text("/title").unwrap_or_default().to_string(),
                total: options.iter().map(|o| o.votes).sum(),
                ended: kind == "channel.poll.end",
                options,
            })))
        }
        "channel.prediction.begin"
        | "channel.prediction.progress"
        | "channel.prediction.lock"
        | "channel.prediction.end" => {
            let options: Vec<PollOption> = event["outcomes"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|o| PollOption {
                    label: o["title"].as_str().unwrap_or_default().to_string(),
                    votes: o["users"].as_u64(),
                    percent: None,
                })
                .collect();
            Some(Shown::Poll(Some(Poll {
                id: text("/id").unwrap_or("prediction").to_string(),
                kind: "prediction".into(),
                question: text("/title").unwrap_or_default().to_string(),
                total: options.iter().map(|o| o.votes).sum(),
                ended: kind == "channel.prediction.end",
                options,
            })))
        }
        "channel.hype_train.begin" => Some(Shown::Notice(
            Msg::ChatHypeTrainStarted {
                level: &event["level"].as_u64().unwrap_or(1).to_string(),
            }
            .now(),
        )),
        "channel.hype_train.end" => Some(Shown::Notice(
            Msg::ChatHypeTrainEnded {
                level: &event["level"].as_u64().unwrap_or(1).to_string(),
            }
            .now(),
        )),
        "channel.shared_chat.begin" => {
            let names: Vec<String> = event["participants"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|p| name_of(p, "broadcaster_user"))
                .filter(|n| !n.is_empty())
                .collect();
            Some(Shown::Notice(
                Msg::ChatSharedChatStarted {
                    channels: &names.join(", "),
                }
                .now(),
            ))
        }
        "channel.shared_chat.end" => Some(Shown::Notice(Msg::ChatSharedChatEnded.now())),
        _ => None,
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

fn subscription_body(
    topic: &Topic,
    broadcaster_id: &str,
    moderator_id: &str,
    session_id: &str,
) -> Value {
    let condition = if topic.kind == "channel.follow" {
        json!({ "broadcaster_user_id": broadcaster_id, "moderator_user_id": moderator_id })
    } else {
        json!({ "broadcaster_user_id": broadcaster_id })
    };
    json!({
        "type": topic.kind,
        "version": topic.version,
        "condition": condition,
        "transport": { "method": "websocket", "session_id": session_id }
    })
}

/// The subscriptions this login may hold for one channel.
fn topics_for<'a>(granted: &[String], own_channel: bool) -> Vec<&'a Topic> {
    TOPICS
        .iter()
        .filter(|t| !t.owner_only || own_channel)
        .filter(|t| {
            t.scope
                .is_none_or(|scope| granted.iter().any(|g| g == scope))
        })
        .collect()
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
        match session(&channels, &current, &app, gen, &mut seen) {
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
    user_id: &str,
    granted: &[String],
    session_id: &str,
    broadcaster_ids: &[&String],
) -> Subscribed {
    let mut accepted = 0;
    let mut transient = false;
    for broadcaster_id in broadcaster_ids {
        for topic in topics_for(granted, *broadcaster_id == user_id) {
            let body = subscription_body(topic, broadcaster_id, user_id, session_id).to_string();
            let response =
                crate::http_client::post("https://api.twitch.tv/helix/eventsub/subscriptions")
                    .set("Authorization", &format!("Bearer {token}"))
                    .set("Client-Id", client_id)
                    .set("Content-Type", "application/json")
                    .timeout(Duration::from_secs(8))
                    .send_string(&body);
            match response {
                // 409: this subscription already exists on the session.
                Ok(_) | Err(crate::http_client::Error::Status(409, _)) => accepted += 1,
                Err(crate::http_client::Error::Status(401, _)) => return Subscribed::Unauthorized,
                // 403: the login is neither the broadcaster nor a moderator of this channel.
                Err(crate::http_client::Error::Status(status, _)) => {
                    transient |= status == 429 || status >= 500;
                    log::info!("twitch eventsub: {} refused (HTTP {status})", topic.kind);
                }
                Err(_) => {
                    transient = true;
                    log::info!("twitch eventsub: {} request failed", topic.kind);
                }
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
    gen: u64,
    seen: &mut Seen,
) -> Outcome {
    let Some(token) = super::account::twitch_token(app) else {
        return Outcome::Stop;
    };
    let Some(info) = super::account::twitch_validate(&token) else {
        return Outcome::Retry { connected: false };
    };
    let client_id = super::account::twitch_client_id(app);
    let logins: Vec<String> = channels
        .iter()
        .map(|channel| channel.login.clone())
        .collect();
    let ids = super::account::twitch_user_ids(&token, &client_id, &logins);
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
        &info.scopes,
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
            if super::account::twitch_validate(&token).is_none() {
                return Outcome::Retry { connected: true };
            }
            validated_at = Instant::now();
        }
        match socket.read() {
            Ok(Message::Text(text)) => match parse_frame(&text) {
                Frame::Keepalive => last_activity = Instant::now(),
                Frame::Notification {
                    message_id,
                    sent_at,
                    kind,
                    broadcaster_id,
                    event,
                } => {
                    last_activity = Instant::now();
                    let Some(label) = labels.get(&broadcaster_id) else {
                        continue;
                    };
                    if !seen.first_time(&message_id) || !fresh(sent_at, Utc::now()) || !current() {
                        continue;
                    }
                    match shown(&kind, &event, label) {
                        Some(Shown::Alert(mut alert)) => {
                            alert.id = format!("twitch-{kind}-{message_id}");
                            emit_alert(app, alert);
                        }
                        Some(Shown::Poll(poll)) => emit_poll(app, gen, "twitch", label, poll),
                        Some(Shown::Notice(text)) => emit_chat_gen(
                            app,
                            gen,
                            ChatMessage {
                                id: next_id(),
                                platform: "twitch".into(),
                                source: (*label).to_string(),
                                fragments: rich_text_frags(&text),
                                text,
                                ts: crate::chat::now_ms(),
                                system: true,
                                ..Default::default()
                            },
                        ),
                        None => {}
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

    fn notification(kind: &str, message_id: &str, stamp: &str, event: Value) -> String {
        json!({
            "metadata": {
                "message_id": message_id,
                "message_type": "notification",
                "message_timestamp": stamp,
                "subscription_type": kind,
                "subscription_version": "1"
            },
            "payload": { "subscription": { "type": kind }, "event": event }
        })
        .to_string()
    }

    fn follow(message_id: &str, stamp: &str) -> String {
        notification(
            "channel.follow",
            message_id,
            stamp,
            json!({
                "user_id": "1234",
                "user_login": "cool_user",
                "user_name": "Cool_User",
                "broadcaster_user_id": "1337",
                "broadcaster_user_login": "cooler_user",
                "broadcaster_user_name": "Cooler_User",
                "followed_at": stamp
            }),
        )
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

        let Frame::Notification {
            message_id,
            broadcaster_id,
            kind,
            event,
            sent_at,
        } = parse_frame(&follow("befa7b53", "2023-07-19T14:56:51.634234626Z"))
        else {
            panic!("follow notification");
        };
        assert_eq!(
            (message_id.as_str(), kind.as_str()),
            ("befa7b53", "channel.follow")
        );
        assert_eq!(broadcaster_id, "1337");
        assert!(sent_at.is_some());
        let Some(Shown::Alert(alert)) = shown(&kind, &event, "canal") else {
            panic!("follow alert");
        };
        assert_eq!(
            (alert.kind.as_str(), alert.user.as_str()),
            ("follow", "Cool_User")
        );
    }

    #[test]
    fn redemptions_polls_predictions_and_notices() {
        let Some(Shown::Alert(reward)) = shown(
            "channel.channel_points_custom_reward_redemption.add",
            &json!({ "user_name": "Ana", "user_input": "toca essa", "reward": { "title": "Pedir música" } }),
            "canal",
        ) else {
            panic!("reward");
        };
        assert_eq!(
            (reward.kind.as_str(), reward.title.as_deref()),
            ("reward", Some("Pedir música"))
        );
        let Some(Shown::Poll(Some(poll))) = shown(
            "channel.poll.end",
            &json!({ "id": "p", "title": "Qual?", "status": "completed",
                "choices": [{ "title": "A", "votes": 3 }, { "title": "B", "votes": 2 }] }),
            "canal",
        ) else {
            panic!("poll");
        };
        assert_eq!((poll.total, poll.ended), (Some(5), true));
        assert!(matches!(
            shown(
                "channel.poll.end",
                &json!({ "status": "archived" }),
                "canal"
            ),
            Some(Shown::Poll(None))
        ));
        let Some(Shown::Poll(Some(prediction))) = shown(
            "channel.prediction.lock",
            &json!({ "id": "x", "title": "Ganha?", "outcomes": [{ "title": "Sim", "users": 10 }, { "title": "Não", "users": 4 }] }),
            "canal",
        ) else {
            panic!("prediction");
        };
        assert_eq!(
            (prediction.kind.as_str(), prediction.ended),
            ("prediction", false)
        );
        assert!(matches!(
            shown("channel.hype_train.begin", &json!({ "level": 2 }), "canal"),
            Some(Shown::Notice(_))
        ));
        assert!(matches!(
            shown(
                "channel.shared_chat.begin",
                &json!({ "participants": [{ "broadcaster_user_name": "Ana" }, { "broadcaster_user_name": "Bia" }] }),
                "canal"
            ),
            Some(Shown::Notice(text)) if text.contains("Ana, Bia")
        ));
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
    fn subscriptions_depend_on_scopes_and_channel_ownership() {
        let follow = &TOPICS[0];
        let body = subscription_body(follow, "1337", "42", "session-1");
        assert_eq!(body["type"], "channel.follow");
        assert_eq!(body["version"], "2");
        assert_eq!(body["condition"]["broadcaster_user_id"], "1337");
        assert_eq!(body["condition"]["moderator_user_id"], "42");
        assert_eq!(body["transport"]["session_id"], "session-1");
        let poll = subscription_body(&TOPICS[4], "1337", "42", "s");
        assert!(poll["condition"].get("moderator_user_id").is_none());

        let granted = vec![
            "moderator:read:followers".to_string(),
            "channel:read:polls".to_string(),
        ];
        let other: Vec<&str> = topics_for(&granted, false).iter().map(|t| t.kind).collect();
        assert_eq!(
            other,
            [
                "channel.follow",
                "channel.shared_chat.begin",
                "channel.shared_chat.end"
            ]
        );
        let own: Vec<&str> = topics_for(&granted, true).iter().map(|t| t.kind).collect();
        assert!(own.contains(&"channel.poll.begin"));
        assert!(!own.contains(&"channel.prediction.begin"));
    }
}
