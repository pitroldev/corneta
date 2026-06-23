//! Chat unificado: conecta em várias plataformas e emite mensagens normalizadas
//! para o frontend via evento `chat://message`.
//! - Twitch: IRC anônimo sobre WebSocket (ws://, sem login).
//! - YouTube: Data API v3 (liveChat/messages) com a API key do usuário.
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::Message;

use crate::AppState;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub platform: String, // "twitch" | "youtube"
    pub author: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub ts: u64,
}

#[derive(Default)]
pub struct ChatRuntime {
    pub running: Arc<AtomicBool>,
}

static MSG_ID: AtomicU64 = AtomicU64::new(1);
fn next_id() -> String {
    MSG_ID.fetch_add(1, Ordering::Relaxed).to_string()
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_chat(app: &AppHandle, msg: ChatMessage) {
    let _ = app.emit("chat://message", msg);
}
fn chat_status(app: &AppHandle, platform: &str, status: &str) {
    let _ = app.emit("chat://status", json!({ "platform": platform, "status": status }));
}

// ----------------------------- Controle ----------------------------

/// (Re)inicia o chat com base nas settings (Twitch + YouTube, conforme configurado).
pub fn start_chat(app: &AppHandle) {
    let settings = crate::config::load(app).settings;
    let running = {
        let st = app.state::<AppState>();
        let mut chat = st.chat.lock().unwrap();
        chat.running.store(false, Ordering::Relaxed); // derruba o anterior
        let running = Arc::new(AtomicBool::new(true));
        chat.running = running.clone();
        running
    };

    if !settings.twitch_channel.trim().is_empty() {
        let app2 = app.clone();
        let run2 = running.clone();
        let ch = settings.twitch_channel.clone();
        tauri::async_runtime::spawn_blocking(move || run_twitch(&ch, run2, app2));
    }
    if !settings.youtube_api_key.trim().is_empty() && !settings.youtube_video.trim().is_empty() {
        let app2 = app.clone();
        let run2 = running.clone();
        let key = settings.youtube_api_key.clone();
        let video = settings.youtube_video.clone();
        tauri::async_runtime::spawn_blocking(move || run_youtube(&key, &video, run2, app2));
    }
}

pub fn stop_chat(app: &AppHandle) {
    let st = app.state::<AppState>();
    let chat = st.chat.lock().unwrap();
    chat.running.store(false, Ordering::Relaxed);
}

// ----------------------------- Twitch ------------------------------

fn run_twitch(channel: &str, running: Arc<AtomicBool>, app: AppHandle) {
    let ch = channel.trim().trim_start_matches('#').to_lowercase();
    if ch.is_empty() {
        return;
    }
    let mut socket = match tungstenite::connect("ws://irc-ws.chat.twitch.tv:80") {
        Ok((s, _)) => s,
        Err(e) => {
            log::warn!("twitch chat: conexão falhou: {e}");
            chat_status(&app, "twitch", "error");
            return;
        }
    };
    // Read com timeout curto pra checar o flag de parada periodicamente.
    if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
        let _ = tcp.set_read_timeout(Some(Duration::from_millis(400)));
    }
    let _ = socket.send(Message::Text("CAP REQ :twitch.tv/tags".into()));
    let _ = socket.send(Message::Text("PASS SCHMOOPIIE".into()));
    let _ = socket.send(Message::Text(format!("NICK justinfan{}", now_ms() % 100000)));
    let _ = socket.send(Message::Text(format!("JOIN #{ch}")));
    log::info!("twitch chat: conectado em #{ch}");
    chat_status(&app, "twitch", "connected");

    while running.load(Ordering::Relaxed) {
        match socket.read() {
            Ok(Message::Text(t)) => {
                for line in t.split("\r\n").filter(|l| !l.is_empty()) {
                    if line.starts_with("PING") {
                        let _ = socket.send(Message::Text("PONG :tmi.twitch.tv".into()));
                        continue;
                    }
                    if let Some(msg) = parse_privmsg(line) {
                        emit_chat(&app, msg);
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
                continue; // timeout do read → revalida o flag
            }
            Err(_) => break,
        }
    }
    let _ = socket.close(None);
    chat_status(&app, "twitch", "disconnected");
}

/// Parseia uma linha IRC `PRIVMSG` (com tags) numa ChatMessage.
fn parse_privmsg(line: &str) -> Option<ChatMessage> {
    let (tags, rest) = if let Some(stripped) = line.strip_prefix('@') {
        let sp = stripped.find(' ')?;
        (&stripped[..sp], &stripped[sp + 1..])
    } else {
        ("", line)
    };
    if !rest.contains("PRIVMSG") {
        return None;
    }
    let privmsg_idx = rest.find("PRIVMSG")?;
    let after = &rest[privmsg_idx..];
    let msg_idx = after.find(':')?;
    let text = after[msg_idx + 1..].trim_end().to_string();
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
    for kv in tags.split(';') {
        let mut it = kv.splitn(2, '=');
        let k = it.next().unwrap_or("");
        let v = it.next().unwrap_or("");
        match k {
            "color" if !v.is_empty() => color = Some(v.to_string()),
            "display-name" if !v.is_empty() => display = v.to_string(),
            _ => {}
        }
    }

    Some(ChatMessage {
        id: next_id(),
        platform: "twitch".into(),
        author: display,
        text,
        color,
        ts: now_ms(),
    })
}

// ----------------------------- YouTube -----------------------------

fn extract_video_id(input: &str) -> String {
    let s = input.trim();
    if let Some(i) = s.find("v=") {
        return s[i + 2..].split(['&', '#']).next().unwrap_or("").to_string();
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
    s.to_string() // já é o ID
}

fn get_live_chat_id(api_key: &str, video_id: &str) -> Option<String> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={video_id}&key={api_key}"
    );
    let body = ureq::get(&url).call().ok()?.into_string().ok()?;
    let json: Value = serde_json::from_str(&body).ok()?;
    json.pointer("/items/0/liveStreamingDetails/activeLiveChatId")
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn run_youtube(api_key: &str, video: &str, running: Arc<AtomicBool>, app: AppHandle) {
    let vid = extract_video_id(video);
    if vid.is_empty() {
        return;
    }
    let live_chat_id = match get_live_chat_id(api_key, &vid) {
        Some(id) => id,
        None => {
            log::warn!("youtube chat: live chat não encontrado (vídeo ao vivo? API key válida?)");
            chat_status(&app, "youtube", "error");
            return;
        }
    };
    log::info!("youtube chat: conectado");
    chat_status(&app, "youtube", "connected");

    let mut page_token: Option<String> = None;
    let mut first = true; // primeira leva = backlog → ignora
    while running.load(Ordering::Relaxed) {
        let mut url = format!(
            "https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId={live_chat_id}&part=snippet,authorDetails&key={api_key}"
        );
        if let Some(tok) = &page_token {
            url.push_str(&format!("&pageToken={tok}"));
        }
        let json = match ureq::get(&url).call() {
            Ok(r) => serde_json::from_str::<Value>(&r.into_string().unwrap_or_default())
                .unwrap_or(Value::Null),
            Err(_) => {
                thread::sleep(Duration::from_secs(5));
                continue;
            }
        };
        page_token = json.get("nextPageToken").and_then(|v| v.as_str()).map(String::from);
        let interval = json
            .get("pollingIntervalMillis")
            .and_then(|v| v.as_u64())
            .unwrap_or(5000)
            .max(2000);

        if !first {
            if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    let author = item
                        .pointer("/authorDetails/displayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("anon")
                        .to_string();
                    let text = item
                        .pointer("/snippet/displayMessage")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !text.is_empty() {
                        emit_chat(
                            &app,
                            ChatMessage {
                                id: next_id(),
                                platform: "youtube".into(),
                                author,
                                text,
                                color: None,
                                ts: now_ms(),
                            },
                        );
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
    chat_status(&app, "youtube", "disconnected");
}
