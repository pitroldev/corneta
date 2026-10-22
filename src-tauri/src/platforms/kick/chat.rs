//! Kick chat over its Pusher WebSocket: messages, replies, alerts, pins, polls, predictions and modes.

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tungstenite::Message;

use crate::chat::{
    chat_status_gen, clear_source, delete_message, delete_user, emit_alert, emit_chat_gen,
    emit_modes, emit_pin, emit_poll, enrich_frags, next_id, now_ms, text_frag, Alert, ChatBadge,
    ChatFragment, ChatMessage, Poll, PollOption, ReplyContext,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::platforms::emotes::{
    apply_thirdparty, fetch_7tv_user, fetch_global_thirdparty, ThirdParty,
};

// Kick's bot protection rejects a browser User-Agent on a non-browser TLS client; an honest one passes.
const USER_AGENT: &str = concat!("Corneta/", env!("CARGO_PKG_VERSION"));
// Used when Kick does not hand out its realtime key; the previous key was revoked in October 2026.
const FALLBACK_PUSHER_APP: &str = "34bf7a0ff419a2a775b9";
const FALLBACK_PUSHER_CLUSTER: &str = "us2";

/// The three IDs Kick uses for one channel, and what its chat needs up front.
struct KickChannel {
    chatroom_id: u64,
    channel_id: u64,
    user_id: u64,
    /// Months to the channel's subscriber badge art, lowest first.
    subscriber_badges: Vec<(u64, String)>,
    modes: Map<String, Value>,
}

/// Kick slugs are the lowercase username with underscores turned into dashes.
fn kick_slug(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('@')
        .to_lowercase()
        .replace('_', "-")
}

fn get_json(url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .timeout(Duration::from_secs(6))
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/json")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn get_channel(slug: &str) -> Option<KickChannel> {
    if slug.is_empty() || !slug.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return None;
    }
    let v = get_json(&format!("https://kick.com/api/v2/channels/{slug}"))?;
    let id = |v: Option<&Value>| v.and_then(|x| x.as_u64().or_else(|| x.as_str()?.parse().ok()));
    let mut subscriber_badges: Vec<(u64, String)> = v
        .get("subscriber_badges")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|b| {
            Some((
                b.get("months")?.as_u64()?,
                b.pointer("/badge_image/src")?.as_str()?.to_string(),
            ))
        })
        .filter(|(_, url)| url.starts_with("https://"))
        .collect();
    subscriber_badges.sort_by_key(|(months, _)| *months);
    Some(KickChannel {
        chatroom_id: id(v.pointer("/chatroom/id"))?,
        channel_id: id(v.get("id")).unwrap_or(0),
        user_id: id(v.get("user_id")).unwrap_or(0),
        subscriber_badges,
        modes: v.get("chatroom").map(chatroom_modes).unwrap_or_default(),
    })
}

/// Kick names the realtime provider at connect time; asking for Pusher returns its current key.
fn pusher_endpoint() -> (String, String) {
    let body = json!({
        "client": { "id": uuid::Uuid::new_v4().to_string(), "type": "web" },
        "capabilities": { "accepted_providers": [{ "provider": "pusher" }] }
    });
    let answer = ureq::post("https://web.kick.com/api/v1/realtime/connection")
        .timeout(Duration::from_secs(6))
        .set("User-Agent", USER_AGENT)
        .set("Content-Type", "application/json")
        .send_string(&body.to_string())
        .ok()
        .and_then(|r| r.into_string().ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    let safe =
        |s: &str| !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric());
    answer
        .as_ref()
        .and_then(|v| v.pointer("/data/connections"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|c| c.get("provider").and_then(Value::as_str) == Some("pusher"))
        .and_then(|c| {
            let key = c.pointer("/credentials/app_key")?.as_str()?;
            let cluster = c.pointer("/credentials/cluster")?.as_str()?;
            (safe(key) && safe(cluster)).then(|| (key.to_string(), cluster.to_string()))
        })
        .unwrap_or_else(|| {
            (
                FALLBACK_PUSHER_APP.to_string(),
                FALLBACK_PUSHER_CLUSTER.to_string(),
            )
        })
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
pub(crate) fn run_kick(
    slug: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let slug = kick_slug(slug);
    if slug.is_empty() {
        return false;
    }
    let Some(channel) = get_channel(&slug) else {
        log::warn!("kick chat: chatroom resolution failed");
        chat_status_gen(&app, gen, "kick", source, "error");
        return false;
    };
    let (key, cluster) = pusher_endpoint();
    let url = format!(
        "wss://ws-{cluster}.pusher.com/app/{key}?protocol=7&client=js&version=8.4.0&flash=false"
    );
    let mut socket = match tungstenite::connect(url.as_str()) {
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
    let (chatroom, ch) = (channel.chatroom_id, channel.channel_id);
    let mut feeds = vec![
        format!("chatrooms.{chatroom}.v2"),
        format!("chatroom_{chatroom}"),
    ];
    if ch != 0 {
        feeds.extend([
            format!("channel.{ch}"),
            format!("channel_{ch}"),
            format!("predictions-channel-{ch}"),
        ]);
    }
    for feed in &feeds {
        let _ = socket.send(Message::Text(
            json!({ "event": "pusher:subscribe", "data": { "auth": "", "channel": feed } })
                .to_string()
                .into(),
        ));
    }
    let mut thirdparty = fetch_global_thirdparty();
    if channel.user_id != 0 {
        let own = fetch_7tv_user("kick", &channel.user_id.to_string());
        thirdparty.urls.extend(own.urls);
        thirdparty.overlay.extend(own.overlay);
    }
    let mut feed = KickFeed {
        source: source.to_string(),
        thirdparty,
        subscriber_badges: channel.subscriber_badges,
        gifts: HashMap::new(),
    };
    log::info!("kick chat: connected");
    chat_status_gen(&app, gen, "kick", source, "connected");
    if !channel.modes.is_empty() {
        emit_modes(&app, gen, "kick", source, Value::Object(channel.modes));
    }

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(t)) => {
                let Ok(frame) = serde_json::from_str::<Value>(&t) else {
                    continue;
                };
                match frame.get("event").and_then(Value::as_str) {
                    Some("pusher:ping") => {
                        let _ = socket.send(Message::Text(
                            "{\"event\":\"pusher:pong\",\"data\":{}}".into(),
                        ));
                        continue;
                    }
                    Some("pusher:error") => {
                        log::warn!("kick chat: Pusher refused the connection");
                        break;
                    }
                    _ => {}
                }
                for event in feed.handle(&frame) {
                    dispatch(&app, gen, source, event);
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

#[derive(Debug)]
enum KickEvent {
    Message(ChatMessage),
    Alert(Alert),
    Delete(String),
    DeleteUser {
        login: String,
        user_id: Option<String>,
        seconds: Option<u64>,
    },
    Clear,
    Modes(Value),
    Pin(Option<ChatMessage>),
    Poll(Option<Poll>),
}

fn dispatch(app: &AppHandle, gen: u64, source: &str, event: KickEvent) {
    match event {
        KickEvent::Message(msg) => emit_chat_gen(app, gen, msg),
        KickEvent::Alert(alert) => emit_alert(app, alert),
        KickEvent::Delete(id) => delete_message(app, "kick", &id),
        KickEvent::DeleteUser {
            login,
            user_id,
            seconds,
        } => delete_user(app, "kick", source, &login, user_id.as_deref(), seconds),
        KickEvent::Clear => clear_source(app, "kick", source),
        KickEvent::Modes(modes) => emit_modes(app, gen, "kick", source, modes),
        KickEvent::Pin(message) => emit_pin(app, gen, "kick", source, message),
        KickEvent::Poll(poll) => emit_poll(app, gen, "kick", source, poll),
    }
}

/// One connection's state: assets for rendering and gift batches still arriving in chunks.
struct KickFeed {
    source: String,
    thirdparty: ThirdParty,
    subscriber_badges: Vec<(u64, String)>,
    /// Gift batch ID to its gifter and the gifts counted so far.
    gifts: HashMap<String, (String, u64)>,
}

fn str_at<'a>(v: &'a Value, path: &str) -> Option<&'a str> {
    v.pointer(path)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

fn num_at(v: &Value, path: &str) -> Option<u64> {
    v.pointer(path)
        .and_then(|x| x.as_u64().or_else(|| x.as_str()?.parse().ok()))
}

/// Sender IDs arrive as numbers or as strings.
fn id_at(v: &Value, path: &str) -> Option<String> {
    match v.pointer(path)? {
        Value::Number(n) => n.as_u64().map(|n| n.to_string()),
        Value::String(s) if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) => {
            Some(s.clone())
        }
        _ => None,
    }
}

impl KickFeed {
    fn alert(&self, kind: &str, user: Option<&str>) -> Alert {
        Alert {
            id: next_id(),
            platform: "kick".into(),
            source: self.source.clone(),
            kind: kind.into(),
            user: user
                .map(String::from)
                .unwrap_or_else(|| Msg::ChatUnknownUser.now()),
            ts: now_ms(),
            ..Default::default()
        }
    }

    fn handle(&mut self, frame: &Value) -> Vec<KickEvent> {
        let Some(name) = frame.get("event").and_then(Value::as_str) else {
            return Vec::new();
        };
        // Some events carry the App\Events\ prefix and some do not.
        let name = name.rsplit('\\').next().unwrap_or(name);
        // `data` is a JSON string on Pusher.
        let data = match frame.get("data") {
            Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(Value::Null),
            Some(other) => other.clone(),
            None => Value::Null,
        };
        let d = &data;
        let event = match name {
            "ChatMessageEvent" => self.message(d).map(KickEvent::Message),
            "MessageDeletedEvent" => {
                str_at(d, "/message/id").map(|id| KickEvent::Delete(id.into()))
            }
            "UserBannedEvent" => {
                let permanent = d.get("permanent").and_then(Value::as_bool).unwrap_or(false);
                str_at(d, "/user/username").map(|login| KickEvent::DeleteUser {
                    login: login.into(),
                    user_id: id_at(d, "/user/id"),
                    seconds: (!permanent)
                        .then(|| num_at(d, "/duration").map(|m| m * 60))
                        .flatten(),
                })
            }
            "ChatroomClearEvent" => Some(KickEvent::Clear),
            "ChatroomUpdatedEvent" => Some(KickEvent::Modes(Value::Object(chatroom_modes(d)))),
            "ChatSettingsChanged" => d
                .get("settings")
                .map(|s| KickEvent::Modes(Value::Object(settings_modes(s)))),
            "PinnedMessageCreatedEvent" => {
                d.get("message").and_then(|m| self.message(m)).map(|mut m| {
                    m.highlight = Some("pinned".into());
                    m.note = str_at(d, "/pinnedBy/username").map(String::from);
                    KickEvent::Pin(Some(m))
                })
            }
            "PinnedMessageDeletedEvent" => Some(KickEvent::Pin(None)),
            // ChannelSubscriptionEvent is an older duplicate of the same subscription.
            "SubscriptionEvent" => {
                let months = num_at(d, "/months").unwrap_or(1);
                Some(KickEvent::Alert(Alert {
                    amount: Some(months as f64),
                    ..self.alert(
                        if months > 1 { "resub" } else { "sub" },
                        str_at(d, "/username"),
                    )
                }))
            }
            "GiftedSubscriptionsEvent" => self.gifts(d).map(KickEvent::Alert),
            "StreamHostEvent" => Some(KickEvent::Alert(Alert {
                amount: num_at(d, "/number_viewers").map(|n| n as f64),
                message: str_at(d, "/optional_message").map(String::from),
                ..self.alert("raid", str_at(d, "/host_username"))
            })),
            "RewardRedeemedEvent" => Some(KickEvent::Alert(Alert {
                title: str_at(d, "/reward_title")
                    .or_else(|| str_at(d, "/reward/title"))
                    .map(String::from),
                message: str_at(d, "/user_input").map(String::from),
                ..self.alert("reward", str_at(d, "/username"))
            })),
            "KicksGifted" => Some(KickEvent::Alert(Alert {
                amount: num_at(d, "/gift/amount").map(|n| n as f64),
                title: str_at(d, "/gift/name").map(String::from),
                message: str_at(d, "/message").map(String::from),
                ..self.alert("kicks", str_at(d, "/sender/username"))
            })),
            "PollUpdateEvent" => d.get("poll").map(|p| KickEvent::Poll(Some(kick_poll(p)))),
            "PollDeleteEvent" => Some(KickEvent::Poll(None)),
            "PredictionCreated" | "PredictionUpdated" => d
                .get("prediction")
                .map(|p| KickEvent::Poll(Some(kick_prediction(p)))),
            _ => None,
        };
        event.into_iter().collect()
    }

    /// Big gift batches arrive in chunks; the alert waits for the last one with the full count.
    fn gifts(&mut self, d: &Value) -> Option<Alert> {
        let gifter = str_at(d, "/gifter_username").unwrap_or("").to_string();
        let count = d
            .get("gifted_usernames")
            .and_then(Value::as_array)
            .map(|a| a.len() as u64)
            .unwrap_or(0);
        let (total, index) = match d.get("chunk_details").filter(|c| !c.is_null()) {
            Some(c) => (
                num_at(c, "/total_chunks").unwrap_or(1),
                num_at(c, "/chunk_index").unwrap_or(0),
            ),
            None => (1, 0),
        };
        let batch = str_at(d, "/correlation_id").unwrap_or("").to_string();
        let gifted = if total > 1 && !batch.is_empty() {
            let entry = self
                .gifts
                .entry(batch.clone())
                .or_insert((gifter.clone(), 0));
            entry.1 += count;
            if index + 1 < total {
                return None;
            }
            self.gifts.remove(&batch).map(|(_, n)| n).unwrap_or(count)
        } else {
            count
        };
        Some(Alert {
            amount: Some(gifted.max(1) as f64),
            ..self.alert("subgift", Some(gifter.as_str()).filter(|g| !g.is_empty()))
        })
    }

    fn message(&self, d: &Value) -> Option<ChatMessage> {
        let content = str_at(d, "/content")?.to_string();
        let fragments = enrich_frags(apply_thirdparty(kick_fragments(&content), &self.thirdparty));
        let reply = str_at(d, "/metadata/original_message/content").map(|text| ReplyContext {
            author: str_at(d, "/metadata/original_sender/username")
                .unwrap_or_default()
                .to_string(),
            text: emote_names(text),
        });
        let celebration = str_at(d, "/type") == Some("celebration");
        let months = num_at(d, "/metadata/celebration/total_months");
        Some(ChatMessage {
            id: next_id(),
            platform: "kick".into(),
            source: self.source.clone(),
            author: str_at(d, "/sender/username").unwrap_or("anon").to_string(),
            author_id: id_at(d, "/sender/id"),
            native_id: str_at(d, "/id").map(String::from),
            color: str_at(d, "/sender/identity/color").map(String::from),
            text: fragments.iter().filter_map(|f| f.text.clone()).collect(),
            badges: self.badges(d.pointer("/sender/identity")),
            fragments,
            ts: now_ms(),
            reply,
            highlight: celebration.then(|| "celebration".to_string()),
            note: months.filter(|_| celebration).map(|n| {
                Msg::ChatCelebrationMonths {
                    months: &n.to_string(),
                }
                .now()
            }),
            ..Default::default()
        })
    }

    fn badges(&self, identity: Option<&Value>) -> Vec<ChatBadge> {
        let Some(identity) = identity else {
            return Vec::new();
        };
        let mut legacy: Vec<&Value> = identity
            .get("badges")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .collect();
        legacy.sort_by_key(|b| {
            b.get("sort_order")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX)
        });
        let mut out: Vec<ChatBadge> = legacy
            .into_iter()
            .filter_map(|b| {
                let kind = b.get("type").and_then(Value::as_str).unwrap_or("");
                let text = b.get("text").and_then(Value::as_str).unwrap_or("");
                let count = num_at(b, "/count");
                let label = match kind {
                    "broadcaster" => "HOST".to_string(),
                    "moderator" => "MOD".to_string(),
                    "vip" => "VIP".to_string(),
                    "subscriber" => "SUB".to_string(),
                    "founder" => "FND".to_string(),
                    "og" => "OG".to_string(),
                    "verified" => "✓".to_string(),
                    "bot" => "BOT".to_string(),
                    "staff" => "STAFF".to_string(),
                    "sub_gifter" => "GIFT".to_string(),
                    _ if !text.is_empty() => text.to_uppercase(),
                    _ => return None,
                };
                let url = (kind == "subscriber")
                    .then(|| {
                        let months = count.unwrap_or(0);
                        self.subscriber_badges
                            .iter()
                            .rev()
                            .find(|(min, _)| *min <= months)
                            .map(|(_, url)| url.clone())
                    })
                    .flatten();
                let name = if text.is_empty() {
                    label.as_str()
                } else {
                    text
                };
                let title = match (kind, count) {
                    ("subscriber", Some(n)) => Some(
                        Msg::ChatBadgeMonths {
                            badge: name,
                            months: &n.to_string(),
                        }
                        .now(),
                    ),
                    ("sub_gifter", Some(n)) => Some(format!("{name} · {n}")),
                    _ => Some(text.to_string()).filter(|t| !t.is_empty()),
                };
                Some(ChatBadge {
                    label: label.clone(),
                    kind: match kind {
                        "" => "subscriber",
                        "sub_gifter" => "gifter",
                        other => other,
                    }
                    .to_string(),
                    url,
                    title,
                })
            })
            .collect();
        // Global badges (levels, events); only the ones the viewer chose to show.
        for b in identity
            .get("badges_v2")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|b| b.get("selected").and_then(Value::as_bool) == Some(true))
        {
            let Some(url) = str_at(b, "/image_url").filter(|u| u.starts_with("https://")) else {
                continue;
            };
            let name = str_at(b, "/name").unwrap_or("badge");
            out.push(ChatBadge {
                label: String::new(),
                kind: "other".into(),
                url: Some(url.to_string()),
                title: Some(match num_at(b, "/metadata/level") {
                    Some(level) => format!("{name} {level}"),
                    None => name.replace('_', " "),
                }),
            });
        }
        out
    }
}

/// Initial modes from the channel lookup and ChatroomUpdatedEvent use the same shape.
fn chatroom_modes(c: &Value) -> Map<String, Value> {
    let on = |path: &str| c.pointer(path).and_then(Value::as_bool);
    let mut modes = Map::new();
    if let Some(slow) = on("/slow_mode/enabled").or_else(|| on("/slow_mode")) {
        let interval = num_at(c, "/slow_mode/message_interval")
            .or_else(|| num_at(c, "/message_interval"))
            .unwrap_or(0);
        modes.insert("slow".into(), json!(if slow { interval } else { 0 }));
    }
    if let Some(subs) = on("/subscribers_mode/enabled").or_else(|| on("/subscribers_mode")) {
        modes.insert("subsOnly".into(), json!(subs));
    }
    if let Some(emotes) = on("/emotes_mode/enabled").or_else(|| on("/emotes_mode")) {
        modes.insert("emoteOnly".into(), json!(emotes));
    }
    if let Some(followers) = on("/followers_mode/enabled").or_else(|| on("/followers_mode")) {
        let minutes = num_at(c, "/followers_mode/min_duration")
            .or_else(|| num_at(c, "/following_min_duration"))
            .unwrap_or(0);
        modes.insert(
            "followersOnly".into(),
            json!(if followers { minutes as i64 } else { -1 }),
        );
    }
    modes
}

fn settings_modes(s: &Value) -> Map<String, Value> {
    let on = |path: &str| s.pointer(path).and_then(Value::as_bool).unwrap_or(false);
    let mut modes = Map::new();
    modes.insert("emoteOnly".into(), json!(on("/emotes_only_mode/enabled")));
    modes.insert(
        "subsOnly".into(),
        json!(on("/subscribers_only_mode/enabled")),
    );
    modes.insert(
        "slow".into(),
        json!(if on("/slow_mode/enabled") {
            num_at(s, "/slow_mode/duration_seconds").unwrap_or(0)
        } else {
            0
        }),
    );
    modes.insert(
        "followersOnly".into(),
        json!(if on("/followers_only_mode/enabled") {
            (num_at(s, "/followers_only_mode/duration_seconds").unwrap_or(0) / 60) as i64
        } else {
            -1
        }),
    );
    modes
}

fn kick_poll(p: &Value) -> Poll {
    let options: Vec<PollOption> = p
        .get("options")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|o| PollOption {
            label: str_at(o, "/label").unwrap_or("").to_string(),
            votes: num_at(o, "/votes"),
            percent: None,
        })
        .collect();
    Poll {
        id: str_at(p, "/title").unwrap_or("poll").to_string(),
        kind: "poll".into(),
        question: str_at(p, "/title").unwrap_or("").to_string(),
        total: Some(options.iter().filter_map(|o| o.votes).sum()),
        ended: num_at(p, "/remaining") == Some(0),
        options,
    }
}

fn kick_prediction(p: &Value) -> Poll {
    let options: Vec<PollOption> = p
        .get("outcomes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|o| PollOption {
            label: str_at(o, "/title").unwrap_or("").to_string(),
            votes: num_at(o, "/vote_count"),
            percent: None,
        })
        .collect();
    Poll {
        id: str_at(p, "/id").unwrap_or("prediction").to_string(),
        kind: "prediction".into(),
        question: str_at(p, "/title").unwrap_or("").to_string(),
        total: Some(options.iter().filter_map(|o| o.votes).sum()),
        ended: matches!(str_at(p, "/state"), Some("RESOLVED" | "CANCELLED")),
        options,
    }
}

/// `[emote:id:name]` tokens shown as their names, for quoted replies.
fn emote_names(text: &str) -> String {
    kick_fragments(text)
        .into_iter()
        .filter_map(|f| f.text)
        .collect()
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
            if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) {
                frags.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(if name.is_empty() {
                        id.to_string()
                    } else {
                        name.to_string()
                    }),
                    url: Some(format!("https://files.kick.com/emotes/{id}/fullsize")),
                    ..Default::default()
                });
            } else {
                frags.push(text_frag(&after[..=end]));
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

#[cfg(test)]
mod tests {
    use super::*;

    fn feed() -> KickFeed {
        KickFeed {
            source: "fonte".into(),
            thirdparty: ThirdParty::default(),
            subscriber_badges: vec![
                (1, "https://files.kick.com/b/1.png".into()),
                (6, "https://files.kick.com/b/6.png".into()),
            ],
            gifts: HashMap::new(),
        }
    }

    fn frame(event: &str, data: Value) -> Value {
        json!({ "event": event, "data": data.to_string() })
    }

    fn one(feed: &mut KickFeed, event: &str, data: Value) -> KickEvent {
        let mut events = feed.handle(&frame(event, data));
        assert_eq!(events.len(), 1, "{event}");
        events.remove(0)
    }

    fn message(data: Value) -> ChatMessage {
        match one(&mut feed(), "App\\Events\\ChatMessageEvent", data) {
            KickEvent::Message(m) => m,
            other => panic!("expected a message, got {other:?}"),
        }
    }

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
        assert!(kick_fragments("[emote:../x:y]")
            .iter()
            .all(|f| f.kind == "text"));
    }

    #[test]
    fn kick_fragments_handle_emotes_adjacent_to_multibyte_text() {
        for case in [
            "😀[emote:1:a]",
            "[emote:1:a]😀",
            "ção[emote:1:ção]ção",
            "[emote:1:😀][emote:2:😀]",
        ] {
            assert!(!kick_fragments(case).is_empty(), "empty for {case:?}");
        }
    }

    #[test]
    fn kick_parsers_tolerate_hostile_network_fixtures() {
        let mut feed = feed();
        for case in crate::chat::hostile_chat_corpus() {
            let _ = feed.handle(&json!({ "event": "App\\Events\\ChatMessageEvent", "data": case }));
            let _ = feed.handle(&serde_json::from_str::<Value>(&case).unwrap_or(Value::Null));
            assert!(!kick_fragments(&case).is_empty(), "empty for {case:?}");
        }
    }

    #[test]
    fn moderation_ids_come_from_the_kick_feed() {
        let author = |sender: Value| {
            message(json!({ "id": "kick-1", "content": "oi", "sender": sender })).author_id
        };
        assert_eq!(
            author(json!({ "id": 123456, "username": "ana" })).as_deref(),
            Some("123456")
        );
        assert_eq!(
            author(json!({ "id": "654321", "username": "ana" })).as_deref(),
            Some("654321")
        );
        assert_eq!(author(json!({ "id": "12a", "username": "ana" })), None);
        assert_eq!(author(json!({ "username": "ana" })), None);
    }

    /// Run by hand with `CORNETA_LIVE_CHAT=1 cargo test --lib live_kick -- --ignored --nocapture`;
    /// CI runs ignored tests too, and these depend on a third-party service.
    #[test]
    #[ignore = "talks to kick.com"]
    fn live_kick_channel_resolves_and_streams_chat() {
        if std::env::var_os("CORNETA_LIVE_CHAT").is_none() {
            return;
        }
        crate::install_tls_provider();
        let channel = get_channel(&kick_slug("xqc")).expect("kick.com answered the channel lookup");
        let (key, cluster) = pusher_endpoint();
        println!(
            "chatroom {} channel {} key {key} cluster {cluster}",
            channel.chatroom_id, channel.channel_id
        );
        let url = format!("wss://ws-{cluster}.pusher.com/app/{key}?protocol=7&client=js&version=8.4.0&flash=false");
        let (mut socket, _) = tungstenite::connect(url.as_str()).expect("pusher connection");
        let feed_name = format!("chatrooms.{}.v2", channel.chatroom_id);
        socket
            .send(Message::Text(json!({ "event": "pusher:subscribe", "data": { "auth": "", "channel": feed_name } }).to_string().into()))
            .unwrap();
        let mut feed = feed();
        let deadline = std::time::Instant::now() + Duration::from_secs(45);
        let mut seen = Vec::new();
        while std::time::Instant::now() < deadline && seen.len() < 3 {
            let Ok(Message::Text(t)) = socket.read() else {
                continue;
            };
            let frame: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
            assert_ne!(
                frame.get("event").and_then(Value::as_str),
                Some("pusher:error"),
                "{t}"
            );
            for event in feed.handle(&frame) {
                if let KickEvent::Message(m) = event {
                    println!("{}: {}", m.author, m.text);
                    seen.push(m);
                }
            }
        }
        assert!(!seen.is_empty(), "no chat message within 45 s");
    }

    #[test]
    fn slugs_turn_underscores_into_dashes() {
        assert_eq!(kick_slug(" @MJ_ARIES "), "mj-aries");
    }

    #[test]
    fn replies_celebrations_and_badges() {
        let reply = message(json!({
            "id": "m1", "content": "boa [emote:1:GG]", "type": "reply",
            "sender": { "id": 1, "username": "ana", "identity": { "color": "#FFAE76",
                "badges": [{ "type": "subscriber", "text": "Subscriber", "count": 7, "sort_order": 9 },
                           { "type": "moderator", "text": "Moderator", "sort_order": 12 }],
                "badges_v2": [{ "name": "level", "image_url": "https://ext.cdn.kick.com/l.png", "metadata": { "level": 17 }, "selected": true },
                              { "name": "hidden", "image_url": "https://ext.cdn.kick.com/h.png", "selected": false }] } },
            "metadata": { "original_sender": { "username": "bia" }, "original_message": { "content": "vai [emote:2:Pog]" } }
        }));
        assert_eq!(
            reply
                .reply
                .as_ref()
                .map(|r| (r.author.as_str(), r.text.as_str())),
            Some(("bia", "vai Pog"))
        );
        assert_eq!(
            reply.badges[0].url.as_deref(),
            Some("https://files.kick.com/b/6.png")
        );
        assert_eq!(reply.badges[1].kind, "moderator");
        assert_eq!(reply.badges.len(), 3);
        assert_eq!(reply.badges[2].title.as_deref(), Some("level 17"));
        let celebration = message(json!({
            "id": "m2", "content": "7 meses!", "type": "celebration",
            "sender": { "id": 2, "username": "caio" },
            "metadata": { "celebration": { "type": "subscription_renewed", "total_months": 7 } }
        }));
        assert_eq!(celebration.highlight.as_deref(), Some("celebration"));
        assert!(celebration.note.is_some());
    }

    #[test]
    fn moderation_modes_pins_polls_and_predictions() {
        let mut f = feed();
        assert!(matches!(
            one(&mut f, "App\\Events\\UserBannedEvent", json!({ "user": { "id": 9, "username": "spam" }, "permanent": false, "duration": 10 })),
            KickEvent::DeleteUser { login, user_id: Some(id), seconds: Some(600) } if login == "spam" && id == "9"
        ));
        assert!(matches!(
            one(
                &mut f,
                "App\\Events\\ChatroomClearEvent",
                json!({ "id": "x" })
            ),
            KickEvent::Clear
        ));
        match one(
            &mut f,
            "ChatSettingsChanged",
            json!({ "settings": {
                "emotes_only_mode": { "enabled": true }, "followers_only_mode": { "enabled": true, "duration_seconds": 600 },
                "slow_mode": { "enabled": false, "duration_seconds": 0 }, "subscribers_only_mode": { "enabled": false } } }),
        ) {
            KickEvent::Modes(m) => assert_eq!(
                m,
                json!({ "emoteOnly": true, "subsOnly": false, "slow": 0, "followersOnly": 10 })
            ),
            other => panic!("{other:?}"),
        }
        match one(
            &mut f,
            "App\\Events\\PinnedMessageCreatedEvent",
            json!({
                "message": { "id": "p1", "content": "regras", "sender": { "id": 1, "username": "mod" } },
                "pinnedBy": { "username": "dona" } }),
        ) {
            KickEvent::Pin(Some(m)) => {
                assert_eq!(m.highlight.as_deref(), Some("pinned"));
                assert_eq!(m.note.as_deref(), Some("dona"));
            }
            other => panic!("{other:?}"),
        }
        assert!(matches!(
            one(&mut f, "App\\Events\\PinnedMessageDeletedEvent", json!([])),
            KickEvent::Pin(None)
        ));
        match one(
            &mut f,
            "App\\Events\\PollUpdateEvent",
            json!({ "poll": { "title": "Qual?", "options": [{ "label": "A", "votes": 3 }, { "label": "B", "votes": 1 }], "remaining": 20 } }),
        ) {
            KickEvent::Poll(Some(p)) => assert_eq!((p.total, p.ended), (Some(4), false)),
            other => panic!("{other:?}"),
        }
        match one(
            &mut f,
            "PredictionUpdated",
            json!({ "prediction": { "id": "pr", "title": "Ganha?", "state": "RESOLVED",
                "outcomes": [{ "title": "Sim", "vote_count": 10 }, { "title": "Não", "vote_count": 5 }] } }),
        ) {
            KickEvent::Poll(Some(p)) => {
                assert_eq!((p.kind.as_str(), p.ended), ("prediction", true))
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn alerts_cover_subs_gifts_kicks_rewards_and_raids() {
        let mut f = feed();
        let alert = |e: KickEvent| match e {
            KickEvent::Alert(a) => a,
            other => panic!("{other:?}"),
        };
        let resub = alert(one(
            &mut f,
            "App\\Events\\SubscriptionEvent",
            json!({ "username": "ana", "months": 5 }),
        ));
        assert_eq!((resub.kind.as_str(), resub.amount), ("resub", Some(5.0)));
        assert!(f
            .handle(&frame(
                "App\\Events\\ChannelSubscriptionEvent",
                json!({ "username": "ana" })
            ))
            .is_empty());
        // A chunked batch alerts once, with the whole count.
        let chunk = |i: u64, names: Value| {
            json!({ "gifter_username": "bia", "correlation_id": "c1",
                "gifted_usernames": names, "chunk_details": { "chunk_index": i, "total_chunks": 2 } })
        };
        assert!(f
            .handle(&frame(
                "GiftedSubscriptionsEvent",
                chunk(0, json!(["a", "b"]))
            ))
            .is_empty());
        let gifts = alert(one(
            &mut f,
            "GiftedSubscriptionsEvent",
            chunk(1, json!(["c"])),
        ));
        assert_eq!(
            (gifts.kind.as_str(), gifts.amount, gifts.user.as_str()),
            ("subgift", Some(3.0), "bia")
        );
        let kicks = alert(one(
            &mut f,
            "KicksGifted",
            json!({ "message": "salve", "sender": { "username": "caio" },
                "gift": { "gift_id": "full_send", "name": "Full Send", "amount": 100 } }),
        ));
        assert_eq!(
            (kicks.kind.as_str(), kicks.amount, kicks.title.as_deref()),
            ("kicks", Some(100.0), Some("Full Send"))
        );
        let reward = alert(one(
            &mut f,
            "RewardRedeemedEvent",
            json!({ "reward_title": "Hidrata", "username": "duda", "user_input": "água" }),
        ));
        assert_eq!(
            (
                reward.kind.as_str(),
                reward.title.as_deref(),
                reward.message.as_deref()
            ),
            ("reward", Some("Hidrata"), Some("água"))
        );
        let raid = alert(one(
            &mut f,
            "App\\Events\\StreamHostEvent",
            json!({ "host_username": "eva", "number_viewers": 347 }),
        ));
        assert_eq!((raid.kind.as_str(), raid.amount), ("raid", Some(347.0)));
    }
}
