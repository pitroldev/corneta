use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::{ChatSource, Settings};
use crate::i18n::Msg;
use crate::platforms::provider::{AudienceReader, AudienceSetup, ChatSession, Connection, Outbox};
use crate::AppState;

fn is_false(value: &bool) -> bool {
    !*value
}

/// One piece of a message. `text` is always the plain-text fallback.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatFragment {
    /// "text" | "emote" | "gif" | "sticker" | "link" | "mention" | "cheer"
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Image for emotes, GIFs, stickers and cheermotes; the target for links.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Bits in a cheer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<u64>,
    /// Cheer tier color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Zero-width emote drawn over the previous one.
    #[serde(skip_serializing_if = "is_false")]
    pub overlay: bool,
    /// Power-up: the emote is shown much larger.
    #[serde(skip_serializing_if = "is_false")]
    pub giant: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatBadge {
    pub label: String,
    pub kind: String,
    /// Badge image; without one the label is shown.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Tooltip, such as "Subscriber (14 months)".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// The message a reply answers, as the platform quotes it.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReplyContext {
    pub author: String,
    pub text: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub platform: String, // A registered chat provider id.
    pub source: String,   // Source label distinguishes channels on the same platform.
    pub author: String,
    /// Native author ID avoids name lookups during moderation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_id: Option<String>,
    /// Native message ID matches moderation deletions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub text: String,
    pub fragments: Vec<ChatFragment>,
    pub badges: Vec<ChatBadge>,
    pub ts: u64,
    /// `/me`: the whole line takes the author's color.
    #[serde(skip_serializing_if = "is_false")]
    pub action: bool,
    /// Why the platform singles the message out: "first" | "returning" | "highlighted" |
    /// "redeemed" | "announcement" | "effect" | "pinned" | "paid" | "error".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<String>,
    /// Accent for announcements and paid highlights, as a CSS color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    /// What the highlight is about, such as a channel points reward or a Super Chat amount.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<ReplyContext>,
    /// Shared chat: the message was sent in another channel of the session.
    #[serde(skip_serializing_if = "is_false")]
    pub shared: bool,
    /// A platform notice with no author line, such as a watch streak or a mode change.
    #[serde(skip_serializing_if = "is_false")]
    pub system: bool,
    /// Sent from this app. The author shown is localized, so the UI must not match on the name.
    #[serde(skip_serializing_if = "is_false")]
    pub own: bool,
    /// The same message reaching more than one source (Twitch shared chat) is shown once.
    #[serde(skip)]
    pub dedup_key: Option<String>,
}

#[derive(Default)]
pub struct ChatRuntime {
    pub running: Arc<AtomicBool>,
    /// Source ID -> authenticated Twitch send queue; reset on chat restart.
    pub senders: Arc<Mutex<HashMap<String, mpsc::Sender<Outgoing>>>>,
}

pub struct Outgoing {
    pub text: String,
    pub reply_to: Option<String>,
}

/// The message a send answers: its native ID threads the reply where the platform supports it.
#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyTo {
    pub native_id: Option<String>,
    pub author: String,
}

/// Reply IDs end up in an IRC tag or a JSON field, so only plain message IDs pass.
pub(crate) fn reply_id(id: &str) -> Option<&str> {
    let id = id.trim();
    (!id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'))
        .then_some(id)
}

static MSG_ID: AtomicU64 = AtomicU64::new(1);
pub(crate) fn next_id() -> String {
    MSG_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

// Deduplicate history replays before recording, overlays, and metrics consume them.

const NATIVE_DEDUP_CAP: usize = 4_096;

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct NativeMessageKey {
    platform: String,
    source: String,
    native_id: String,
}

#[derive(Default)]
struct NativeMessageDedup {
    seen: HashSet<NativeMessageKey>,
    order: VecDeque<NativeMessageKey>,
}

impl NativeMessageDedup {
    fn accept(&mut self, msg: &ChatMessage) -> bool {
        let key = match (&msg.dedup_key, &msg.native_id) {
            (Some(shared), _) => NativeMessageKey {
                platform: msg.platform.clone(),
                source: String::new(),
                native_id: shared.clone(),
            },
            (None, Some(native_id)) => NativeMessageKey {
                platform: msg.platform.clone(),
                source: msg.source.clone(),
                native_id: native_id.clone(),
            },
            (None, None) => return true,
        };
        if !self.seen.insert(key.clone()) {
            return false;
        }
        self.order.push_back(key);
        while self.order.len() > NATIVE_DEDUP_CAP {
            if let Some(oldest) = self.order.pop_front() {
                self.seen.remove(&oldest);
            }
        }
        true
    }
}

static NATIVE_DEDUP: OnceLock<Mutex<NativeMessageDedup>> = OnceLock::new();

fn first_native_delivery(msg: &ChatMessage) -> bool {
    NATIVE_DEDUP
        .get_or_init(|| Mutex::new(NativeMessageDedup::default()))
        .lock()
        .map(|mut dedup| dedup.accept(msg))
        // A poisoned dedup lock must not discard incoming chat.
        .unwrap_or(true)
}
// Per-channel counts accumulate between report samples, independent of replay recording.

static MSG_COUNTS: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

fn msg_counts() -> &'static Mutex<HashMap<String, u64>> {
    MSG_COUNTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn reset_msg_counts() {
    if let Ok(mut m) = msg_counts().lock() {
        m.clear();
    }
}

/// Drain the elapsed sample window, keyed by platform:source.
pub fn drain_msg_counts() -> HashMap<String, u64> {
    msg_counts()
        .lock()
        .map(|mut m| std::mem::take(&mut *m))
        .unwrap_or_default()
}
// Superseded connections must not replace current senders or publish stale status.

pub(crate) static CHAT_GEN: AtomicU64 = AtomicU64::new(0);

fn session_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.state::<AppState>()
        .engine
        .lock()
        .ok()?
        .session_path
        .clone()
}
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
pub(crate) fn text_frag(t: &str) -> ChatFragment {
    ChatFragment {
        kind: "text".into(),
        text: Some(t.to_string()),
        ..Default::default()
    }
}

/// Splits plain text into text, link and mention fragments; platforms without link or
/// mention metadata use this on their text runs.
pub(crate) fn rich_text_frags(t: &str) -> Vec<ChatFragment> {
    let mut out: Vec<ChatFragment> = Vec::new();
    let mut plain = String::new();
    let flush = |plain: &mut String, out: &mut Vec<ChatFragment>| {
        if !plain.is_empty() {
            out.push(text_frag(plain));
            plain.clear();
        }
    };
    let mut rest = t;
    while !rest.is_empty() {
        let word_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        let (word, after) = rest.split_at(word_end);
        let space_end = after
            .find(|c: char| !c.is_whitespace())
            .unwrap_or(after.len());
        let (space, next) = after.split_at(space_end);
        if let Some(url) = link_target(word) {
            flush(&mut plain, &mut out);
            out.push(ChatFragment {
                kind: "link".into(),
                text: Some(word.to_string()),
                url: Some(url),
                ..Default::default()
            });
        } else if is_mention(word) {
            flush(&mut plain, &mut out);
            out.push(ChatFragment {
                kind: "mention".into(),
                text: Some(word.to_string()),
                ..Default::default()
            });
        } else {
            plain.push_str(word);
        }
        plain.push_str(space);
        rest = next;
    }
    flush(&mut plain, &mut out);
    out
}

/// Only http(s) links open; anything else stays text.
fn link_target(word: &str) -> Option<String> {
    let word = word.trim_end_matches(['.', ',', '!', '?', ')', ';', ':']);
    let lower = word.to_ascii_lowercase();
    let url = if lower.starts_with("https://") || lower.starts_with("http://") {
        word.to_string()
    } else if lower.starts_with("www.") && word.len() > 4 {
        format!("https://{word}")
    } else {
        return None;
    };
    (url.len() <= 2048 && !url.chars().any(|c| c.is_control() || c == '"' || c == '<'))
        .then_some(url)
}

fn is_mention(word: &str) -> bool {
    let Some(name) = word.strip_prefix('@') else {
        return false;
    };
    let name = name.trim_end_matches(['.', ',', '!', '?', ':', ';']);
    !name.is_empty()
        && name.chars().count() <= 64
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// Splits text fragments further into links and mentions, keeping every other fragment.
pub(crate) fn enrich_frags(frags: Vec<ChatFragment>) -> Vec<ChatFragment> {
    frags
        .into_iter()
        .flat_map(|f| match (f.kind.as_str(), f.text.as_deref()) {
            ("text", Some(t)) => rich_text_frags(t),
            _ => vec![f],
        })
        .collect()
}

pub(crate) fn emit_chat(app: &AppHandle, msg: ChatMessage) {
    if !first_native_delivery(&msg) {
        return;
    }
    if let Ok(mut counts) = msg_counts().lock() {
        *counts
            .entry(format!("{}:{}", msg.platform, msg.source))
            .or_insert(0) += 1;
    }
    // Chat recording has a separate size cap; exhausting it must not stop report counts.

    if crate::session::chat_recording() {
        if let Some(p) = session_path(app) {
            crate::session::record_chat_msg(
                &p,
                msg.ts,
                &msg.platform,
                &msg.source,
                &msg.author,
                msg.color.as_deref(),
                &msg.text,
                msg.native_id.as_deref(),
                replay_details(&msg),
            );
        }
    }
    crate::overlay::push_chat(&app.state::<AppState>().overlay, &msg);
    crate::deck::chat_message(app, &msg);
    let _ = app.emit("chat://message", msg);
}

/// What replay needs beyond the plain text: images, badges and how the line is marked.
fn replay_details(msg: &ChatMessage) -> Option<Value> {
    let mut extra = Map::new();
    if msg.fragments.iter().any(|f| f.kind != "text") {
        extra.insert(
            "f".into(),
            Value::Array(
                msg.fragments
                    .iter()
                    .map(|f| {
                        let mut frag = json!({ "k": f.kind, "t": f.text });
                        if let Some(url) = &f.url {
                            frag["u"] = json!(url);
                        }
                        frag
                    })
                    .collect(),
            ),
        );
    }
    if !msg.badges.is_empty() {
        extra.insert(
            "b".into(),
            Value::Array(
                msg.badges
                    .iter()
                    .map(|b| {
                        let mut badge = json!({ "l": b.label, "k": b.kind });
                        if let Some(url) = &b.url {
                            badge["u"] = json!(url);
                        }
                        badge
                    })
                    .collect(),
            ),
        );
    }
    if let Some(highlight) = &msg.highlight {
        extra.insert("h".into(), json!(highlight));
    }
    if let Some(reply) = &msg.reply {
        extra.insert("r".into(), json!({ "a": reply.author, "m": reply.text }));
    }
    if msg.action {
        extra.insert("me".into(), json!(true));
    }
    if msg.system {
        extra.insert("sys".into(), json!(true));
    }
    (!extra.is_empty()).then_some(Value::Object(extra))
}

pub(crate) fn emit_chat_gen(app: &AppHandle, gen: u64, msg: ChatMessage) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        emit_chat(app, msg);
    }
}
pub(crate) fn chat_status(app: &AppHandle, platform: &str, source: &str, status: &str) {
    // Record disconnection gaps so replay distinguishes missing capture from actual silence.

    if status == "disconnected" && crate::session::chat_recording() {
        if let Some(p) = session_path(app) {
            crate::session::record_chat_gap(&p, now_ms());
        }
    }
    let _ = app.emit(
        "chat://status",
        json!({ "platform": platform, "source": source, "status": status }),
    );
}

pub(crate) fn chat_status_gen(
    app: &AppHandle,
    gen: u64,
    platform: &str,
    source: &str,
    status: &str,
) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        chat_status(app, platform, source, status);
    }
}
// Auth status describes sending permission, not the anonymous read connection.

pub(crate) fn chat_auth(app: &AppHandle, source_id: &str, login: &str, ok: bool) {
    let _ = app.emit(
        "chat://auth",
        json!({ "source": source_id, "login": login, "ok": ok }),
    );
}
pub(crate) fn delete_message(app: &AppHandle, platform: &str, native_id: &str) {
    // Persist moderation so replay does not resurface deleted messages by default.

    if crate::session::chat_recording() {
        if let Some(p) = session_path(app) {
            crate::session::record_chat_delete(&p, native_id);
        }
    }
    let event = json!({ "scope": "message", "platform": platform, "nativeId": native_id });
    crate::deck::chat_deleted(app, &event);
    let _ = app.emit("chat://delete", event);
}
/// Removes one author's messages: a ban, a timeout (`seconds`) or a hide.
pub(crate) fn delete_user(
    app: &AppHandle,
    platform: &str,
    source: &str,
    author: &str,
    author_id: Option<&str>,
    seconds: Option<u64>,
) {
    let mut event =
        json!({ "scope": "user", "platform": platform, "source": source, "author": author });
    if let Some(id) = author_id {
        event["authorId"] = json!(id);
    }
    if let Some(seconds) = seconds {
        event["seconds"] = json!(seconds);
    }
    publish_delete(app, event);
}
pub(crate) fn clear_source(app: &AppHandle, platform: &str, source: &str) {
    publish_delete(
        app,
        json!({ "scope": "all", "platform": platform, "source": source }),
    );
}

fn publish_delete(app: &AppHandle, event: Value) {
    crate::overlay::push_chat_event(&app.state::<AppState>().overlay, "delete", &event);
    crate::deck::chat_deleted(app, &event);
    let _ = app.emit("chat://delete", event);
}

/// Chat restrictions a source reports; each update carries only what changed.
pub(crate) fn emit_modes(app: &AppHandle, gen: u64, platform: &str, source: &str, modes: Value) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        let _ = app.emit(
            "chat://modes",
            json!({ "platform": platform, "source": source, "modes": modes }),
        );
    }
}

/// The message pinned on a source, or None when the pin is removed.
pub(crate) fn emit_pin(
    app: &AppHandle,
    gen: u64,
    platform: &str,
    source: &str,
    message: Option<ChatMessage>,
) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        let event = json!({ "platform": platform, "source": source, "message": message });
        crate::overlay::push_chat_event(&app.state::<AppState>().overlay, "pin", &event);
        let _ = app.emit("chat://pin", event);
    }
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PollOption {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub votes: Option<u64>,
    /// Share of the votes, 0–100, when the platform reports only percentages.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Poll {
    pub id: String,
    /// "poll" | "prediction"
    pub kind: String,
    pub question: String,
    pub options: Vec<PollOption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    pub ended: bool,
}

/// A running poll or prediction on a source, or None when it closes.
pub(crate) fn emit_poll(
    app: &AppHandle,
    gen: u64,
    platform: &str,
    source: &str,
    poll: Option<Poll>,
) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        let _ = app.emit(
            "chat://poll",
            json!({ "platform": platform, "source": source, "poll": poll }),
        );
    }
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub platform: String, // A chat provider id, or an alert service such as streamlabs.
    pub source: String,
    /// sub | resub | subgift | bits | raid | member | superchat | tip | follow | upgrade |
    /// payforward | streak | charity | gift | kicks | reward | milestone
    pub kind: String,
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>, // Unit depends on kind: bits, months, gifts, viewers, or currency amount.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Empty fragments tell the UI to render message as plain text.

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fragments: Vec<ChatFragment>,
    pub ts: u64,
    /// Sticker or gift artwork.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    /// What was given or redeemed: a reward, a gift, a charity or a membership level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

pub fn emit_alert(app: &AppHandle, alert: Alert) {
    if let Some(p) = session_path(app) {
        crate::session::record_alert(
            &p,
            &alert.platform,
            &alert.source,
            &alert.kind,
            &alert.user,
            alert.amount,
        );
    }
    // Borrow for the overlay before emit consumes the alert, avoiding a clone.

    crate::overlay::push(&app.state::<AppState>().overlay, &alert);
    crate::deck::alert(app, &alert);
    let _ = app.emit("alert://event", alert);
}

pub fn start_chat(app: &AppHandle) {
    reset_msg_counts();
    // Invalidate old connections before clearing queues so late setup cannot overwrite new senders.

    let gen = CHAT_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let settings = Arc::new(crate::config::load(app).settings);
    let running = {
        let st = app.state::<AppState>();
        let mut chat = st.chat.lock().unwrap();
        chat.running.store(false, Ordering::Relaxed);
        chat.senders.lock().unwrap().clear();
        let running = Arc::new(AtomicBool::new(true));
        chat.running = running.clone();
        running
    };
    let active: Vec<ChatSource> = settings
        .chat_sources
        .iter()
        .filter(|x| x.enabled && !x.value.trim().is_empty())
        .cloned()
        .collect();

    for source in &active {
        let Some(provider) = crate::platforms::chat_provider(&source.platform) else {
            continue;
        };
        let (app2, run2, settings2, source) = (
            app.clone(),
            running.clone(),
            settings.clone(),
            source.clone(),
        );
        let label = source_label(&source);
        tauri::async_runtime::spawn_blocking(move || {
            let first = provider.first_backoff();
            let mut backoff = first; // 200 ms ticks.
            while run2.load(Ordering::Relaxed) {
                let connection = Connection {
                    app: &app2,
                    gen,
                    running: &run2,
                    source: &source,
                    label: &label,
                    settings: &settings2,
                };
                if contain_connection_panic(provider.id(), &label, || provider.connect(&connection))
                {
                    backoff = first;
                }
                reconnect_for(&run2, backoff);
                backoff = (backoff * 2).min(300);
            }
        });
    }

    if !active.is_empty() {
        let (app_v, run_v, settings_v, sources_v) = (
            app.clone(),
            running.clone(),
            settings.clone(),
            active.clone(),
        );
        tauri::async_runtime::spawn_blocking(move || {
            run_viewers(sources_v, settings_v, run_v, app_v, gen)
        });
    }

    for provider in crate::platforms::chat_providers() {
        let sources: Vec<ChatSource> = active
            .iter()
            .filter(|source| source.platform == provider.id())
            .cloned()
            .collect();
        if !sources.is_empty() {
            provider.start_shared(&ChatSession {
                app,
                gen,
                running: &running,
                sources: &sources,
            });
        }
    }
}

/// What the UI shows for a source: its name, or its channel when it has none.
pub(crate) fn source_label(source: &ChatSource) -> String {
    if source.name.trim().is_empty() {
        source.value.clone()
    } else {
        source.name.clone()
    }
}

// AssertUnwindSafe is valid here: no captured state is read after a failed attempt.

fn contain_connection_panic(platform: &str, source: &str, attempt: impl FnOnce() -> bool) -> bool {
    let _contained = crate::telemetry::ContainedPanicScope::enter();
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(attempt)) {
        Ok(connected) => connected,
        Err(_) => {
            log::error!(
                "chat/{platform}: contained panic in {source}; reconnecting the source without stopping the stream"
            );
            false
        }
    }
}

pub fn stop_chat(app: &AppHandle) {
    let st = app.state::<AppState>();
    let chat = st.chat.lock().unwrap();
    chat.running.store(false, Ordering::Relaxed);
    chat.senders.lock().unwrap().clear();
}

// Poll cancellation every 200 ms while backing off.
pub(crate) fn reconnect_for(running: &AtomicBool, ticks: u32) {
    for _ in 0..ticks {
        if !running.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

// Only 401 invalidates a token; transient errors must not disable authenticated chat.

// Replace line breaks to prevent injecting additional IRC commands.
pub(crate) fn sanitize_outgoing(s: &str) -> String {
    let one_line: String = s
        .chars()
        .map(|c| if c == '\r' || c == '\n' { ' ' } else { c })
        .collect();
    one_line.trim().chars().take(480).collect()
}

/// Missing or empty sources selects all send-capable channels; fail if none accepted the message.
pub fn send_message(
    app: &AppHandle,
    text: &str,
    sources: Option<Vec<String>>,
    reply: Option<ReplyTo>,
) -> Result<(), String> {
    let text = sanitize_outgoing(text);
    if text.is_empty() {
        return Err(Msg::ChatEmptyMessage.now());
    }
    let cfg = crate::config::load(app);
    let senders = {
        let st = app.state::<AppState>();
        let guard = st.chat.lock().map_err(|_| Msg::ChatStateLocked.now())?;
        guard.senders.clone()
    };
    let reply_to = reply
        .as_ref()
        .and_then(|r| r.native_id.as_deref())
        .and_then(reply_id)
        .map(String::from);
    let targets: Vec<String> = match sources {
        // A reply belongs to the chat its message came from.
        Some(ids) if reply.is_some() => ids.into_iter().take(1).collect(),
        Some(ids) if !ids.is_empty() => ids,

        _ => {
            let mut t: Vec<String> = senders.lock().unwrap().keys().cloned().collect();
            for s in &cfg.settings.chat_sources {
                if s.enabled
                    && crate::platforms::chat_provider(&s.platform)
                        .is_some_and(|provider| provider.sends_by_default())
                {
                    t.push(s.id.clone());
                }
            }
            t
        }
    };
    let mut sent = 0u32;
    let mut last_err: Option<String> = None;
    let mut sent_once: HashSet<&'static str> = HashSet::new();
    for id in targets {
        let Some(source) = cfg.settings.chat_sources.iter().find(|s| s.id == id) else {
            continue;
        };
        let Some(provider) = crate::platforms::chat_provider(&source.platform) else {
            continue;
        };
        if provider.sends_once() && !sent_once.insert(provider.id()) {
            continue;
        }
        let label = source_label(source);
        match provider.send(&Outbox {
            app,
            senders: &senders,
            source,
            label: &label,
            text: &text,
            reply: reply.as_ref(),
            reply_to: reply_to.as_deref(),
        }) {
            Some(Ok(())) => sent += 1,
            Some(Err(e)) => last_err = Some(e),
            None => {}
        }
    }
    if sent == 0 {
        return Err(last_err.unwrap_or_else(|| Msg::ChatNoChannelSignedIn.now()));
    }
    Ok(())
}

// Best-effort parsing of localized currency text; it is not a financial amount parser.
pub(crate) fn parse_amount(s: &str) -> Option<f64> {
    let kept: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    if kept.is_empty() {
        return None;
    }
    let norm = match kept.rfind([',', '.']) {
        Some(p) => {
            let frac: String = kept[p + 1..]
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect();
            // A final three-digit group means thousands unless a different separator precedes it.

            let other = if kept[p..].starts_with(',') { '.' } else { ',' };
            if frac.len() == 3 && !kept[..p].contains(other) {
                kept.chars().filter(|c| c.is_ascii_digit()).collect()
            } else {
                let int: String = kept[..p].chars().filter(|c| c.is_ascii_digit()).collect();
                format!("{int}.{frac}")
            }
        }
        None => kept,
    };
    norm.parse::<f64>().ok()
}

// Fetch audience and followers together when the provider returns both in one response.

#[derive(Default)]
pub struct ChannelCounts {
    /// None means offline or unavailable, not zero viewers.
    pub viewers: Option<u64>,
    /// None means unsupported or unavailable, not zero followers.
    pub followers: Option<u64>,
    /// Liveness the platform reports apart from the viewer count.
    pub live: Option<bool>,
    /// Extra fields the audience UI reads, such as why an audience is not counted.
    pub details: Map<String, Value>,
}

#[derive(Default)]
struct ViewerSample {
    total: u64,
    any_live: bool,
    items: Vec<Value>,
    followers: Vec<Value>,
}

fn collect_viewer_sample(
    sources: &[ChatSource],
    is_current: impl Fn() -> bool,
    mut fetch: impl FnMut(&ChatSource) -> Option<ChannelCounts>,
) -> Option<ViewerSample> {
    let mut sample = ViewerSample::default();
    for src in sources {
        if !is_current() {
            return None;
        }
        let Some(counts) = fetch(src) else {
            continue;
        };
        if !is_current() {
            return None;
        }
        let label = if src.name.trim().is_empty() {
            &src.value
        } else {
            &src.name
        };
        let live = counts.live.unwrap_or(counts.viewers.is_some());
        sample.total = sample.total.saturating_add(counts.viewers.unwrap_or(0));
        sample.any_live |= live;
        if let Some(total) = counts.followers {
            sample.followers.push(json!({
                "platform": src.platform,
                "source": label,
                "total": total,
            }));
        }
        let mut item = json!({
            "platform": src.platform,
            "source": label,
            "viewers": counts.viewers,
            "live": live,
        });
        if let Some(fields) = item.as_object_mut() {
            fields.extend(counts.details);
        }
        sample.items.push(item);
    }
    is_current().then_some(sample)
}

// followers_count is undocumented; leave it unavailable rather than assuming zero if it disappears.

fn run_viewers(
    sources: Vec<ChatSource>,
    settings: Arc<Settings>,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) {
    let mut readers: Vec<(&'static str, Box<dyn AudienceReader>)> = Vec::new();
    for provider in crate::platforms::chat_providers() {
        let mine: Vec<ChatSource> = sources
            .iter()
            .filter(|src| src.platform == provider.id())
            .cloned()
            .collect();
        if mine.is_empty() {
            continue;
        }
        let setup = AudienceSetup {
            app: &app,
            running: &running,
            settings: &settings,
            sources: &mine,
        };
        if let Some(reader) = provider.audience(&setup) {
            readers.push((provider.id(), reader));
        }
    }
    let is_current = || running.load(Ordering::Relaxed) && CHAT_GEN.load(Ordering::SeqCst) == gen;
    while is_current() {
        for (_, reader) in &mut readers {
            reader.begin_cycle();
        }
        let Some(sample) = collect_viewer_sample(&sources, is_current, |src| {
            match readers.iter_mut().find(|(id, _)| *id == src.platform) {
                Some((_, reader)) => reader.read(src),
                None => Some(ChannelCounts::default()),
            }
        }) else {
            return;
        };
        if let Some(p) = session_path(&app) {
            if !is_current() {
                return;
            }
            crate::session::record_viewers(&p, sample.total, &sample.items);
            // Followers are report-only; keep them out of the live viewers IPC payload.
            crate::session::record_followers(&p, &sample.followers);
        }
        if !is_current() {
            return;
        }
        let update =
            json!({ "total": sample.total, "anyLive": sample.any_live, "items": sample.items });
        crate::deck::viewers_changed(&app, &update);
        let _ = app.emit("viewers://update", update);

        for _ in 0..150 {
            if !is_current() {
                return;
            }
            thread::sleep(Duration::from_millis(200));
        }
    }
}

/// Malformed network input every chat parser must survive.
#[cfg(test)]
pub(crate) fn hostile_chat_corpus() -> Vec<String> {
    let mut cases: Vec<String> = vec![
        String::new(),
        " ".into(),
        ":".into(),
        "@".into(),
        "@;".into(),
        "@=".into(),
        "\u{1}".into(),
        "\u{1}ACTION".into(),
        "\u{1}ACTION \u{1}".into(),
        "\0\0\0".into(),
        "\r\n".into(),
        "😀".into(),
        "[emote:😀]".into(),
        "[emote:".into(),
        "[emote:]".into(),
        "[emote::]".into(),
        "[emote:1:😀]".into(),
        "😀[emote:1:x]😀".into(),
        "[emote:1:x".into(),
        "]]][emote:".into(),
        "@badge-info=;badges=;color= :a!a@a.tmi.twitch.tv PRIVMSG #c :oi".into(),
        "@ :a!a@a PRIVMSG #c :".into(),
        ":a!a@a PRIVMSG".into(),
        "PRIVMSG #c :sem tags".into(),
        "@k=v :n!n@n PRIVMSG #c :\u{1}ACTION dança\u{1}".into(),
        ":tmi.twitch.tv CLEARCHAT #c".into(),
        ":tmi.twitch.tv CLEARCHAT #c :".into(),
        "CLEARCHAT:".into(),
        "{}".into(),
        "[]".into(),
        "null".into(),
        "não é json".into(),
        r#"{"event":"x"}"#.into(),
        r#"{"event":"x","data":"{}"}"#.into(),
        r#"{"event":"x","data":"não é json aninhado"}"#.into(),
        r#"{"event":"App\\Events\\ChatMessageEvent","data":"{}"}"#.into(),
    ];

    cases.push("á".repeat(20_000));
    cases.push(format!(
        "@{} PRIVMSG #c :{}",
        "t=v;".repeat(2_000),
        "😀".repeat(2_000)
    ));
    cases.push(format!(
        "[emote:{}:{}]",
        "9".repeat(5_000),
        "ç".repeat(5_000)
    ));
    cases
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platforms::cinefy;

    fn viewer_source(platform: &str, value: &str, name: &str) -> crate::config::ChatSource {
        crate::config::ChatSource {
            id: format!("{platform}:{value}:{name}"),
            platform: platform.into(),
            value: value.into(),
            name: name.into(),
            enabled: true,
            has_send_token: false,
        }
    }

    fn cinefy_audience(
        audience_status: cinefy::AudienceStatus,
        live: bool,
        viewers: Option<u64>,
    ) -> cinefy::AudienceSnapshot {
        cinefy::AudienceSnapshot {
            audience_status,
            live,
            viewers,
            embedded_viewers: None,
            audience_origin: None,
            title: None,
            started_at: None,
        }
    }

    #[test]
    fn viewers_sum_native_counts_without_attributing_embedded_audience_to_cinefy() {
        let sources = [
            viewer_source("cinefy", "native", "Native channel"),
            viewer_source("cinefy", "embedded", "Embedded channel"),
            viewer_source("twitch", "upstream", "Upstream channel"),
        ];
        let sample = collect_viewer_sample(
            &sources,
            || true,
            |source| match source.value.as_str() {
                "native" => {
                    let mut audience =
                        cinefy_audience(cinefy::AudienceStatus::Live, true, Some(12));
                    audience.title = Some("Synthetic live".into());
                    audience.started_at = Some("2026-09-09T10:00:00Z".into());
                    audience.audience_origin = Some(cinefy::AudienceOrigin::Kick);
                    Some(cinefy::counts(audience))
                }
                "embedded" => {
                    let mut audience =
                        cinefy_audience(cinefy::AudienceStatus::Embedded, true, Some(900));
                    audience.audience_origin = Some(cinefy::AudienceOrigin::Twitch);
                    audience.embedded_viewers = Some(900);
                    Some(cinefy::counts(audience))
                }
                _ => Some(ChannelCounts {
                    viewers: Some(30),
                    ..Default::default()
                }),
            },
        )
        .expect("current viewer sample");
        assert_eq!(sample.total, 42);
        assert!(sample.any_live);
        assert_eq!(sample.items[0]["viewers"], 12);
        assert_eq!(sample.items[0]["audienceStatus"], "live");
        assert!(sample.items[0].get("audienceOrigin").is_none());
        assert!(sample.items[0].get("embeddedViewers").is_none());
        assert_eq!(sample.items[1]["viewers"], Value::Null);
        assert_eq!(sample.items[1]["live"], true);
        assert_eq!(sample.items[1]["audienceOrigin"], "twitch");
        assert_eq!(sample.items[1]["embeddedViewers"], 900);
        let recorded = crate::session::domain::viewers_line(1, sample.total, &sample.items);
        assert_eq!(recorded["items"], json!(sample.items));
        assert_eq!(recorded["items"][0]["title"], "Synthetic live");
        assert_eq!(recorded["items"][0]["startedAt"], "2026-09-09T10:00:00Z");
    }

    #[test]
    fn cinefy_live_state_does_not_depend_on_viewer_count_availability() {
        for (status, live, count, expected_count) in [
            (cinefy::AudienceStatus::Live, true, Some(0), json!(0)),
            (cinefy::AudienceStatus::Offline, false, Some(0), json!(0)),
            (cinefy::AudienceStatus::Unavailable, true, None, Value::Null),
            (
                cinefy::AudienceStatus::Unavailable,
                false,
                None,
                Value::Null,
            ),
            (cinefy::AudienceStatus::Embedded, true, None, Value::Null),
        ] {
            let sample = collect_viewer_sample(
                &[viewer_source("cinefy", "channel", "")],
                || true,
                |_| Some(cinefy::counts(cinefy_audience(status, live, count))),
            )
            .expect("current viewer sample");
            assert_eq!(sample.total, 0);
            assert_eq!(sample.any_live, live);
            assert_eq!(sample.items[0]["live"], live);
            assert_eq!(sample.items[0]["viewers"], expected_count);
            assert!(sample.items[0].get("title").is_none());
            assert!(sample.items[0].get("startedAt").is_none());
        }
    }

    #[test]
    fn viewers_preserve_legacy_platform_payloads_and_report_only_followers() {
        let sources = [
            viewer_source("twitch", "channel", "Named channel"),
            viewer_source("kick", "channel", ""),
            viewer_source("youtube", "video", ""),
        ];
        let sample = collect_viewer_sample(
            &sources,
            || true,
            |source| match source.platform.as_str() {
                "twitch" => Some(ChannelCounts {
                    viewers: None,
                    followers: Some(100),
                    ..Default::default()
                }),
                "kick" => Some(ChannelCounts {
                    viewers: Some(0),
                    ..Default::default()
                }),
                _ => Some(ChannelCounts {
                    viewers: Some(5),
                    ..Default::default()
                }),
            },
        )
        .expect("current viewer sample");
        assert_eq!(sample.total, 5);
        assert!(sample.any_live);
        assert_eq!(
            sample.items,
            vec![
                json!({ "platform": "twitch", "source": "Named channel", "viewers": null, "live": false }),
                json!({ "platform": "kick", "source": "channel", "viewers": 0, "live": true }),
                json!({ "platform": "youtube", "source": "video", "viewers": 5, "live": true }),
            ]
        );
        assert_eq!(
            sample.followers,
            vec![json!({ "platform": "twitch", "source": "Named channel", "total": 100 })]
        );
    }

    #[test]
    fn viewers_deduplicate_cinefy_aliases_without_changing_other_platforms() {
        let sources = [
            viewer_source("cinefy", "@Example", "First label"),
            viewer_source("cinefy", "https://cinefy.gg/example", "Second label"),
            viewer_source(
                "cinefy",
                "https://cinefy.gg/popout/example/chat",
                "Third label",
            ),
            viewer_source("twitch", "example", "Twitch first"),
            viewer_source("twitch", "example", "Twitch second"),
        ];
        let mut calls = 0;
        let mut cinefy_rooms = std::collections::HashSet::new();
        let sample = collect_viewer_sample(
            &sources,
            || true,
            |source| {
                if source.platform == "cinefy" {
                    if cinefy::already_read_this_cycle(&mut cinefy_rooms, &source.value) {
                        return None;
                    }
                    calls += 1;
                    Some(cinefy::counts(cinefy_audience(
                        cinefy::AudienceStatus::Live,
                        true,
                        Some(10),
                    )))
                } else {
                    calls += 1;
                    Some(ChannelCounts {
                        viewers: Some(20),
                        ..Default::default()
                    })
                }
            },
        )
        .expect("current viewer sample");
        assert_eq!(calls, 3);
        assert_eq!(sample.items.len(), 3);
        assert_eq!(sample.items[0]["source"], "First label");
        assert_eq!(sample.total, 50);
    }

    #[test]
    fn viewers_discard_partial_samples_when_cancelled_during_a_fetch() {
        let sources = [
            viewer_source("twitch", "first", ""),
            viewer_source("cinefy", "second", ""),
        ];
        let running = AtomicBool::new(true);
        let mut calls = 0;
        let sample = collect_viewer_sample(
            &sources,
            || running.load(Ordering::Relaxed),
            |_| {
                calls += 1;
                if calls == 2 {
                    running.store(false, Ordering::Relaxed);
                }
                Some(ChannelCounts {
                    viewers: Some(5),
                    ..Default::default()
                })
            },
        );
        assert_eq!(calls, 2);
        assert!(
            sample.is_none(),
            "a partial sample must not reach the journal or IPC"
        );
        let sample = collect_viewer_sample(
            &sources,
            || false,
            |_| panic!("stopped collection must not fetch"),
        );
        assert!(sample.is_none());
    }

    #[test]
    fn viewers_discard_results_from_a_superseded_generation() {
        let generation = AtomicU64::new(1);
        let sample = collect_viewer_sample(
            &[viewer_source("cinefy", "channel", "")],
            || generation.load(Ordering::SeqCst) == 1,
            |_| {
                generation.store(2, Ordering::SeqCst);
                Some(cinefy::counts(cinefy_audience(
                    cinefy::AudienceStatus::Live,
                    true,
                    Some(5),
                )))
            },
        );
        assert!(sample.is_none());
    }

    #[test]
    fn viewers_total_saturates_instead_of_overflowing_on_hostile_counts() {
        let sources = [
            viewer_source("twitch", "first", ""),
            viewer_source("kick", "second", ""),
        ];
        let sample = collect_viewer_sample(
            &sources,
            || true,
            |_| {
                Some(ChannelCounts {
                    viewers: Some(u64::MAX),
                    ..Default::default()
                })
            },
        )
        .expect("current viewer sample");
        assert_eq!(sample.total, u64::MAX);
    }

    #[test]
    fn amount_parser_tolerates_hostile_network_fixtures() {
        for case in hostile_chat_corpus() {
            let _ = parse_amount(&case);
        }
    }

    fn native_message(source: &str, native_id: Option<&str>) -> ChatMessage {
        ChatMessage {
            id: "local".into(),
            platform: "cinefy".into(),
            source: source.into(),
            author: "autor".into(),
            author_id: None,
            native_id: native_id.map(String::from),
            color: None,
            text: "oi".into(),
            fragments: vec![text_frag("oi")],
            badges: vec![],
            ts: 1,
            ..Default::default()
        }
    }

    #[test]
    fn native_dedup_is_bounded_and_idempotent_per_platform_and_source() {
        let mut dedup = NativeMessageDedup::default();
        let first = native_message("canal-a", Some("id-1"));
        assert!(dedup.accept(&first));
        assert!(!dedup.accept(&first));
        assert!(dedup.accept(&native_message("canal-b", Some("id-1"))));
        let local = native_message("canal-a", None);
        assert!(dedup.accept(&local));
        assert!(dedup.accept(&local));

        let mut bounded = NativeMessageDedup::default();
        for i in 0..=NATIVE_DEDUP_CAP {
            assert!(bounded.accept(&native_message("canal", Some(&format!("id-{i}")))));
        }
        assert_eq!(bounded.order.len(), NATIVE_DEDUP_CAP);
        assert_eq!(bounded.seen.len(), NATIVE_DEDUP_CAP);

        assert!(bounded.accept(&native_message("canal", Some("id-0"))));
    }

    use super::parse_amount;

    #[test]
    fn parse_amount_thousands() {
        assert_eq!(parse_amount("¥1,000"), Some(1000.0));
        assert_eq!(parse_amount("R$ 1.234"), Some(1234.0));
    }

    #[test]
    fn parse_amount_decimal() {
        assert_eq!(parse_amount("$5.99"), Some(5.99));
        assert_eq!(parse_amount("€2,50"), Some(2.5));
    }

    #[test]
    fn parse_amount_mixed_separators() {
        assert_eq!(parse_amount("1,234.56"), Some(1234.56));
    }
}
