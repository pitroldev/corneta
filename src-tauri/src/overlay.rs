//! OBS overlays use a stable port and loopback-only binding to keep chat and donation data off the LAN.
//! Separate bounded broadcasts keep chat traffic from crowding out alerts.

use std::net::Ipv4Addr;
use std::sync::Mutex;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot, watch};

use crate::chat::{Alert, ChatMessage};

const OVERLAY_HTML: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/overlay.html"));
const CHAT_OVERLAY_HTML: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/chat-overlay.html"
));
const HIGHLIGHT_OVERLAY_HTML: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/highlight-overlay.html"
));

const ALERT_BUF: usize = 64;
const CHAT_BUF: usize = 256;

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HighlightEvent {
    Show {
        message: Box<ChatMessage>,
        #[serde(skip_serializing_if = "Option::is_none", rename = "durationMs")]
        duration_ms: Option<u32>,
    },
    Clear,
}

#[derive(Clone, Debug)]
struct ActiveHighlight {
    message: ChatMessage,
    json: String,
}

#[derive(Default)]
pub struct OverlayServer {
    handle: Option<JoinHandle<()>>,
    shutdown: Option<oneshot::Sender<()>>, // Stop accepting new connections.
    disconnect: Option<watch::Sender<bool>>, // Close existing connections.
    alerts: Option<broadcast::Sender<String>>,
    chat: Option<broadcast::Sender<String>>,
    highlight_tx: Option<watch::Sender<Option<String>>>,
    active_highlight: Option<ActiveHighlight>,
    pub port: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    pub port: u16,
    pub url: String,
    pub chat_url: String,
    pub highlight_url: String,
}

#[derive(Clone)]
struct Ctx {
    alerts: broadcast::Sender<String>,
    chat: broadcast::Sender<String>,
    highlight: watch::Receiver<Option<String>>,
    shutdown: watch::Receiver<bool>,
}

const PAGE_LANG: &str = "<html lang=\"en\">";

/// OBS shows these pages to viewers, so they follow the app's language; a Browser Source reload picks up a change.
fn with_lang(page: &str, locale: crate::i18n::Locale) -> String {
    page.replacen(PAGE_LANG, &format!("<html lang=\"{}\">", locale.tag()), 1)
}
async fn overlay_page() -> Html<String> {
    Html(with_lang(OVERLAY_HTML, crate::i18n::locale()))
}
async fn chat_page() -> Html<String> {
    Html(with_lang(CHAT_OVERLAY_HTML, crate::i18n::locale()))
}
async fn highlight_page() -> Html<String> {
    Html(with_lang(HIGHLIGHT_OVERLAY_HTML, crate::i18n::locale()))
}

async fn ws_alerts(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_conn(socket, ctx.alerts.subscribe(), ctx.shutdown.clone()))
}
async fn ws_chat(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_conn(socket, ctx.chat.subscribe(), ctx.shutdown.clone()))
}
async fn ws_highlight(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_highlight_conn(socket, ctx.highlight.clone(), ctx.shutdown.clone())
    })
}

async fn handle_highlight_conn(
    mut socket: WebSocket,
    mut rx: watch::Receiver<Option<String>>,
    mut shutdown: watch::Receiver<bool>,
) {
    // Late subscribers receive the active highlight immediately so OBS scene reloads stay in sync.
    let initial = rx.borrow_and_update().clone();
    if let Some(text) = initial {
        if socket.send(Message::Text(text.into())).await.is_err() {
            return;
        }
    }
    let clear_json = serde_json::to_string(&HighlightEvent::Clear).unwrap_or_default();
    loop {
        tokio::select! {
            _ = shutdown.changed() => {
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
            changed = rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let next = rx.borrow_and_update().clone().unwrap_or_else(|| clear_json.clone());
                if socket.send(Message::Text(next.into())).await.is_err() {
                    break;
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

async fn handle_conn(
    mut socket: WebSocket,
    mut rx: broadcast::Receiver<String>,
    mut shutdown: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            _ = shutdown.changed() => {
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
            ev = rx.recv() => {
                match ev {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    // A slow page may miss old events without losing its connection.
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

pub fn push(server: &Mutex<OverlayServer>, alert: &Alert) {
    push_json(
        server,
        |s| s.alerts.clone(),
        || serde_json::to_string(alert),
    );
}

pub fn push_chat(server: &Mutex<OverlayServer>, msg: &ChatMessage) {
    push_json(server, |s| s.chat.clone(), || serde_json::to_string(msg));
}

/// Deletions and pins for the chat overlay, tagged so the page tells them from messages.
pub fn push_chat_event(server: &Mutex<OverlayServer>, event: &str, body: &serde_json::Value) {
    push_json(
        server,
        |s| s.chat.clone(),
        || serde_json::to_string(&serde_json::json!({ "event": event, "data": body })),
    );
}

pub fn show_highlight(
    server: &Mutex<OverlayServer>,
    message: ChatMessage,
    duration_ms: Option<u32>,
) -> ChatMessage {
    let event = HighlightEvent::Show {
        message: Box::new(message.clone()),
        duration_ms: duration_ms.filter(|&ms| ms > 0),
    };
    let json = serde_json::to_string(&event).unwrap_or_default();
    let mut s = server.lock().unwrap();
    s.active_highlight = Some(ActiveHighlight {
        message: message.clone(),
        json: json.clone(),
    });
    if let Some(tx) = &s.highlight_tx {
        let _ = tx.send(Some(json));
    }
    message
}

pub fn clear_highlight(server: &Mutex<OverlayServer>) -> bool {
    let mut s = server.lock().unwrap();
    let had = s.active_highlight.take().is_some();
    if let Some(tx) = &s.highlight_tx {
        let _ = tx.send(None);
    }
    had
}

pub fn active_highlight(server: &Mutex<OverlayServer>) -> Option<ChatMessage> {
    server
        .lock()
        .unwrap()
        .active_highlight
        .as_ref()
        .map(|h| h.message.clone())
}

/// Clears the highlighted message if a moderation/delete event targets its message, author, or channel.
pub fn clear_highlight_on_delete(server: &Mutex<OverlayServer>, event: &serde_json::Value) -> bool {
    let mut s = server.lock().unwrap();
    let Some(active) = &s.active_highlight else {
        return false;
    };
    if !delete_matches_message(&active.message, event) {
        return false;
    }
    s.active_highlight = None;
    if let Some(tx) = &s.highlight_tx {
        let _ = tx.send(None);
    }
    true
}

fn delete_matches_message(msg: &ChatMessage, event: &serde_json::Value) -> bool {
    let scope = event.get("scope").and_then(|v| v.as_str()).unwrap_or("");
    let platform = event.get("platform").and_then(|v| v.as_str()).unwrap_or("");
    if !platform.is_empty() && msg.platform != platform {
        return false;
    }
    match scope {
        "message" => {
            let native_id = event.get("nativeId").and_then(|v| v.as_str()).unwrap_or("");
            !native_id.is_empty()
                && (msg.native_id.as_deref() == Some(native_id) || msg.id == native_id)
        }
        "user" => {
            let author_id = event.get("authorId").and_then(|v| v.as_str());
            if let (Some(ev_id), Some(msg_id)) = (author_id, msg.author_id.as_deref()) {
                if !ev_id.is_empty() && ev_id == msg_id {
                    return true;
                }
            }
            let author = event.get("author").and_then(|v| v.as_str()).unwrap_or("");
            !author.is_empty() && msg.author.eq_ignore_ascii_case(author)
        }
        "all" => {
            let source = event.get("source").and_then(|v| v.as_str()).unwrap_or("");
            source.is_empty() || msg.source == source
        }
        _ => false,
    }
}

/// Serialize outside the server lock so active producers do not block each other.
fn push_json(
    server: &Mutex<OverlayServer>,
    pick: impl FnOnce(&OverlayServer) -> Option<broadcast::Sender<String>>,
    to_json: impl FnOnce() -> Result<String, serde_json::Error>,
) {
    let tx = match pick(&server.lock().unwrap()) {
        Some(tx) => tx,
        None => return,
    };
    // Avoid serializing high-volume chat when no page is listening.
    if tx.receiver_count() == 0 {
        return;
    }
    if let Ok(json) = to_json() {
        let _ = tx.send(json);
    }
}

fn overlay_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/alerts")
}
fn chat_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/chat")
}
fn highlight_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/highlight")
}
fn info_for(port: u16) -> OverlayInfo {
    OverlayInfo {
        port,
        url: overlay_url(port),
        chat_url: chat_url(port),
        highlight_url: highlight_url(port),
    }
}

#[derive(Debug)]
enum StartStage {
    Bind,
    LocalAddress,
}

pub struct StartError {
    stage: StartStage,
    port: u16,
    source: std::io::Error,
}

impl std::fmt::Debug for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(self, f)
    }
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let code = match self.stage {
            StartStage::Bind => "bind_failed",
            StartStage::LocalAddress => "local_address_failed",
        };
        write!(
            f,
            "{code}: port={} kind={:?} os_code={:?}",
            self.port,
            self.source.kind(),
            self.source.raw_os_error()
        )
    }
}

impl StartError {
    pub fn message(&self, locale: crate::i18n::Locale) -> String {
        match self.stage {
            StartStage::Bind => crate::i18n::Msg::OverlayPortOpenFailed {
                port: self.port,
                e: &self.source.to_string(),
            }
            .text(locale),
            StartStage::LocalAddress => self.source.to_string(),
        }
    }
}

pub async fn start(server: &Mutex<OverlayServer>, port: u16) -> Result<OverlayInfo, StartError> {
    {
        let s = server.lock().unwrap();
        if s.handle.is_some() && s.port != 0 {
            return Ok(info_for(s.port));
        }
    }

    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|source| StartError {
            stage: StartStage::Bind,
            port,
            source,
        })?;
    let bound = listener
        .local_addr()
        .map_err(|source| StartError {
            stage: StartStage::LocalAddress,
            port,
            source,
        })?
        .port();

    let (sh_tx, sh_rx) = oneshot::channel::<()>();
    let (kick_tx, kick_rx) = watch::channel(false);
    let (alert_tx, _alert_rx) = broadcast::channel::<String>(ALERT_BUF);
    let (chat_tx, _chat_rx) = broadcast::channel::<String>(CHAT_BUF);
    let initial_hl = server
        .lock()
        .unwrap()
        .active_highlight
        .as_ref()
        .map(|h| h.json.clone());
    let (hl_tx, hl_rx) = watch::channel::<Option<String>>(initial_hl);
    let ctx = Ctx {
        alerts: alert_tx.clone(),
        chat: chat_tx.clone(),
        highlight: hl_rx,
        shutdown: kick_rx,
    };
    let app = Router::new()
        .route("/alerts", get(overlay_page))
        .route("/alerts-ws", get(ws_alerts))
        .route("/chat", get(chat_page))
        .route("/chat-ws", get(ws_chat))
        .route("/highlight", get(highlight_page))
        .route("/highlight-ws", get(ws_highlight))
        .route("/ws/highlight", get(ws_highlight))
        .with_state(ctx);

    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = sh_rx.await;
            })
            .await;
    });

    let mut s = server.lock().unwrap();
    s.handle = Some(handle);
    s.shutdown = Some(sh_tx);
    s.disconnect = Some(kick_tx);
    s.alerts = Some(alert_tx);
    s.chat = Some(chat_tx);
    s.highlight_tx = Some(hl_tx);
    s.port = bound;
    Ok(info_for(bound))
}

pub fn stop(server: &Mutex<OverlayServer>) {
    let mut s = server.lock().unwrap();
    s.alerts = None;
    s.chat = None;
    s.highlight_tx = None;
    if let Some(k) = s.disconnect.take() {
        let _ = k.send(true); // Close existing connections.
    }
    if let Some(tx) = s.shutdown.take() {
        let _ = tx.send(());
    }
    s.handle = None; // Dropping the handle detaches; graceful shutdown drains the task and releases the port.
    s.port = 0;
}

pub fn info(server: &Mutex<OverlayServer>) -> Option<OverlayInfo> {
    let s = server.lock().unwrap();
    if s.handle.is_some() && s.port != 0 {
        Some(info_for(s.port))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::Locale;

    #[test]
    fn overlay_pages_take_the_app_language() {
        for page in [OVERLAY_HTML, CHAT_OVERLAY_HTML, HIGHLIGHT_OVERLAY_HTML] {
            assert_eq!(page.matches(PAGE_LANG).count(), 1);
            assert!(with_lang(page, Locale::PtBr).contains("<html lang=\"pt-BR\">"));
            assert!(with_lang(page, Locale::En).contains(PAGE_LANG));
        }
        assert!(HIGHLIGHT_OVERLAY_HTML.contains("Content-Security-Policy"));
        assert!(!HIGHLIGHT_OVERLAY_HTML.contains("innerHTML"));
    }

    #[test]
    fn highlight_lifecycle_and_moderation_clear() {
        let server = Mutex::new(OverlayServer::default());
        let msg = ChatMessage {
            id: "m-1".into(),
            platform: "twitch".into(),
            source: "canal".into(),
            author: "MariArt".into(),
            author_id: Some("u-42".into()),
            native_id: Some("tw-99".into()),
            color: Some("#ffb323".into()),
            text: "Great stream!".into(),
            fragments: vec![],
            badges: vec![],
            ts: 1000,
            ..Default::default()
        };

        show_highlight(&server, msg.clone(), Some(15_000));
        assert_eq!(active_highlight(&server).unwrap().id, "m-1");

        // Unrelated platform or author must not clear the active highlight.
        assert!(!clear_highlight_on_delete(
            &server,
            &serde_json::json!({ "scope": "user", "platform": "youtube", "authorId": "u-42", "author": "MariArt" }),
        ));
        assert!(!clear_highlight_on_delete(
            &server,
            &serde_json::json!({ "scope": "message", "platform": "twitch", "nativeId": "tw-other" }),
        ));
        assert!(active_highlight(&server).is_some());

        // Matching user ban clears immediately.
        assert!(clear_highlight_on_delete(
            &server,
            &serde_json::json!({ "scope": "user", "platform": "twitch", "authorId": "u-42", "author": "mariart" }),
        ));
        assert!(active_highlight(&server).is_none());

        // Matching single-message delete clears too.
        show_highlight(&server, msg, None);
        assert!(clear_highlight_on_delete(
            &server,
            &serde_json::json!({ "scope": "message", "platform": "twitch", "nativeId": "tw-99" }),
        ));
        assert!(active_highlight(&server).is_none());
    }

    #[test]
    fn startup_diagnostics_never_format_localized_or_private_error_text() {
        for stage in [StartStage::Bind, StartStage::LocalAddress] {
            let error = StartError {
                stage,
                port: 1234,
                source: std::io::Error::new(
                    std::io::ErrorKind::AddrInUse,
                    "falha privada https://example.invalid/private-fixture",
                ),
            };
            let diagnostic = error.to_string();
            assert_eq!(format!("{error:?}"), diagnostic);
            assert!(diagnostic.contains("port=1234 kind=AddrInUse os_code=None"));
            assert!(!diagnostic.contains("privada"));
            assert!(!diagnostic.contains("private-fixture"));
            for locale in [Locale::PtBr, Locale::En] {
                let message = error.message(locale);
                assert!(message.contains("private-fixture"));
                assert_ne!(message, diagnostic);
            }
        }
    }

    #[tokio::test]
    async fn occupied_port_preserves_the_localized_ipc_error() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = Mutex::new(OverlayServer::default());
        let error = start(&server, port)
            .await
            .err()
            .expect("an occupied port must fail");
        assert!(matches!(error.stage, StartStage::Bind));
        assert!(error.to_string().starts_with("bind_failed:"));
        assert!(error
            .message(Locale::PtBr)
            .starts_with("não consegui abrir o overlay"));
        assert!(error
            .message(Locale::En)
            .starts_with("couldn't open the overlay"));
        assert!(info(&server).is_none());
    }
}
