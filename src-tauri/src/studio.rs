//! Mesa (co-stream P2P): servidor local que (1) serve a página de ESTÚDIO pro OBS
//! (Browser Source) e (2) é o relay de SINALIZAÇÃO WebRTC. Só texto passa por aqui —
//! a mídia é P2P direto entre os pares (DTLS-SRTP). Roda no host; convidados (cada um
//! na sua Corneta) se conectam ao relay do host pelo endereço do convite.
//!
//! Protocolo (JSON sobre WebSocket), idêntico ao de src/lib/mesa.ts e assets/studio.html:
//!   cliente → relay : {t:"join",room,peerId,role,name} | {t:"signal",to,data} | {t:"leave"} | {t:"ping"}
//!   relay → cliente : {t:"welcome",peers:[{peerId,role,name}]} | {t:"peer-join",peer:{…}}
//!                     | {t:"peer-leave",peerId} | {t:"signal",from,data} | {t:"pong"}
//! O relay é burro: só encaminha `signal` de `from` pra `to` e difunde presença por sala.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use axum::Router;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, watch};

/// Página self-contained do OBS (CSS/JS inline). CARGO_MANIFEST_DIR = src-tauri/.
const STUDIO_HTML: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/studio.html"));

/// Fila por par: bounded → um par travado (não lê) descarta o excedente em vez de
/// crescer memória sem teto. Sinalização é leve (SDP/ICE de poucos KB).
const PEER_QUEUE: usize = 256;
/// Teto de tamanho de mensagem ws (SDP/ICE cabem folgado em 64 KiB).
const MAX_WS_MSG: usize = 64 * 1024;

/// Token único por conexão — distingue dono atual da entrada (peerId) de uma conexão
/// fantasma antiga. Sem isso, a limpeza da conexão velha removeria o par que reconectou.
static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

struct Peer {
    role: String,
    name: String,
    tx: mpsc::Sender<String>,
    token: u64,
    /// Segredo por par (gerado no cliente, só viaja no `join`, nunca é difundido).
    /// Só quem o conhece reassume o peerId — fecha o sequestro de slot por insider.
    secret: String,
}

/// room → (peerId → Peer). Em memória; sala vazia some.
#[derive(Default)]
struct Rooms {
    map: HashMap<String, HashMap<String, Peer>>,
}

type SharedRooms = Arc<Mutex<Rooms>>;

#[derive(Clone)]
struct Ctx {
    rooms: SharedRooms,
    /// Vira `true` no stop() → fecha as conexões vivas (não só o accept loop).
    shutdown: watch::Receiver<bool>,
}

async fn studio_page() -> Html<&'static str> {
    Html(STUDIO_HTML)
}

async fn ws_handler(ws: WebSocketUpgrade, State(ctx): State<Ctx>) -> impl IntoResponse {
    ws.max_message_size(MAX_WS_MSG)
        .max_frame_size(MAX_WS_MSG)
        .on_upgrade(move |socket| handle_conn(socket, ctx))
}

async fn handle_conn(mut socket: WebSocket, ctx: Ctx) {
    let (tx, mut rx) = mpsc::channel::<String>(PEER_QUEUE);
    let token = NEXT_TOKEN.fetch_add(1, Ordering::Relaxed);
    let mut shutdown = ctx.shutdown.clone();
    // (room, peerId) depois do join — usado pra limpar na saída.
    let mut joined: Option<(String, String)> = None;

    loop {
        tokio::select! {
            _ = shutdown.changed() => {
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
            outbound = rx.recv() => {
                match outbound {
                    Some(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Text(t))) => {
                        if let Ok(v) = serde_json::from_str::<Value>(t.as_str()) {
                            handle_msg(&ctx, &mut joined, &tx, token, v);
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {} // ping/pong/binário do protocolo ws → ignora
                    Some(Err(_)) => break,
                }
            }
        }
    }

    if let Some((room, peer_id)) = joined {
        on_leave(&ctx, &room, &peer_id, token);
    }
}

fn handle_msg(
    ctx: &Ctx,
    joined: &mut Option<(String, String)>,
    my_tx: &mpsc::Sender<String>,
    token: u64,
    v: Value,
) {
    let t = v.get("t").and_then(|x| x.as_str()).unwrap_or("");
    match t {
        "join" => {
            let room = v
                .get("room")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let peer_id = v
                .get("peerId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let role = v
                .get("role")
                .and_then(|x| x.as_str())
                .unwrap_or("control")
                .to_string();
            let name = v
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let secret = v
                .get("secret")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if room.is_empty() || peer_id.is_empty() {
                return;
            }
            // Uma conexão = um único membro. Se já tinha entrado (outra sala/peerId), sai antes
            // — senão a entrada antiga vira par-fantasma (sala nunca esvazia, outros sinalizam um
            // peer que sumiu). on_leave tranca ctx.rooms, então roda ANTES de pegar o lock abaixo
            // (std::sync::Mutex não é reentrante).
            if let Some((old_room, old_peer)) = joined.take() {
                if (old_room.as_str(), old_peer.as_str()) != (room.as_str(), peer_id.as_str()) {
                    on_leave(ctx, &old_room, &old_peer, token);
                }
            }
            let mut rooms = ctx.rooms.lock().unwrap();
            let r = rooms.map.entry(room.clone()).or_default();
            // Anti-sequestro: o peerId é difundido a todos na sala. Sem isto, um membro
            // poderia dar `join` com o peerId de outro e roubar o canal de sinalização
            // dele. Só quem trouxe o mesmo `secret` (o próprio dono, reconectando)
            // reassume o slot; um terceiro não conhece o segredo → entra recusado.
            if let Some(existing) = r.get(&peer_id) {
                if existing.secret != secret {
                    let _ =
                        my_tx.try_send(json!({ "t": "error", "code": "peer-taken" }).to_string());
                    return;
                }
            }
            // welcome: quem já está na sala (com papel e nome).
            let existing: Vec<Value> = r
                .iter()
                .map(|(id, p)| json!({ "peerId": id, "role": p.role, "name": p.name }))
                .collect();
            let _ = my_tx.try_send(json!({ "t": "welcome", "peers": existing }).to_string());
            // anuncia a entrada aos demais.
            let join_evt = json!({
                "t": "peer-join",
                "peer": { "peerId": peer_id, "role": role, "name": name }
            })
            .to_string();
            for (id, p) in r.iter() {
                if id != &peer_id {
                    let _ = p.tx.try_send(join_evt.clone());
                }
            }
            r.insert(
                peer_id.clone(),
                Peer {
                    role,
                    name,
                    tx: my_tx.clone(),
                    token,
                    secret,
                },
            );
            *joined = Some((room, peer_id));
        }
        "signal" => {
            let (room, from) = match joined.as_ref() {
                Some(x) => x.clone(),
                None => return,
            };
            let to = v.get("to").and_then(|x| x.as_str()).unwrap_or("");
            if to.is_empty() {
                return;
            }
            let data = v.get("data").cloned().unwrap_or(Value::Null);
            let rooms = ctx.rooms.lock().unwrap();
            if let Some(p) = rooms.map.get(&room).and_then(|r| r.get(to)) {
                let _ =
                    p.tx.try_send(json!({ "t": "signal", "from": from, "data": data }).to_string());
            }
        }
        "leave" => {
            if let Some((room, peer_id)) = joined.take() {
                on_leave(ctx, &room, &peer_id, token);
            }
        }
        "ping" => {
            let _ = my_tx.try_send(json!({ "t": "pong" }).to_string());
        }
        _ => {}
    }
}

/// Só remove/anuncia a saída se a entrada ainda é DESTA conexão (token bate). Uma conexão
/// fantasma antiga que cai depois do reconnect não derruba o par que reentrou.
fn on_leave(ctx: &Ctx, room: &str, peer_id: &str, token: u64) {
    let mut rooms = ctx.rooms.lock().unwrap();
    if let Some(r) = rooms.map.get_mut(room) {
        if r.get(peer_id).map(|p| p.token) != Some(token) {
            return;
        }
        r.remove(peer_id);
        let evt = json!({ "t": "peer-leave", "peerId": peer_id }).to_string();
        for p in r.values() {
            let _ = p.tx.try_send(evt.clone());
        }
        if r.is_empty() {
            rooms.map.remove(room);
        }
    }
}

// --------------------------- ciclo de vida ---------------------------

#[derive(Default)]
pub struct StudioServer {
    handle: Option<JoinHandle<()>>,
    shutdown: Option<oneshot::Sender<()>>, // para o accept loop
    disconnect: Option<watch::Sender<bool>>, // fecha conexões vivas
    pub port: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MesaServerInfo {
    pub port: u16,
    pub lan_ip: String,
}

fn current_lan_ip() -> String {
    lan_ipv4()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".into())
}

/// Sobe o servidor (porta efêmera) ou devolve a info se já estiver rodando (idempotente).
pub async fn start(server: &Mutex<StudioServer>) -> Result<MesaServerInfo, String> {
    {
        let s = server.lock().unwrap();
        if s.handle.is_some() && s.port != 0 {
            return Ok(MesaServerInfo {
                port: s.port,
                lan_ip: current_lan_ip(),
            });
        }
    }

    // bind antes de pegar o lock final: fecha a janela de corrida (TOCTOU) entre dois starts.
    // 0.0.0.0:0 → porta efêmera; OBS usa 127.0.0.1, convidado usa o IP da LAN.
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .await
        .map_err(|e| format!("falha ao abrir o servidor da Mesa: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (sh_tx, sh_rx) = oneshot::channel::<()>();
    let (kick_tx, kick_rx) = watch::channel(false);
    let ctx = Ctx {
        rooms: Arc::new(Mutex::new(Rooms::default())),
        shutdown: kick_rx,
    };
    let app = Router::new()
        .route("/studio", get(studio_page))
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
    s.port = bound;
    Ok(MesaServerInfo {
        port: bound,
        lan_ip: current_lan_ip(),
    })
}

pub fn stop(server: &Mutex<StudioServer>) {
    let mut s = server.lock().unwrap();
    if let Some(k) = s.disconnect.take() {
        let _ = k.send(true); // fecha os pares conectados agora
    }
    if let Some(tx) = s.shutdown.take() {
        let _ = tx.send(()); // para de aceitar novas conexões
    }
    s.handle = None; // dropar o handle DESACOPLA (não aborta) — a task drena e libera a porta
    s.port = 0;
}

/// IPv4 da LAN sem dependência externa: o UDP connect só fixa a rota (nada é enviado).
fn lan_ipv4() -> Option<Ipv4Addr> {
    let sock = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    sock.connect((Ipv4Addr::new(8, 8, 8, 8), 80)).ok()?;
    match sock.local_addr().ok()?.ip() {
        IpAddr::V4(v4) if !v4.is_loopback() => Some(v4),
        _ => None,
    }
}
