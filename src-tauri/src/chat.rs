mod cinefy;

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::Message;

use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::AppState;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatFragment {
    pub kind: String, // "text" | "emote"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatBadge {
    pub label: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub platform: String, // "twitch" | "youtube" | "kick" | "cinefy"
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
}

#[derive(Default)]
pub struct ChatRuntime {
    pub running: Arc<AtomicBool>,
    /// Source ID -> authenticated Twitch send queue; reset on chat restart.
    pub senders: Arc<Mutex<HashMap<String, mpsc::Sender<String>>>>,
}

static MSG_ID: AtomicU64 = AtomicU64::new(1);
fn next_id() -> String {
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
        let Some(native_id) = msg.native_id.as_deref() else {
            return true;
        };
        let key = NativeMessageKey {
            platform: msg.platform.clone(),
            source: msg.source.clone(),
            native_id: native_id.to_string(),
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

static CHAT_GEN: AtomicU64 = AtomicU64::new(0);

fn session_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.state::<AppState>()
        .engine
        .lock()
        .ok()?
        .session_path
        .clone()
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
fn text_frag(t: &str) -> ChatFragment {
    ChatFragment {
        kind: "text".into(),
        text: Some(t.to_string()),
        url: None,
    }
}
fn frags_to_text(frags: &[ChatFragment]) -> String {
    frags
        .iter()
        .filter_map(|f| f.text.clone())
        .collect::<Vec<_>>()
        .join("")
}

fn emit_chat(app: &AppHandle, msg: ChatMessage) {
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
            );
        }
    }
    crate::overlay::push_chat(&app.state::<AppState>().overlay, &msg);
    let _ = app.emit("chat://message", msg);
}

fn emit_chat_gen(app: &AppHandle, gen: u64, msg: ChatMessage) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        emit_chat(app, msg);
    }
}
fn chat_status(app: &AppHandle, platform: &str, source: &str, status: &str) {
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

fn chat_status_gen(app: &AppHandle, gen: u64, platform: &str, source: &str, status: &str) {
    if CHAT_GEN.load(Ordering::SeqCst) == gen {
        chat_status(app, platform, source, status);
    }
}
// Auth status describes sending permission, not the anonymous read connection.

fn chat_auth(app: &AppHandle, source_id: &str, login: &str, ok: bool) {
    let _ = app.emit(
        "chat://auth",
        json!({ "source": source_id, "login": login, "ok": ok }),
    );
}
fn delete_message(app: &AppHandle, platform: &str, native_id: &str) {
    // Persist moderation so replay does not resurface deleted messages by default.

    if crate::session::chat_recording() {
        if let Some(p) = session_path(app) {
            crate::session::record_chat_delete(&p, native_id);
        }
    }
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "message", "platform": platform, "nativeId": native_id }),
    );
}
fn delete_user(app: &AppHandle, platform: &str, source: &str, author: &str) {
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "user", "platform": platform, "source": source, "author": author }),
    );
}
fn clear_source(app: &AppHandle, platform: &str, source: &str) {
    let _ = app.emit(
        "chat://delete",
        json!({ "scope": "all", "platform": platform, "source": source }),
    );
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: String,
    pub platform: String, // twitch | youtube | kick
    pub source: String,
    pub kind: String, // sub|resub|subgift|bits|raid|member|superchat|tip|follow
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
    let _ = app.emit("alert://event", alert);
}

pub fn start_chat(app: &AppHandle) {
    reset_msg_counts();
    // Invalidate old connections before clearing queues so late setup cannot overwrite new senders.

    let gen = CHAT_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let s = crate::config::load(app).settings;
    let running = {
        let st = app.state::<AppState>();
        let mut chat = st.chat.lock().unwrap();
        chat.running.store(false, Ordering::Relaxed);
        chat.senders.lock().unwrap().clear();
        let running = Arc::new(AtomicBool::new(true));
        chat.running = running.clone();
        running
    };
    let api_key = s.youtube_api_key.clone();

    for src in s
        .chat_sources
        .iter()
        .filter(|x| x.enabled && !x.value.trim().is_empty())
    {
        let label = if src.name.trim().is_empty() {
            src.value.clone()
        } else {
            src.name.clone()
        };
        let (app2, run2, value) = (app.clone(), running.clone(), src.value.clone());
        let sid = src.id.clone();
        let plat = src.platform.clone();
        match src.platform.as_str() {
            "twitch" => {
                // Resolve credentials on every connection so expired OAuth tokens can refresh.

                let send_key = format!("chat_send_{}", src.id);
                tauri::async_runtime::spawn_blocking(move || {
                    let mut backoff: u32 = 15; // 200 ms ticks.
                    while run2.load(Ordering::Relaxed) {
                        let tok = crate::keys::get_key(&send_key)
                            .or_else(|| crate::auth::twitch_token(&app2));
                        if contain_connection_panic(&plat, &label, || {
                            run_twitch(&value, &label, &sid, tok, run2.clone(), app2.clone(), gen)
                        }) {
                            backoff = 15;
                        }
                        reconnect_for(&run2, backoff);
                        backoff = (backoff * 2).min(300);
                    }
                });
            }
            "kick" => {
                tauri::async_runtime::spawn_blocking(move || {
                    let mut backoff: u32 = 15;
                    while run2.load(Ordering::Relaxed) {
                        if contain_connection_panic(&plat, &label, || {
                            run_kick(&value, &label, run2.clone(), app2.clone(), gen)
                        }) {
                            backoff = 15;
                        }
                        reconnect_for(&run2, backoff);
                        backoff = (backoff * 2).min(300);
                    }
                });
            }
            "youtube" => {
                // InnerTube can read without a Data API key.
                let key = api_key.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    // Offline channels poll less often; backoff uses 200 ms ticks.
                    let mut backoff: u32 = 100;
                    while run2.load(Ordering::Relaxed) {
                        if contain_connection_panic(&plat, &label, || {
                            run_youtube(&key, &value, &label, run2.clone(), app2.clone(), gen)
                        }) {
                            backoff = 100;
                        }
                        reconnect_for(&run2, backoff);
                        backoff = (backoff * 2).min(300);
                    }
                });
            }
            "cinefy" => {
                tauri::async_runtime::spawn_blocking(move || {
                    let mut backoff: u32 = 15;
                    while run2.load(Ordering::Relaxed) {
                        let sink = CinefySink {
                            app: app2.clone(),
                            source: label.clone(),
                            gen,
                        };
                        if contain_connection_panic(&plat, &label, || {
                            cinefy::run(&value, run2.clone(), &sink)
                        }) {
                            backoff = 15;
                        }
                        reconnect_for(&run2, backoff);
                        backoff = (backoff * 2).min(300);
                    }
                });
            }
            _ => {}
        }
    }

    let vsources: Vec<crate::config::ChatSource> = s
        .chat_sources
        .iter()
        .filter(|x| x.enabled && !x.value.trim().is_empty())
        .cloned()
        .collect();
    if !vsources.is_empty() {
        let (app_v, run_v, key_v) = (app.clone(), running.clone(), api_key.clone());
        tauri::async_runtime::spawn_blocking(move || {
            run_viewers(vsources, key_v, run_v, app_v, gen)
        });
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
fn reconnect_for(running: &AtomicBool, ticks: u32) {
    for _ in 0..ticks {
        if !running.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

struct CinefySink {
    app: AppHandle,
    source: String,
    gen: u64,
}

impl cinefy::OutputPort for CinefySink {
    fn status(&self, status: cinefy::ConnectionStatus) {
        let status = match status {
            cinefy::ConnectionStatus::Connected => "connected",
            cinefy::ConnectionStatus::Disconnected => "disconnected",
            cinefy::ConnectionStatus::Error => "error",
        };
        chat_status_gen(&self.app, self.gen, "cinefy", &self.source, status);
    }

    fn publish(&self, event: cinefy::Event) {
        if CHAT_GEN.load(Ordering::SeqCst) != self.gen {
            return;
        }
        match event {
            cinefy::Event::Message(message) => {
                let text = message.text;
                emit_chat_gen(
                    &self.app,
                    self.gen,
                    ChatMessage {
                        id: next_id(),
                        platform: "cinefy".into(),
                        source: self.source.clone(),
                        author: message.author,
                        author_id: message.author_id,
                        native_id: Some(message.native_id),
                        color: message.color,
                        fragments: vec![text_frag(&text)],
                        badges: message
                            .badges
                            .into_iter()
                            .map(|badge| ChatBadge {
                                label: badge.label,
                                kind: badge.kind,
                            })
                            .collect(),
                        text,
                        ts: if message.published_at_ms == 0 {
                            now_ms()
                        } else {
                            message.published_at_ms
                        },
                    },
                );
            }
            cinefy::Event::DeleteMessage { native_id } => {
                delete_message(&self.app, "cinefy", &native_id);
            }
        }
    }
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
fn run_twitch(
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

    let mut out_rx: Option<mpsc::Receiver<String>> = None;
    let mut send_login: Option<String> = None;
    if let Some((login, _)) = &creds {
        let (tx, rx) = mpsc::channel::<String>();
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
                let text = match rx.try_recv() {
                    Ok(t) => t,
                    Err(_) => break,
                };
                let clean = sanitize_outgoing(&text);
                if clean.is_empty() {
                    continue;
                }
                if socket
                    .send(Message::Text(format!("PRIVMSG #{ch} :{clean}").into()))
                    .is_ok()
                {
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

// Only 401 invalidates a token; transient errors must not disable authenticated chat.

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

// Replace line breaks to prevent injecting additional IRC commands.
fn sanitize_outgoing(s: &str) -> String {
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
    let targets: Vec<String> = match sources {
        Some(ids) if !ids.is_empty() => ids,

        _ => {
            let mut t: Vec<String> = senders.lock().unwrap().keys().cloned().collect();
            for s in &cfg.settings.chat_sources {
                if s.enabled && (s.platform == "youtube" || s.platform == "kick") {
                    t.push(s.id.clone());
                }
            }
            t
        }
    };
    let label_of = |id: &str| -> String {
        cfg.settings
            .chat_sources
            .iter()
            .find(|s| s.id == id)
            .map(|s| {
                if s.name.trim().is_empty() {
                    s.value.clone()
                } else {
                    s.name.clone()
                }
            })
            .unwrap_or_default()
    };
    let mut sent = 0u32;
    let mut last_err: Option<String> = None;
    let mut youtube_done = false; // YouTube inserts into the signed-in user's live chat; send only once.
    for id in targets {
        let src = cfg.settings.chat_sources.iter().find(|s| s.id == id);
        match src.map(|s| s.platform.as_str()) {
            Some("twitch") => {
                if let Some(tx) = senders.lock().unwrap().get(&id) {
                    if tx.send(text.clone()).is_ok() {
                        sent += 1;
                    }
                }
            }

            Some("youtube") if !youtube_done => {
                youtube_done = true;
                match crate::auth::youtube_send(app, &text) {
                    Ok(()) => {
                        sent += 1;
                        emit_chat(
                            app,
                            ChatMessage {
                                id: next_id(),
                                platform: "youtube".into(),
                                source: label_of(&id),
                                author: Msg::ChatSelfAuthor.now(),
                                author_id: None,
                                native_id: None,
                                color: Some("#ffb323".into()),
                                text: text.clone(),
                                fragments: vec![text_frag(&text)],
                                badges: vec![],
                                ts: now_ms(),
                            },
                        );
                    }
                    Err(e) => last_err = Some(e),
                }
            }

            // Pusher echoes Kick messages, so local echo would duplicate them.
            Some("kick") => {
                let slug = src.map(|s| s.value.clone()).unwrap_or_default();
                match crate::auth::kick_send(app, &text, &slug) {
                    Ok(()) => sent += 1,
                    Err(e) => last_err = Some(e),
                }
            }
            _ => {}
        }
    }
    if sent == 0 {
        return Err(last_err.unwrap_or_else(|| Msg::ChatNoChannelSignedIn.now()));
    }
    Ok(())
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

fn fetch_json(url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .set("User-Agent", "Corneta/1.0")
        .timeout(Duration::from_secs(5))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn add_bttv(v: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = v.as_array() {
        for e in arr {
            if let (Some(code), Some(id)) = (
                e.get("code").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(
                    code.to_string(),
                    format!("https://cdn.betterttv.net/emote/{id}/2x"),
                );
            }
        }
    }
}

fn add_ffz(v: &Value, map: &mut HashMap<String, String>) {
    let Some(sets) = v.get("sets").and_then(|x| x.as_object()) else {
        return;
    };
    for set in sets.values() {
        let Some(emos) = set.get("emoticons").and_then(|x| x.as_array()) else {
            continue;
        };
        for e in emos {
            let name = e.get("name").and_then(|x| x.as_str());
            let urls = e.get("urls");
            let pick = urls
                .and_then(|u| u.get("2").or_else(|| u.get("4")).or_else(|| u.get("1")))
                .and_then(|x| x.as_str());
            if let (Some(name), Some(u)) = (name, pick) {
                let full = if let Some(rest) = u.strip_prefix("//") {
                    format!("https://{rest}")
                } else {
                    u.to_string()
                };
                map.insert(name.to_string(), full);
            }
        }
    }
}

fn add_7tv(emotes: &Value, map: &mut HashMap<String, String>) {
    if let Some(arr) = emotes.as_array() {
        for e in arr {
            if let (Some(name), Some(id)) = (
                e.get("name").and_then(|x| x.as_str()),
                e.get("id").and_then(|x| x.as_str()),
            ) {
                map.insert(
                    name.to_string(),
                    format!("https://cdn.7tv.app/emote/{id}/2x.webp"),
                );
            }
        }
    }
}

// Share global emote fetches across reconnects; failed empty responses must not populate this cache.
type ThirdPartyCache = Mutex<Option<(Instant, HashMap<String, String>)>>;
static GLOBAL_3P: OnceLock<ThirdPartyCache> = OnceLock::new();

fn fetch_global_thirdparty() -> HashMap<String, String> {
    let cache = GLOBAL_3P.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((at, map)) = guard.as_ref() {
            if at.elapsed() < Duration::from_secs(3600) {
                return map.clone();
            }
        }
    }
    let mut map = HashMap::new();
    if let Some(v) = fetch_json("https://api.betterttv.net/3/cached/emotes/global") {
        add_bttv(&v, &mut map);
    }
    if let Some(v) = fetch_json("https://api.frankerfacez.com/v1/set/global") {
        add_ffz(&v, &mut map);
    }
    if let Some(v) = fetch_json("https://7tv.io/v3/emote-sets/global") {
        add_7tv(v.get("emotes").unwrap_or(&Value::Null), &mut map);
    }
    // A temporary network failure must not suppress emotes for the entire TTL.
    if !map.is_empty() {
        if let Ok(mut guard) = cache.lock() {
            *guard = Some((Instant::now(), map.clone()));
        }
    }
    map
}

fn fetch_channel_thirdparty(room_id: &str, map: &mut HashMap<String, String>) {
    if let Some(v) = fetch_json(&format!(
        "https://api.betterttv.net/3/cached/users/twitch/{room_id}"
    )) {
        add_bttv(v.get("channelEmotes").unwrap_or(&Value::Null), map);
        add_bttv(v.get("sharedEmotes").unwrap_or(&Value::Null), map);
    }
    if let Some(v) = fetch_json(&format!(
        "https://api.frankerfacez.com/v1/room/id/{room_id}"
    )) {
        add_ffz(&v, map);
    }
    if let Some(v) = fetch_json(&format!("https://7tv.io/v3/users/twitch/{room_id}")) {
        add_7tv(v.pointer("/emote_set/emotes").unwrap_or(&Value::Null), map);
    }
}

fn apply_thirdparty(
    frags: Vec<ChatFragment>,
    emotes: &HashMap<String, String>,
) -> Vec<ChatFragment> {
    if emotes.is_empty() {
        return frags;
    }
    let mut out = vec![];
    for f in frags {
        if f.kind != "text" {
            out.push(f);
            continue;
        }
        let text = f.text.unwrap_or_default();
        let mut buf = String::new();
        for word in text.split_inclusive(' ') {
            let bare = word.trim_end_matches(' ');
            if let Some(url) = emotes.get(bare) {
                if !buf.is_empty() {
                    out.push(text_frag(&buf));
                    buf.clear();
                }
                out.push(ChatFragment {
                    kind: "emote".into(),
                    text: Some(bare.to_string()),
                    url: Some(url.clone()),
                });
                if word.ends_with(' ') {
                    buf.push(' ');
                }
            } else {
                buf.push_str(word);
            }
        }
        if !buf.is_empty() {
            out.push(text_frag(&buf));
        }
    }
    out
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

fn extract_video_id(input: &str) -> String {
    let s = input.trim();
    if let Some(i) = s.find("v=") {
        return s[i + 2..]
            .split(['&', '#'])
            .next()
            .unwrap_or("")
            .to_string();
    }
    for marker in ["youtu.be/", "/live/", "/shorts/", "/embed/"] {
        if let Some(i) = s.find(marker) {
            return s[i + marker.len()..]
                .split(['?', '&', '#', '/'])
                .next()
                .unwrap_or("")
                .to_string();
        }
    }
    s.to_string()
}

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

enum LiveResolve {
    Video(String),
    NotLive,
    ScrapeFailed,
}

fn direct_video_id(s: &str) -> Option<String> {
    let s = s.trim();
    if s.contains("watch?v=")
        || s.contains("youtu.be/")
        || s.contains("/shorts/")
        || s.contains("/embed/")
        || (s.contains("/live/") && !s.trim_end_matches('/').ends_with("/live"))
    {
        let v = extract_video_id(s);
        return (!v.is_empty()).then_some(v);
    }

    if !s.contains('/')
        && !s.starts_with('@')
        && s.len() == 11
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Some(s.to_string());
    }
    None
}

fn youtube_live_url(input: &str) -> Option<String> {
    let s = input.trim().trim_end_matches('/');
    const BASE: &str = "https://www.youtube.com";
    for marker in ["/channel/", "/@", "/c/", "/user/"] {
        if let Some(i) = s.find(marker) {
            let seg = s[i + marker.len()..].split('/').next().unwrap_or("");
            if seg.is_empty() {
                return None;
            }
            return Some(format!("{BASE}/{}{seg}/live", &marker[1..]));
        }
    }
    if let Some(h) = s.strip_prefix('@') {
        return (!h.is_empty()).then(|| format!("{BASE}/@{h}/live"));
    }
    if s.starts_with("UC") && s.len() == 24 {
        return Some(format!("{BASE}/channel/{s}/live"));
    }
    if !s.is_empty() && !s.contains('/') && !s.contains('.') {
        return Some(format!("{BASE}/@{s}/live"));
    }
    None
}

fn live_video_from_html(html: &str) -> Option<String> {
    if !(html.contains("\"isLive\":true") || html.contains("\"isLiveNow\":true")) {
        return None;
    }
    let grab = |start: usize| -> Option<String> {
        let id: String = html[start..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .collect();
        (id.len() == 11).then_some(id)
    };

    if let Some(i) = html.find("rel=\"canonical\"") {
        if let Some(j) = html[i..].find("watch?v=") {
            if j < 220 {
                if let Some(id) = grab(i + j + 8) {
                    return Some(id);
                }
            }
        }
    }

    html.find("\"videoId\":\"").and_then(|i| grab(i + 11))
}

fn scrape_live(url: &str) -> LiveResolve {
    let body = match ureq::get(url)
        .set("User-Agent", BROWSER_UA)
        .set("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(8))
        .call()
    {
        Ok(r) => r.into_string().unwrap_or_default(),
        Err(_) => return LiveResolve::ScrapeFailed,
    };
    if let Some(vid) = live_video_from_html(&body) {
        return LiveResolve::Video(vid);
    }

    if body.contains("ytInitialData") || body.contains("\"videoId\"") {
        LiveResolve::NotLive
    } else {
        LiveResolve::ScrapeFailed
    }
}

fn channel_id_of(input: &str, api_key: &str) -> Option<String> {
    let s = input.trim();
    if let Some(i) = s.find("/channel/") {
        let id = s[i + 9..].split('/').next().unwrap_or("");
        if id.starts_with("UC") {
            return Some(id.to_string());
        }
    }
    if s.starts_with("UC") && s.len() == 24 {
        return Some(s.to_string());
    }
    let handle = if let Some(h) = s.strip_prefix('@') {
        h.to_string()
    } else if let Some(i) = s.find("/@") {
        s[i + 2..].split('/').next().unwrap_or("").to_string()
    } else if !s.contains('/') && !s.contains('.') {
        s.to_string()
    } else {
        return None;
    };
    if handle.is_empty() || api_key.trim().is_empty() {
        return None;
    }
    let url = format!(
        "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@{handle}&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/id")
        .and_then(|x| x.as_str())
        .map(String::from)
}

// Reserve quota-consuming search.list for page-resolution failures, not offline channels.
fn search_live_video_id(channel_id: &str, api_key: &str) -> Option<String> {
    if api_key.trim().is_empty() {
        return None;
    }
    let url = format!(
        "https://www.googleapis.com/youtube/v3/search?part=id&channelId={channel_id}&eventType=live&type=video&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/id/videoId")
        .and_then(|x| x.as_str())
        .map(String::from)
}

pub fn check_youtube_key(key: &str) -> Result<String, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err(Msg::YoutubeKeyPasteFirst.now());
    }
    // Keep the existing provider response locale; changing it also changes raw API error copy.

    let url =
        format!("https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&hl=pt&key={key}");
    match ureq::get(&url).timeout(Duration::from_secs(10)).call() {
        Ok(_) => Ok(Msg::YoutubeKeyValid.now()),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            let reason = v
                .pointer("/error/errors/0/reason")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let status = v
                .pointer("/error/status")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let msg = v
                .pointer("/error/message")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            Err(match reason {
                "keyInvalid" | "badRequest" => Msg::YoutubeKeyInvalid.now(),
                "accessNotConfigured" => Msg::YoutubeKeyApiNotEnabled.now(),
                "ipRefererBlocked" | "forbidden" => Msg::YoutubeKeyRestricted.now(),
                // Exhausted quota still proves the key is valid.
                "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" => {
                    return Ok(Msg::YoutubeKeyValidQuotaMaxed.now())
                }
                _ if status == "PERMISSION_DENIED" => Msg::YoutubeKeyApiNotEnabled.now(),
                _ if !msg.is_empty() => Msg::YoutubeKeyApiError { code, msg }.now(),
                _ => Msg::YoutubeKeyApiStatus { code }.now(),
            })
        }
        Err(_) => Err(Msg::YoutubeKeyNoConnection.now()),
    }
}

fn resolve_youtube_video(input: &str, api_key: &str) -> LiveResolve {
    if let Some(vid) = direct_video_id(input) {
        return LiveResolve::Video(vid);
    }
    let Some(url) = youtube_live_url(input) else {
        return LiveResolve::NotLive;
    };
    match scrape_live(&url) {
        LiveResolve::Video(v) => LiveResolve::Video(v),
        LiveResolve::NotLive => LiveResolve::NotLive,
        LiveResolve::ScrapeFailed => {
            if let Some(cid) = channel_id_of(input, api_key) {
                if let Some(v) = search_live_video_id(&cid, api_key) {
                    return LiveResolve::Video(v);
                }
            }
            LiveResolve::NotLive
        }
    }
}

fn get_live_chat_id(api_key: &str, video_id: &str) -> Option<String> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={video_id}&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let json: Value = serde_json::from_str(&body).ok()?;
    json.pointer("/items/0/liveStreamingDetails/activeLiveChatId")
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn yt_author(item: &Value) -> String {
    item.pointer("/authorDetails/displayName")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| Msg::ChatUnknownUser.now())
}

#[allow(clippy::too_many_arguments)]
fn yt_alert(
    source: &str,
    kind: &str,
    user: String,
    amount: Option<f64>,
    currency: Option<String>,
    tier: Option<String>,
    message: Option<String>,
) -> Alert {
    Alert {
        id: next_id(),
        platform: "youtube".into(),
        source: source.to_string(),
        kind: kind.into(),
        user,
        amount,
        currency,
        tier,
        message,
        fragments: Vec::new(),
        ts: now_ms(),
    }
}

// InnerTube is an undocumented browser endpoint and may change independently of the Data API.

// Parse only the JSON value after marker, ignoring trailing JavaScript.
fn json_after(html: &str, marker: &str) -> Option<Value> {
    let i = html.find(marker)? + marker.len();
    serde_json::Deserializer::from_str(&html[i..])
        .into_iter::<Value>()
        .next()?
        .ok()
}
fn find_between(s: &str, start: &str, end: &str) -> Option<String> {
    let i = s.find(start)? + start.len();
    let j = s[i..].find(end)?;
    Some(s[i..i + j].to_string())
}

fn continuation_token(c: &Value) -> Option<String> {
    for path in [
        "/invalidationContinuationData/continuation",
        "/timedContinuationData/continuation",
        "/reloadContinuationData/continuation",
    ] {
        if let Some(s) = c.pointer(path).and_then(|v| v.as_str()) {
            return Some(s.to_string());
        }
    }
    None
}

/// Returns the public browser API key, client version, and initial continuation.
fn innertube_bootstrap(video_id: &str) -> Option<(String, String, String)> {
    let url = format!("https://www.youtube.com/live_chat?is_popout=1&v={video_id}");
    let html = ureq::get(&url)
        .set("User-Agent", BROWSER_UA)
        .set("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let key = find_between(&html, "\"INNERTUBE_API_KEY\":\"", "\"")?;
    let version = find_between(&html, "\"INNERTUBE_CONTEXT_CLIENT_VERSION\":\"", "\"")
        .or_else(|| find_between(&html, "\"clientVersion\":\"", "\""))?;
    let yt = json_after(&html, "ytInitialData = ")
        .or_else(|| json_after(&html, "window[\"ytInitialData\"] = "))?;
    let cont = yt
        .pointer("/contents/liveChatRenderer/continuations")?
        .as_array()?
        .iter()
        .find_map(continuation_token)?;
    Some((key, version, cont))
}

fn innertube_poll(key: &str, version: &str, cont: &str) -> Option<Value> {
    let url = format!(
        "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={key}&prettyPrint=false"
    );
    let body = json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": version } },
        "continuation": cont,
    });
    let txt = ureq::post(&url)
        .set("User-Agent", BROWSER_UA)
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(10))
        .send_string(&body.to_string())
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&txt).ok()?;
    v.pointer("/continuationContents/liveChatContinuation")
        .cloned()
}

fn yt_message_fragments(message: &Value) -> (String, Vec<ChatFragment>) {
    let mut text = String::new();
    let mut frags = vec![];
    if let Some(runs) = message.get("runs").and_then(|r| r.as_array()) {
        for run in runs {
            if let Some(t) = run.get("text").and_then(|x| x.as_str()) {
                text.push_str(t);
                frags.push(text_frag(t));
            } else if let Some(emoji) = run.get("emoji") {
                let label = emoji
                    .pointer("/shortcuts/0")
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                text.push_str(label);
                match emoji
                    .pointer("/image/thumbnails/0/url")
                    .and_then(|x| x.as_str())
                {
                    Some(u) => frags.push(ChatFragment {
                        kind: "emote".into(),
                        text: Some(label.to_string()),
                        url: Some(u.to_string()),
                    }),
                    None => frags.push(text_frag(label)),
                }
            }
        }
    } else if let Some(s) = message.get("simpleText").and_then(|x| x.as_str()) {
        text.push_str(s);
        frags.push(text_frag(s));
    }
    (text, frags)
}

fn yt_innertube_badges(renderer: &Value) -> Vec<ChatBadge> {
    let mut out = vec![];
    if let Some(badges) = renderer.get("authorBadges").and_then(|b| b.as_array()) {
        for b in badges {
            let r = b.get("liveChatAuthorBadgeRenderer");
            match r
                .and_then(|x| x.pointer("/icon/iconType"))
                .and_then(|x| x.as_str())
            {
                Some("OWNER") => out.push(ChatBadge {
                    label: "HOST".into(),
                    kind: "broadcaster".into(),
                }),
                Some("MODERATOR") => out.push(ChatBadge {
                    label: "MOD".into(),
                    kind: "moderator".into(),
                }),
                Some("VERIFIED") => out.push(ChatBadge {
                    label: "✓".into(),
                    kind: "verified".into(),
                }),
                _ if r.and_then(|x| x.get("customThumbnail")).is_some() => out.push(ChatBadge {
                    label: Msg::ChatBadgeMember.now(),
                    kind: "subscriber".into(),
                }),
                _ => {}
            }
        }
    }
    out
}

// Best-effort parsing of localized currency text; it is not a financial amount parser.
fn parse_amount(s: &str) -> Option<f64> {
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

fn handle_innertube_action(app: &AppHandle, source: &str, action: &Value, gen: u64) {
    if let Some(id) = action
        .pointer("/markChatItemAsDeletedAction/targetItemId")
        .and_then(|v| v.as_str())
    {
        delete_message(app, "youtube", id);
        return;
    }
    let Some(item) = action.pointer("/addChatItemAction/item") else {
        return;
    };

    if let Some(r) = item.get("liveChatTextMessageRenderer") {
        let (text, fragments) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        if text.is_empty() {
            return;
        }
        let author = r
            .pointer("/authorName/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("anon")
            .to_string();
        emit_chat_gen(
            app,
            gen,
            ChatMessage {
                id: next_id(),
                platform: "youtube".into(),
                source: source.to_string(),
                author,
                author_id: None,
                native_id: r.get("id").and_then(|v| v.as_str()).map(String::from),
                color: None,
                fragments,
                badges: yt_innertube_badges(r),
                text,
                ts: now_ms(),
            },
        );
        return;
    }

    if let Some(r) = item.get("liveChatPaidMessageRenderer") {
        let author = r
            .pointer("/authorName/simpleText")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        let amount_text = r
            .pointer("/purchaseAmountText/simpleText")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let (msg, _) = yt_message_fragments(r.get("message").unwrap_or(&Value::Null));
        let display = if msg.is_empty() {
            amount_text.to_string()
        } else {
            format!("{amount_text} — {msg}")
        };
        emit_alert(
            app,
            yt_alert(
                source,
                "superchat",
                author,
                parse_amount(amount_text),
                None,
                None,
                Some(display),
            ),
        );
        return;
    }

    if item.get("liveChatMembershipItemRenderer").is_some() {
        let author = item
            .pointer("/liveChatMembershipItemRenderer/authorName/simpleText")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        emit_alert(
            app,
            yt_alert(source, "member", author, None, None, None, None),
        );
        return;
    }

    if let Some(r) = item.get("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer") {
        let author = r
            .pointer("/header/liveChatSponsorshipsHeaderRenderer/authorName/simpleText")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| Msg::ChatUnknownUser.now());
        emit_alert(
            app,
            yt_alert(source, "subgift", author, None, None, None, None),
        );
    }
}

/// False permits a Data API fallback only when InnerTube could not initialize.
fn youtube_innertube(
    video_id: &str,
    source: &str,
    running: &Arc<AtomicBool>,
    app: &AppHandle,
    gen: u64,
) -> bool {
    let Some((key, version, mut cont)) = innertube_bootstrap(video_id) else {
        return false;
    };
    log::info!("youtube chat: InnerTube connected");
    chat_status_gen(app, gen, "youtube", source, "connected");
    let mut first = true;
    let mut errors = 0u32;
    while running.load(Ordering::Relaxed) {
        let lcc = match innertube_poll(&key, &version, &cont) {
            Some(v) => {
                errors = 0;
                v
            }
            None => {
                errors += 1;
                if errors >= 3 {
                    break;
                }
                thread::sleep(Duration::from_secs(4));
                continue;
            }
        };
        if !first {
            if let Some(actions) = lcc.get("actions").and_then(|a| a.as_array()) {
                for action in actions {
                    handle_innertube_action(app, source, action, gen);
                }
            }
        }
        first = false;
        let Some(next) = lcc.pointer("/continuations/0").and_then(continuation_token) else {
            break;
        };
        cont = next;
        let timeout = lcc
            .pointer("/continuations/0/invalidationContinuationData/timeoutMs")
            .or_else(|| lcc.pointer("/continuations/0/timedContinuationData/timeoutMs"))
            .and_then(|v| v.as_u64())
            .unwrap_or(2000)
            .clamp(1000, 5000);
        let mut slept = 0u64;
        while running.load(Ordering::Relaxed) && slept < timeout {
            thread::sleep(Duration::from_millis(200));
            slept += 200;
        }
    }
    chat_status_gen(app, gen, "youtube", source, "disconnected");
    true
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
fn run_youtube(
    api_key: &str,
    channel: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let vid = match resolve_youtube_video(channel, api_key) {
        LiveResolve::Video(v) => v,
        _ => {
            chat_status_gen(&app, gen, "youtube", source, "waiting");
            return false;
        }
    };

    if youtube_innertube(&vid, source, &running, &app, gen) {
        return true;
    }

    if api_key.trim().is_empty() {
        chat_status_gen(&app, gen, "youtube", source, "waiting");
        return false;
    }
    youtube_dataapi(api_key, &vid, source, running, app, gen)
}

/// True means the connection succeeded at least once, allowing the supervisor to reset backoff.
fn youtube_dataapi(
    api_key: &str,
    vid: &str,
    source: &str,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) -> bool {
    let live_chat_id = match get_live_chat_id(api_key, vid) {
        Some(id) => id,
        None => {
            chat_status_gen(&app, gen, "youtube", source, "waiting");
            return false;
        }
    };
    log::info!("youtube chat: Data API connected");
    chat_status_gen(&app, gen, "youtube", source, "connected");

    let mut page_token: Option<String> = None;
    let mut first = true;
    let mut errors = 0u32;
    while running.load(Ordering::Relaxed) {
        let mut url = format!(
            "https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId={live_chat_id}&part=snippet,authorDetails&key={api_key}"
        );
        if let Some(tok) = &page_token {
            url.push_str(&format!("&pageToken={tok}"));
        }
        let json = match ureq::get(&url).timeout(Duration::from_secs(8)).call() {
            Ok(r) => {
                errors = 0;
                serde_json::from_str::<Value>(&r.into_string().unwrap_or_default())
                    .unwrap_or(Value::Null)
            }
            Err(_) => {
                errors += 1;

                if errors >= 3 {
                    break;
                }
                thread::sleep(Duration::from_secs(5));
                continue;
            }
        };
        page_token = json
            .get("nextPageToken")
            .and_then(|v| v.as_str())
            .map(String::from);
        let interval = json
            .get("pollingIntervalMillis")
            .and_then(|v| v.as_u64())
            .unwrap_or(5000)
            .max(2000);

        if !first {
            if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    let kind = item
                        .pointer("/snippet/type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("textMessageEvent");
                    match kind {
                        "messageDeletedEvent" => {
                            if let Some(id) = item
                                .pointer("/snippet/messageDeletedDetails/deletedMessageId")
                                .and_then(|v| v.as_str())
                            {
                                delete_message(&app, "youtube", id);
                            }
                        }
                        "userBannedEvent" => {
                            if let Some(name) = item
                                .pointer("/snippet/userBannedDetails/bannedUserDetails/displayName")
                                .and_then(|v| v.as_str())
                            {
                                delete_user(&app, "youtube", source, name);
                            }
                        }
                        "superChatEvent" => {
                            let amount = item
                                .pointer("/snippet/superChatDetails/amountMicros")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .map(|m| m / 1_000_000.0);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "superchat",
                                    yt_author(item),
                                    amount,
                                    item.pointer("/snippet/superChatDetails/currency")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                    item.pointer("/snippet/superChatDetails/userComment")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                        .map(String::from),
                                ),
                            );
                        }
                        "newSponsorEvent" => {
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "member",
                                    yt_author(item),
                                    None,
                                    None,
                                    item.pointer("/snippet/newSponsorDetails/memberLevelName")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                ),
                            );
                        }
                        "memberMilestoneChatEvent" => {
                            let months = item
                                .pointer("/snippet/memberMilestoneChatDetails/memberMonth")
                                .and_then(|v| v.as_u64())
                                .map(|m| m as f64);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "member",
                                    yt_author(item),
                                    months,
                                    None,
                                    item.pointer(
                                        "/snippet/memberMilestoneChatDetails/memberLevelName",
                                    )
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                                    item.pointer("/snippet/memberMilestoneChatDetails/userComment")
                                        .and_then(|v| v.as_str())
                                        .filter(|s| !s.is_empty())
                                        .map(String::from),
                                ),
                            );
                        }
                        "membershipGiftingEvent" => {
                            let count = item
                                .pointer("/snippet/membershipGiftingDetails/giftMembershipsCount")
                                .and_then(|v| v.as_u64())
                                .map(|c| c as f64);
                            emit_alert(
                                &app,
                                yt_alert(
                                    source,
                                    "subgift",
                                    yt_author(item),
                                    count,
                                    None,
                                    item.pointer("/snippet/membershipGiftingDetails/giftMembershipsLevelName")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    None,
                                ),
                            );
                        }
                        _ => {
                            let text = item
                                .pointer("/snippet/displayMessage")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if text.is_empty() {
                                continue;
                            }
                            let author = item
                                .pointer("/authorDetails/displayName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("anon")
                                .to_string();
                            let mut badges = vec![];
                            let flag = |k: &str| {
                                item.pointer(&format!("/authorDetails/{k}"))
                                    .and_then(|v| v.as_bool())
                                    == Some(true)
                            };
                            if flag("isChatOwner") {
                                badges.push(ChatBadge {
                                    label: "HOST".into(),
                                    kind: "broadcaster".into(),
                                });
                            }
                            if flag("isChatModerator") {
                                badges.push(ChatBadge {
                                    label: "MOD".into(),
                                    kind: "moderator".into(),
                                });
                            }
                            if flag("isChatSponsor") {
                                badges.push(ChatBadge {
                                    label: Msg::ChatBadgeMember.now(),
                                    kind: "subscriber".into(),
                                });
                            }
                            emit_chat_gen(
                                &app,
                                gen,
                                ChatMessage {
                                    id: next_id(),
                                    platform: "youtube".into(),
                                    source: source.to_string(),
                                    author,
                                    author_id: None,
                                    native_id: item
                                        .get("id")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    color: None,
                                    fragments: vec![text_frag(&text)],
                                    badges,
                                    text,
                                    ts: now_ms(),
                                },
                            );
                        }
                    }
                }
            }
        }
        first = false;

        let mut slept = 0u64;
        while running.load(Ordering::Relaxed) && slept < interval {
            thread::sleep(Duration::from_millis(200));
            slept += 200;
        }
    }
    chat_status_gen(&app, gen, "youtube", source, "disconnected");
    true
}

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
fn run_kick(slug: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle, gen: u64) -> bool {
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
    Some(ChatMessage {
        id: next_id(),
        platform: "kick".into(),
        source: source.to_string(),
        author,
        author_id: None,
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

// Fetch audience and followers together when the provider returns both in one response.

#[derive(Default)]
struct ChannelCounts {
    /// None means offline or unavailable, not zero viewers.
    viewers: Option<u64>,
    /// None means unsupported or unavailable, not zero followers.
    followers: Option<u64>,
    audience: Option<cinefy::AudienceSnapshot>,
}

impl ChannelCounts {
    fn cinefy(audience: cinefy::AudienceSnapshot) -> Self {
        // Embedded counts belong to the upstream platform and must not be counted twice.
        let viewers = match audience.audience_status {
            cinefy::AudienceStatus::Live if audience.live => audience.viewers,
            cinefy::AudienceStatus::Offline => Some(0),
            _ => None,
        };
        Self {
            viewers,
            followers: None,
            audience: Some(audience),
        }
    }
}

#[derive(Default)]
struct ViewerSample {
    total: u64,
    any_live: bool,
    items: Vec<Value>,
    followers: Vec<Value>,
}

fn collect_viewer_sample(
    sources: &[crate::config::ChatSource],
    is_current: impl Fn() -> bool,
    mut fetch: impl FnMut(&crate::config::ChatSource) -> ChannelCounts,
) -> Option<ViewerSample> {
    let mut sample = ViewerSample::default();
    let mut cinefy_channels = HashSet::new();
    for src in sources {
        if !is_current() {
            return None;
        }
        if src.platform == "cinefy"
            && cinefy::normalize_slug(&src.value).is_some_and(|slug| !cinefy_channels.insert(slug))
        {
            continue;
        }
        let counts = fetch(src);
        if !is_current() {
            return None;
        }
        let label = if src.name.trim().is_empty() {
            &src.value
        } else {
            &src.name
        };
        let live = counts
            .audience
            .as_ref()
            .map_or(counts.viewers.is_some(), |audience| audience.live);
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
        if let Some(audience) = counts.audience {
            item["audienceStatus"] = json!(audience.audience_status);
            if let Some(origin) = audience
                .audience_origin
                .filter(|_| matches!(audience.audience_status, cinefy::AudienceStatus::Embedded))
            {
                item["audienceOrigin"] = json!(origin);
            }
            if let Some(viewers) = audience
                .embedded_viewers
                .filter(|_| matches!(audience.audience_status, cinefy::AudienceStatus::Embedded))
            {
                item["embeddedViewers"] = json!(viewers);
            }
            if let Some(title) = audience.title {
                item["title"] = json!(title);
            }
            if let Some(started_at) = audience.started_at {
                item["startedAt"] = json!(started_at);
            }
        }
        sample.items.push(item);
    }
    is_current().then_some(sample)
}

fn twitch_counts(channel: &str) -> ChannelCounts {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return ChannelCounts::default();
    }
    let body = json!({
        "query": format!(
            "query {{ user(login: \"{ch}\") {{ followers {{ totalCount }} stream {{ viewersCount }} }} }}"
        )
    })
    .to_string();
    let Some(resp) = ureq::post("https://gql.twitch.tv/gql")
        .set("Client-Id", "kimne78kx3ncx6brgo4mv6wki5h1ko")
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(6))
        .send_string(&body)
        .ok()
        .and_then(|r| r.into_string().ok())
    else {
        return ChannelCounts::default();
    };
    let Ok(v) = serde_json::from_str::<Value>(&resp) else {
        return ChannelCounts::default();
    };
    ChannelCounts {
        // Offline stream is null, but followers may still be available.
        viewers: v
            .pointer("/data/user/stream/viewersCount")
            .and_then(|x| x.as_u64()),
        followers: v
            .pointer("/data/user/followers/totalCount")
            .and_then(|x| x.as_u64()),
        ..Default::default()
    }
}

fn yt_concurrent(api_key: &str, vid: &str) -> Option<u64> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={vid}&key={api_key}"
    );
    let body = ureq::get(&url)
        .timeout(Duration::from_secs(6))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.pointer("/items/0/liveStreamingDetails/concurrentViewers")
        .and_then(|x| x.as_str())
        .and_then(|s| s.parse::<u64>().ok())
}

// Reuse the resolved video ID across polls to avoid repeatedly scraping the channel page.
fn youtube_viewers(
    api_key: &str,
    channel: &str,
    cache: &mut std::collections::HashMap<String, String>,
) -> Option<u64> {
    if api_key.trim().is_empty() {
        return None;
    }
    if let Some(vid) = cache.get(channel) {
        if let Some(n) = yt_concurrent(api_key, vid) {
            return Some(n);
        }
        cache.remove(channel);
    }
    let vid = match resolve_youtube_video(channel, api_key) {
        LiveResolve::Video(v) => v,
        _ => return None,
    };
    let n = yt_concurrent(api_key, &vid);
    if n.is_some() {
        cache.insert(channel.to_string(), vid);
    }
    n
}

// followers_count is undocumented; leave it unavailable rather than assuming zero if it disappears.

fn kick_counts(slug: &str) -> ChannelCounts {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return ChannelCounts::default();
    }
    let url = format!("https://kick.com/api/v2/channels/{slug}");
    let Some(body) = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(6))
        .call()
        .ok()
        .and_then(|r| r.into_string().ok())
    else {
        return ChannelCounts::default();
    };
    let Ok(v) = serde_json::from_str::<Value>(&body) else {
        return ChannelCounts::default();
    };
    let followers = v.get("followers_count").and_then(|x| x.as_u64());
    if followers.is_none() {
        log::debug!("kick: missing followers_count in channel response");
    }
    ChannelCounts {
        viewers: v
            .pointer("/livestream/viewer_count")
            .and_then(|x| x.as_u64()),
        followers,
        ..Default::default()
    }
}

fn run_viewers(
    sources: Vec<crate::config::ChatSource>,
    api_key: String,
    running: Arc<AtomicBool>,
    app: AppHandle,
    gen: u64,
) {
    let mut yt_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut cinefy = cinefy::AudiencePoller::new(
        sources
            .iter()
            .filter(|src| src.platform == "cinefy")
            .map(|src| src.value.as_str()),
    );
    let is_current = || running.load(Ordering::Relaxed) && CHAT_GEN.load(Ordering::SeqCst) == gen;
    while is_current() {
        cinefy.begin_cycle();
        let Some(sample) = collect_viewer_sample(&sources, is_current, |src| {
            match src.platform.as_str() {
                "twitch" => twitch_counts(&src.value),
                // Rounded YouTube subscriber counts cannot reliably measure per-stream gains.
                "youtube" => ChannelCounts {
                    viewers: youtube_viewers(&api_key, &src.value, &mut yt_cache),
                    ..Default::default()
                },
                "kick" => kick_counts(&src.value),
                "cinefy" => ChannelCounts::cinefy(cinefy.poll(&src.value, running.as_ref())),
                _ => ChannelCounts::default(),
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
        let _ = app.emit(
            "viewers://update",
            json!({ "total": sample.total, "anyLive": sample.any_live, "items": sample.items }),
        );

        for _ in 0..150 {
            if !is_current() {
                return;
            }
            thread::sleep(Duration::from_millis(200));
        }
    }
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
                    ChannelCounts::cinefy(audience)
                }
                "embedded" => {
                    let mut audience =
                        cinefy_audience(cinefy::AudienceStatus::Embedded, true, Some(900));
                    audience.audience_origin = Some(cinefy::AudienceOrigin::Twitch);
                    audience.embedded_viewers = Some(900);
                    ChannelCounts::cinefy(audience)
                }
                _ => ChannelCounts {
                    viewers: Some(30),
                    ..Default::default()
                },
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
                |_| ChannelCounts::cinefy(cinefy_audience(status, live, count)),
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
                "twitch" => ChannelCounts {
                    viewers: None,
                    followers: Some(100),
                    ..Default::default()
                },
                "kick" => ChannelCounts {
                    viewers: Some(0),
                    ..Default::default()
                },
                _ => ChannelCounts {
                    viewers: Some(5),
                    ..Default::default()
                },
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
        let sample = collect_viewer_sample(
            &sources,
            || true,
            |source| {
                calls += 1;
                if source.platform == "cinefy" {
                    ChannelCounts::cinefy(cinefy_audience(
                        cinefy::AudienceStatus::Live,
                        true,
                        Some(10),
                    ))
                } else {
                    ChannelCounts {
                        viewers: Some(20),
                        ..Default::default()
                    }
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
                ChannelCounts {
                    viewers: Some(5),
                    ..Default::default()
                }
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
                ChannelCounts::cinefy(cinefy_audience(cinefy::AudienceStatus::Live, true, Some(5)))
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
            |_| ChannelCounts {
                viewers: Some(u64::MAX),
                ..Default::default()
            },
        )
        .expect("current viewer sample");
        assert_eq!(sample.total, u64::MAX);
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

    fn hostile_corpus() -> Vec<String> {
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

    #[test]
    fn chat_parsers_tolerate_hostile_network_fixtures() {
        let emotes: HashMap<String, String> = HashMap::new();
        for case in hostile_corpus() {
            let _ = parse_privmsg(&case, "fonte", &emotes);
            let _ = parse_usernotice(&case, "fonte", &emotes);
            let _ = clearchat_user(&case);
            let _ = parse_kick(&case, "fonte");
            let _ = parse_kick_alert(&case, "fonte");
            let _ = parse_amount(&case);
            let _ = tag_val(twitch_tags(&case), "id");
            let frags = kick_fragments(&case);
            // An empty fragment list would hide a message instead of showing its plain-text fallback.

            assert!(
                !frags.is_empty(),
                "kick_fragments returned an empty list for {case:?}"
            );
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
