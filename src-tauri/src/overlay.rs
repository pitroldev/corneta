//! Overlay de ALERTAS pro OBS (Browser Source). Servidor HTTP local que serve a página
//! animada de alertas + um WebSocket que empurra cada `Alert` pra ela em tempo real. Mesma
//! família do `studio.rs` da Mesa, com duas diferenças de propósito:
//!   1. **Porta FIXA** (não efêmera): a URL é colada no OBS UMA vez e precisa valer entre
//!      reinícios do app — porta efêmera quebraria a Browser Source a cada boot.
//!   2. **Só loopback (127.0.0.1)**: alertas carregam NOME e VALOR de quem doou — isso não
//!      pode vazar pra LAN (a Mesa expõe na LAN de propósito; aqui é o oposto).
//!
//! A fonte é o funil único `chat::emit_alert` → `push()`, que difunde por um broadcast pras
//! páginas conectadas. Sem servidor de pé (ou sem página aberta), `push` é no-op — nunca
//! bloqueia nem atrapalha o caminho dos alertas.

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

use crate::chat::Alert;

/// Página self-contained do overlay (CSS/JS inline). CARGO_MANIFEST_DIR = src-tauri/.
const OVERLAY_HTML: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/overlay.html"));

/// Buffer do broadcast: alertas são raros; 64 cobre uma rajada (raid + gifts em sequência)
/// sem crescer memória. Uma página lenta que atrasa 64 alertas só perde os mais antigos.
const EVENT_BUF: usize = 64;

#[derive(Default)]
pub struct OverlayServer {
    handle: Option<JoinHandle<()>>,
    shutdown: Option<oneshot::Sender<()>>, // para o accept loop
    disconnect: Option<watch::Sender<bool>>, // fecha as páginas conectadas agora
    /// Fan-out dos alertas pras páginas. `None` = servidor parado (push vira no-op).
    events: Option<broadcast::Sender<String>>,
    pub port: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    pub port: u16,
    /// URL base (sem query) pra colar no OBS como Browser Source.
    pub url: String,
}

#[derive(Clone)]
struct Ctx {
    events: broadcast::Sender<String>,
    /// Vira `true` no stop() → fecha as conexões vivas (não só o accept loop).
    shutdown: watch::Receiver<bool>,
}

async fn overlay_page() -> Html<&'static str> {
    Html(OVERLAY_HTML)
}

async fn ws_handler(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_conn(socket, ctx))
}

async fn handle_conn(mut socket: WebSocket, ctx: Ctx) {
    let mut rx = ctx.events.subscribe();
    let mut shutdown = ctx.shutdown.clone();
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
                    // Página lenta pulou alertas antigos: segue (não derruba a conexão).
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

/// Empurra um alerta pras páginas de overlay conectadas. No-op se o servidor está parado
/// (ou sem nenhuma página aberta) — nunca bloqueia o funil de alertas do chat.
pub fn push(server: &Mutex<OverlayServer>, alert: &Alert) {
    let tx = {
        let s = server.lock().unwrap();
        match &s.events {
            Some(tx) => tx.clone(),
            None => return, // servidor desligado
        }
    };
    if let Ok(json) = serde_json::to_string(alert) {
        let _ = tx.send(json); // Err = nenhuma página conectada; tudo bem
    }
}

fn overlay_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/overlay")
}

/// Sobe o servidor na porta FIXA `port`, ou devolve a info se já estiver rodando (idempotente).
pub async fn start(server: &Mutex<OverlayServer>, port: u16) -> Result<OverlayInfo, String> {
    {
        let s = server.lock().unwrap();
        if s.handle.is_some() && s.port != 0 {
            return Ok(OverlayInfo { port: s.port, url: overlay_url(s.port) });
        }
    }

    // Só loopback + porta fixa: URL estável pro OBS e sem exposição na LAN. bind antes do lock
    // final fecha a corrida (TOCTOU) entre dois starts.
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await.map_err(|e| {
        format!(
            "não consegui abrir o overlay na porta {port} — parece ocupada por outro programa \
             ({e}). Feche o que estiver usando essa porta e ligue o overlay de novo."
        )
    })?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (sh_tx, sh_rx) = oneshot::channel::<()>();
    let (kick_tx, kick_rx) = watch::channel(false);
    let (ev_tx, _ev_rx) = broadcast::channel::<String>(EVENT_BUF);
    let ctx = Ctx { events: ev_tx.clone(), shutdown: kick_rx };
    let app = Router::new()
        .route("/overlay", get(overlay_page))
        .route("/ws", get(ws_handler))
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
    s.events = Some(ev_tx);
    s.port = bound;
    Ok(OverlayInfo { port: bound, url: overlay_url(bound) })
}

pub fn stop(server: &Mutex<OverlayServer>) {
    let mut s = server.lock().unwrap();
    s.events = None; // corta o fan-out
    if let Some(k) = s.disconnect.take() {
        let _ = k.send(true); // fecha as páginas conectadas agora
    }
    if let Some(tx) = s.shutdown.take() {
        let _ = tx.send(()); // para de aceitar novas conexões
    }
    s.handle = None; // dropar o handle DESACOPLA (não aborta) — a task drena e libera a porta
    s.port = 0;
}

/// Info atual (pra UI mostrar a URL sem reiniciar o servidor). `None` = parado.
pub fn info(server: &Mutex<OverlayServer>) -> Option<OverlayInfo> {
    let s = server.lock().unwrap();
    if s.handle.is_some() && s.port != 0 {
        Some(OverlayInfo { port: s.port, url: overlay_url(s.port) })
    } else {
        None
    }
}
