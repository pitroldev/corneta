//! Overlays pro OBS (Browser Source). UM servidor HTTP local serve DUAS páginas:
//!   - `/alerts` (+ `/alerts-ws`) → alertas animados (sub, doação, raid…)
//!   - `/chat`   (+ `/chat-ws`)   → o chat unificado, com emotes (BTTV/FFZ/7TV + nativos)
//!
//! Mesma família do `studio.rs` da Mesa, com duas diferenças de propósito:
//!   1. **Porta FIXA** (não efêmera): a URL é colada no OBS UMA vez e precisa valer entre
//!      reinícios do app — porta efêmera quebraria a Browser Source a cada boot.
//!   2. **Só loopback (127.0.0.1)**: alertas/chat carregam NOME e VALOR de quem doou e o que
//!      a galera escreve — isso não pode vazar pra LAN (a Mesa expõe de propósito; aqui é o oposto).
//!
//! As fontes são os funis únicos `chat::emit_alert` → `push` e `chat::emit_chat` → `push_chat`,
//! cada um difundido por um broadcast SEPARADO (o chat é volumoso; o overlay de alertas não deve
//! receber essa enxurrada). Sem servidor de pé (ou sem página aberta), os push são no-op.

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

/// Páginas self-contained (CSS/JS inline). CARGO_MANIFEST_DIR = src-tauri/.
const OVERLAY_HTML: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/overlay.html"));
const CHAT_OVERLAY_HTML: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/chat-overlay.html"
));

/// Buffer do broadcast de ALERTAS: raros; 64 cobre uma rajada (raid + gifts) sem crescer memória.
const ALERT_BUF: usize = 64;
/// Buffer do broadcast de CHAT: volumoso; 256 dá folga pra uma página lenta sem estourar memória.
const CHAT_BUF: usize = 256;

#[derive(Default)]
pub struct OverlayServer {
    handle: Option<JoinHandle<()>>,
    shutdown: Option<oneshot::Sender<()>>, // para o accept loop
    disconnect: Option<watch::Sender<bool>>, // fecha as páginas conectadas agora
    /// Fan-out dos alertas / do chat pras páginas. `None` = servidor parado (push vira no-op).
    alerts: Option<broadcast::Sender<String>>,
    chat: Option<broadcast::Sender<String>>,
    pub port: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    pub port: u16,
    /// URL base do overlay de ALERTAS (sem query) pra colar no OBS como Browser Source.
    pub url: String,
    /// URL base do overlay de CHAT (sem query).
    pub chat_url: String,
}

#[derive(Clone)]
struct Ctx {
    alerts: broadcast::Sender<String>,
    chat: broadcast::Sender<String>,
    /// Vira `true` no stop() → fecha as conexões vivas (não só o accept loop).
    shutdown: watch::Receiver<bool>,
}

async fn overlay_page() -> Html<&'static str> {
    Html(OVERLAY_HTML)
}
async fn chat_page() -> Html<&'static str> {
    Html(CHAT_OVERLAY_HTML)
}

async fn ws_alerts(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_conn(socket, ctx.alerts.subscribe(), ctx.shutdown.clone()))
}
async fn ws_chat(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_conn(socket, ctx.chat.subscribe(), ctx.shutdown.clone()))
}

/// Encaminha o que chega no broadcast pra a página, até ela sair ou o servidor parar.
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
                    // Página lenta pulou eventos antigos: segue (não derruba a conexão).
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    // Servidor parou (todos os senders sumiram): encerra.
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    // A página não fala — só ouve. Só reagimos ao fim da conexão.
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }
}

/// Empurra um ALERTA pras páginas de overlay conectadas. No-op se o servidor está parado
/// (ou sem nenhuma página aberta) — nunca bloqueia o funil de alertas do chat.
pub fn push(server: &Mutex<OverlayServer>, alert: &Alert) {
    push_json(
        server,
        |s| s.alerts.clone(),
        || serde_json::to_string(alert),
    );
}

/// Empurra uma MENSAGEM de chat pras páginas do overlay de chat conectadas. No-op sem servidor.
pub fn push_chat(server: &Mutex<OverlayServer>, msg: &ChatMessage) {
    push_json(server, |s| s.chat.clone(), || serde_json::to_string(msg));
}

/// Núcleo dos dois push: pega o sender (curto lock), serializa fora do lock, difunde.
fn push_json(
    server: &Mutex<OverlayServer>,
    pick: impl FnOnce(&OverlayServer) -> Option<broadcast::Sender<String>>,
    to_json: impl FnOnce() -> Result<String, serde_json::Error>,
) {
    let tx = match pick(&server.lock().unwrap()) {
        Some(tx) => tx,
        None => return, // servidor desligado / canal inexistente
    };
    // Nenhuma página desse tipo conectada → nem serializa (chat é volumoso; poupa CPU à toa).
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
fn info_for(port: u16) -> OverlayInfo {
    OverlayInfo {
        port,
        url: overlay_url(port),
        chat_url: chat_url(port),
    }
}

/// Sobe o servidor na porta FIXA `port`, ou devolve a info se já estiver rodando (idempotente).
pub async fn start(server: &Mutex<OverlayServer>, port: u16) -> Result<OverlayInfo, String> {
    {
        let s = server.lock().unwrap();
        if s.handle.is_some() && s.port != 0 {
            return Ok(info_for(s.port));
        }
    }

    // Só loopback + porta fixa: URL estável pro OBS e sem exposição na LAN. bind antes do lock
    // final fecha a corrida (TOCTOU) entre dois starts.
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|e| {
            format!(
                "não consegui abrir o overlay na porta {port} — parece ocupada por outro programa \
             ({e}). Feche o que estiver usando essa porta e ligue o overlay de novo."
            )
        })?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (sh_tx, sh_rx) = oneshot::channel::<()>();
    let (kick_tx, kick_rx) = watch::channel(false);
    let (alert_tx, _alert_rx) = broadcast::channel::<String>(ALERT_BUF);
    let (chat_tx, _chat_rx) = broadcast::channel::<String>(CHAT_BUF);
    let ctx = Ctx {
        alerts: alert_tx.clone(),
        chat: chat_tx.clone(),
        shutdown: kick_rx,
    };
    let app = Router::new()
        .route("/alerts", get(overlay_page))
        .route("/alerts-ws", get(ws_alerts))
        .route("/chat", get(chat_page))
        .route("/chat-ws", get(ws_chat))
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
    s.port = bound;
    Ok(info_for(bound))
}

pub fn stop(server: &Mutex<OverlayServer>) {
    let mut s = server.lock().unwrap();
    s.alerts = None; // corta os fan-outs
    s.chat = None;
    if let Some(k) = s.disconnect.take() {
        let _ = k.send(true); // fecha as páginas conectadas agora
    }
    if let Some(tx) = s.shutdown.take() {
        let _ = tx.send(()); // para de aceitar novas conexões
    }
    s.handle = None; // dropar o handle DESACOPLA (não aborta) — a task drena e libera a porta
    s.port = 0;
}

/// Info atual (pra UI mostrar as URLs sem reiniciar o servidor). `None` = parado.
pub fn info(server: &Mutex<OverlayServer>) -> Option<OverlayInfo> {
    let s = server.lock().unwrap();
    if s.handle.is_some() && s.port != 0 {
        Some(info_for(s.port))
    } else {
        None
    }
}
