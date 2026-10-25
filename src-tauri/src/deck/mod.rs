//! Phone deck: an opt-in page that controls the live from a phone on the home network.
//! It is the only Corneta server reachable beyond loopback, so every request must come from a
//! home address, name this PC by IP and, for the WebSocket, come from the deck page itself.
//! Control needs a phone paired through a code the streamer confirms on the PC.

mod actions;
mod combos;
mod net;
mod pairing;
mod state;

use std::collections::{HashMap, HashSet, VecDeque};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, watch, Notify};

use crate::config::AppConfig;
use crate::i18n::Msg;
use crate::obs::{LinkRequest, LinkState};
use crate::AppState;

pub use actions::{desktop_done, is_action};
pub use combos::{is_layout_key, normalize as normalize_combos};
pub use pairing::device_name;

pub const MAX_KEYS: usize = 10;
pub const MAX_DEVICES: usize = 8;
const CHAT_HISTORY: usize = 60;
const MAX_MESSAGE: usize = 16 * 1024;
const COMMAND_WINDOW: Duration = Duration::from_secs(2);
const COMMAND_LIMIT: usize = 12;
const FAILED_HELLO_LIMIT: usize = 10;
const FAILED_HELLO_WINDOW: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct DeckRuntime {
    hub: Mutex<Option<Arc<Hub>>>,
    error: Mutex<Option<String>>,
    lifecycle: tokio::sync::Mutex<()>,
}

enum Outbound {
    Text(String),
    Close,
}

struct Client {
    device: Option<String>,
    tx: mpsc::UnboundedSender<Outbound>,
    commands: VecDeque<Instant>,
}

pub struct Hub {
    app: AppHandle,
    port: u16,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    kick: watch::Sender<bool>,
    pairing: Mutex<pairing::Pairing>,
    clients: Mutex<HashMap<u64, Client>>,
    next_conn: AtomicU64,
    authed: Arc<AtomicUsize>,
    cfg: Mutex<AppConfig>,
    ready: Mutex<(usize, usize)>,
    chat: Mutex<VecDeque<Value>>,
    viewers: Mutex<Option<Value>>,
    session: Mutex<state::Session>,
    dirty: Notify,
    obs_state: Arc<Mutex<LinkState>>,
    obs_requests: Mutex<std::sync::mpsc::Sender<LinkRequest>>,
    obs_alive: Arc<AtomicBool>,
    desktop_requests: Mutex<HashMap<String, oneshot::Sender<Result<(), String>>>>,
    failures: Mutex<HashMap<IpAddr, (usize, Instant)>>,
    /// Built frontend files; empty in development, where Tauri reads them from disk instead.
    assets: HashSet<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClientMsg {
    Pair {
        token: String,
        name: String,
    },
    Hello {
        device: String,
        secret: String,
    },
    Cmd {
        id: String,
        action: String,
        #[serde(default)]
        args: Value,
    },
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Windows exposes the PC name the streamer recognizes from the network.
fn pc_name() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "PC".into())
}

fn hub(app: &AppHandle) -> Option<Arc<Hub>> {
    app.try_state::<AppState>()?
        .deck
        .hub
        .lock()
        .unwrap()
        .clone()
}

impl Hub {
    fn config(&self) -> AppConfig {
        self.cfg.lock().unwrap().clone()
    }

    fn touch(&self) {
        self.dirty.notify_one();
    }

    /// Readiness reads the vault, so it is computed when the config changes rather than per state.
    fn refresh_config(&self, cfg: AppConfig) {
        let enabled: Vec<_> = cfg.targets.iter().filter(|t| t.enabled).collect();
        let ready = enabled
            .iter()
            .filter(|t| !t.ingest_url.is_empty() && crate::keys::has_key(&t.id))
            .count();
        *self.ready.lock().unwrap() = (ready, enabled.len());
        *self.cfg.lock().unwrap() = cfg;
    }

    fn send(&self, conn: u64, value: &Value) {
        if let Some(client) = self.clients.lock().unwrap().get(&conn) {
            let _ = client.tx.send(Outbound::Text(value.to_string()));
        }
    }

    fn close(&self, conn: u64) {
        if let Some(client) = self.clients.lock().unwrap().get(&conn) {
            let _ = client.tx.send(Outbound::Close);
        }
    }

    /// Chat and alerts go only to paired phones.
    fn broadcast(&self, value: &Value) {
        let text = value.to_string();
        for client in self.clients.lock().unwrap().values() {
            if client.device.is_some() {
                let _ = client.tx.send(Outbound::Text(text.clone()));
            }
        }
    }

    fn state_json(&self) -> Value {
        let cfg = self.config();
        let snapshot = self
            .app
            .state::<AppState>()
            .engine
            .lock()
            .unwrap()
            .snapshot
            .clone();
        let viewers = self.viewers.lock().unwrap().clone();
        let obs = self.obs_state.lock().unwrap().clone();
        let session = self.session.lock().unwrap().clone();
        let ready = *self.ready.lock().unwrap();
        state::build(&state::Input {
            cfg: &cfg,
            snapshot: snapshot.as_ref(),
            viewers: viewers.as_ref(),
            obs: &obs,
            session: &session,
            ready,
            pc: &pc_name(),
            now: now_ms(),
        })
    }

    fn broadcast_state(&self) {
        let base = self.state_json();
        let devices = self.config().settings.deck_devices;
        for client in self.clients.lock().unwrap().values() {
            let Some(device) = &client.device else {
                continue;
            };
            let mut state = base.clone();
            let name = devices
                .iter()
                .find(|d| &d.id == device)
                .map(|d| d.name.clone())
                .unwrap_or_default();
            state["device"] = json!({ "id": device, "name": name });
            let _ = client.tx.send(Outbound::Text(state.to_string()));
        }
    }

    fn observe_session(&self) {
        let snapshot = self
            .app
            .state::<AppState>()
            .engine
            .lock()
            .unwrap()
            .snapshot
            .clone();
        self.session
            .lock()
            .unwrap()
            .observe(snapshot.as_ref(), now_ms());
    }

    fn expire_pairing(&self) {
        let expired = self.pairing.lock().unwrap().expire(Instant::now());
        for (id, pending) in expired {
            self.send(pending.conn, &json!({ "type": "pair-expired" }));
            let _ = self
                .app
                .emit("deck://pair-closed", json!({ "requestId": id }));
        }
    }

    fn authenticate(&self, conn: u64, device: &str) {
        let mut clients = self.clients.lock().unwrap();
        if let Some(client) = clients.get_mut(&conn) {
            if client.device.is_none() {
                self.authed.fetch_add(1, Ordering::Relaxed);
            }
            client.device = Some(device.to_string());
        }
    }

    fn send_initial(&self, conn: u64) {
        self.observe_session();
        self.touch();
        let history: Vec<Value> = self.chat.lock().unwrap().iter().cloned().collect();
        self.send(
            conn,
            &json!({ "type": "chat-history", "messages": history }),
        );
    }

    fn too_many_failures(&self, ip: IpAddr) -> bool {
        let failures = self.failures.lock().unwrap();
        failures.get(&ip).is_some_and(|(count, since)| {
            *count >= FAILED_HELLO_LIMIT && since.elapsed() < FAILED_HELLO_WINDOW
        })
    }

    fn record_failure(&self, ip: IpAddr) {
        let mut failures = self.failures.lock().unwrap();
        let entry = failures.entry(ip).or_insert((0, Instant::now()));
        if entry.1.elapsed() >= FAILED_HELLO_WINDOW {
            *entry = (0, Instant::now());
        }
        entry.0 += 1;
    }

    fn handle(self: &Arc<Self>, conn: u64, ip: IpAddr, text: &str) {
        let Ok(message) = serde_json::from_str::<ClientMsg>(text) else {
            return;
        };
        match message {
            ClientMsg::Pair { token, name } => self.pair(conn, &token, &name),
            ClientMsg::Hello { device, secret } => self.hello(conn, ip, &device, &secret),
            ClientMsg::Cmd { id, action, args } => self.command(conn, id, action, args),
        }
    }

    fn pair(&self, conn: u64, token: &str, name: &str) {
        let now = Instant::now();
        if !self.pairing.lock().unwrap().redeem(token, now) {
            self.send(conn, &json!({ "type": "pair-invalid" }));
            return;
        }
        if self.config().settings.deck_devices.len() >= MAX_DEVICES {
            self.send(
                conn,
                &json!({ "type": "pair-full", "message": Msg::DeckTooManyDevices { max: MAX_DEVICES as u16 }.now() }),
            );
            return;
        }
        let name = pairing::device_name(name, &Msg::DeckDefaultDeviceName.now());
        let (request, code) = self
            .pairing
            .lock()
            .unwrap()
            .request(name.clone(), conn, now);
        self.send(
            conn,
            &json!({ "type": "pairing", "code": code, "pc": pc_name() }),
        );
        let _ = self.app.emit(
            "deck://pair-request",
            json!({ "requestId": request, "name": name, "code": code }),
        );
        let visible = self
            .app
            .get_webview_window("main")
            .is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(true));
        if !visible {
            crate::commands::notify(
                &self.app,
                &Msg::NotifyDeckPairTitle.now(),
                &Msg::NotifyDeckPairBody { name: &name }.now(),
            );
        }
    }

    fn hello(&self, conn: u64, ip: IpAddr, device: &str, secret: &str) {
        if self.too_many_failures(ip) {
            self.send(conn, &json!({ "type": "unknown-device" }));
            self.close(conn);
            return;
        }
        let known = self
            .config()
            .settings
            .deck_devices
            .iter()
            .any(|d| d.id == device);
        let verified = known
            && crate::keys::get_key(&pairing::vault_key(device))
                .is_some_and(|verifier| pairing::verify(secret, &verifier));
        if !verified {
            self.record_failure(ip);
            self.send(conn, &json!({ "type": "unknown-device" }));
            self.close(conn);
            return;
        }
        self.authenticate(conn, device);
        self.send_initial(conn);
        publish_status(&self.app);
    }

    fn command(self: &Arc<Self>, conn: u64, id: String, action: String, args: Value) {
        let id: String = id.chars().take(64).collect();
        let mut device = String::new();
        let refusal = {
            let mut clients = self.clients.lock().unwrap();
            let Some(client) = clients.get_mut(&conn) else {
                return;
            };
            if let Some(id) = &client.device {
                device = id.clone();
            }
            if client.device.is_none() {
                Some(Msg::DeckDeviceUnknown.now())
            } else {
                let now = Instant::now();
                while client
                    .commands
                    .front()
                    .is_some_and(|at| now.duration_since(*at) > COMMAND_WINDOW)
                {
                    client.commands.pop_front();
                }
                if client.commands.len() >= COMMAND_LIMIT {
                    Some(Msg::DeckTooFast.now())
                } else {
                    client.commands.push_back(now);
                    None
                }
            }
        };
        if let Some(message) = refusal {
            self.send(
                conn,
                &json!({ "type": "result", "id": id, "ok": false, "message": message }),
            );
            return;
        }
        let hub = self.clone();
        tauri::async_runtime::spawn(async move {
            let reply = match actions::run(&hub, &device, &action, &args).await {
                Ok(data) => json!({ "type": "result", "id": id, "ok": true, "data": data }),
                Err(message) => {
                    json!({ "type": "result", "id": id, "ok": false, "message": message })
                }
            };
            hub.send(conn, &reply);
            hub.touch();
        });
    }

    fn disconnect(&self, conn: u64) {
        let removed = self.clients.lock().unwrap().remove(&conn);
        if removed.is_some_and(|client| client.device.is_some()) {
            self.authed.fetch_sub(1, Ordering::Relaxed);
        }
        for id in self.pairing.lock().unwrap().drop_conn(conn) {
            let _ = self
                .app
                .emit("deck://pair-closed", json!({ "requestId": id }));
        }
        publish_status(&self.app);
    }

    fn revoke(&self, device: &str) {
        for client in self.clients.lock().unwrap().values() {
            if client.device.as_deref() == Some(device) {
                let _ = client
                    .tx
                    .send(Outbound::Text(json!({ "type": "revoked" }).to_string()));
                let _ = client.tx.send(Outbound::Close);
            }
        }
    }
}

fn header_str(headers: &HeaderMap, name: header::HeaderName) -> Option<&str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

fn allowed(hub: &Hub, peer: SocketAddr, headers: &HeaderMap) -> bool {
    net::is_private_peer(peer.ip())
        && net::host_allowed(header_str(headers, header::HOST), hub.port)
}

fn hardened(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    response
}

async fn root() -> Redirect {
    Redirect::temporary("/deck")
}

/// The desktop CSP baked into the page names loopback sockets; the deck needs its own LAN origin.
fn strip_csp_meta(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(start) = rest.find("<meta http-equiv=\"Content-Security-Policy\"") {
        out.push_str(&rest[..start]);
        match rest[start..].find('>') {
            Some(end) => rest = &rest[start + end + 1..],
            None => {
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);
    out
}

async fn page(
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    State(hub): State<Arc<Hub>>,
) -> Response {
    if !allowed(&hub, peer, &headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(asset) = hub.app.asset_resolver().get("deck.html".into()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let host = header_str(&headers, header::HOST).unwrap_or_default();
    let csp = format!(
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; \
         img-src 'self' data: https:; connect-src 'self' ws://{host}; base-uri 'none'; \
         object-src 'none'; frame-ancestors 'none'; form-action 'none'"
    );
    let html = strip_csp_meta(&String::from_utf8_lossy(&asset.bytes));
    let mut response = html.into_response();
    let h = response.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(value) = HeaderValue::from_str(&csp) {
        h.insert(header::CONTENT_SECURITY_POLICY, value);
    }
    hardened(response)
}

async fn asset(
    Path(file): Path<String>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    State(hub): State<Arc<Hub>>,
) -> Response {
    let key = format!("assets/{file}");
    // Tauri answers unknown paths with index.html, so only files from the build are served.
    let known = hub.assets.is_empty() || hub.assets.contains(&key);
    if !allowed(&hub, peer, &headers) || !net::asset_name_allowed(&file) || !known {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(asset) = hub.app.asset_resolver().get(key) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = asset.mime_type.clone();
    let mut response = asset.bytes.into_response();
    let h = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(&mime) {
        h.insert(header::CONTENT_TYPE, value);
    }
    h.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    hardened(response)
}

async fn ws_route(
    ws: WebSocketUpgrade,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    State(hub): State<Arc<Hub>>,
) -> Response {
    let host = header_str(&headers, header::HOST).unwrap_or_default();
    if !allowed(&hub, peer, &headers)
        || !net::origin_allowed(header_str(&headers, header::ORIGIN), host)
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(MAX_MESSAGE)
        .on_upgrade(move |socket| session(hub, socket, peer.ip()))
}

async fn session(hub: Arc<Hub>, mut socket: WebSocket, ip: IpAddr) {
    let conn = hub.next_conn.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::unbounded_channel();
    hub.clients.lock().unwrap().insert(
        conn,
        Client {
            device: None,
            tx,
            commands: VecDeque::new(),
        },
    );
    let mut kick = hub.kick.subscribe();
    loop {
        tokio::select! {
            _ = kick.changed() => {
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
            out = rx.recv() => match out {
                Some(Outbound::Text(text)) => {
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Some(Outbound::Close) | None => {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            },
            inbound = socket.recv() => match inbound {
                Some(Ok(Message::Text(text))) => hub.handle(conn, ip, text.as_str()),
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            },
        }
    }
    hub.disconnect(conn);
}

/// Coalesces changes into at most a few states per second, plus a heartbeat for uptime.
async fn pump(hub: Arc<Hub>) {
    let mut kick = hub.kick.subscribe();
    loop {
        tokio::select! {
            _ = hub.dirty.notified() => tokio::time::sleep(Duration::from_millis(80)).await,
            _ = tokio::time::sleep(Duration::from_secs(1)) => {}
            _ = kick.changed() => break,
        }
        if *kick.borrow() {
            break;
        }
        hub.expire_pairing();
        hub.observe_session();
        if hub.authed.load(Ordering::Relaxed) > 0 {
            hub.broadcast_state();
        }
    }
}

async fn start_hub(app: &AppHandle, cfg: AppConfig) {
    let runtime = &app.state::<AppState>().deck;
    let port = cfg.settings.deck_port as u16;
    let listener = match TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::warn!("deck: bind failed: port={port} kind={:?}", e.kind());
            *runtime.error.lock().unwrap() = Some(
                Msg::DeckServerOpenFailed {
                    port,
                    e: &e.to_string(),
                }
                .now(),
            );
            return;
        }
    };
    *runtime.error.lock().unwrap() = None;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let (kick_tx, _) = watch::channel(false);
    let (obs_tx, obs_rx) = std::sync::mpsc::channel();
    let assets = app
        .asset_resolver()
        .iter()
        .map(|(key, _)| key.trim_start_matches('/').to_string())
        .collect();
    let hub = Arc::new(Hub {
        app: app.clone(),
        port,
        shutdown: Mutex::new(Some(shutdown_tx)),
        kick: kick_tx,
        pairing: Mutex::new(pairing::Pairing::default()),
        clients: Mutex::new(HashMap::new()),
        next_conn: AtomicU64::new(1),
        authed: Arc::new(AtomicUsize::new(0)),
        cfg: Mutex::new(AppConfig::default()),
        ready: Mutex::new((0, 0)),
        chat: Mutex::new(VecDeque::new()),
        viewers: Mutex::new(None),
        session: Mutex::new(state::Session::default()),
        dirty: Notify::new(),
        obs_state: Arc::new(Mutex::new(LinkState::default())),
        obs_requests: Mutex::new(obs_tx),
        obs_alive: Arc::new(AtomicBool::new(true)),
        desktop_requests: Mutex::new(HashMap::new()),
        failures: Mutex::new(HashMap::new()),
        assets,
    });
    hub.refresh_config(cfg);
    {
        let password = hub.clone();
        let wanted = hub.authed.clone();
        let changed = hub.clone();
        let alive = hub.obs_alive.clone();
        let shared = hub.obs_state.clone();
        std::thread::spawn(move || {
            crate::obs::run_link(
                move || password.cfg.lock().unwrap().settings.obs_password.clone(),
                move || wanted.load(Ordering::Relaxed) > 0,
                alive,
                shared,
                obs_rx,
                move || changed.touch(),
            );
        });
    }
    let router = Router::new()
        .route("/", get(root))
        .route("/deck", get(page))
        .route("/deck/ws", get(ws_route))
        .route("/assets/{file}", get(asset))
        .with_state(hub.clone());
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await;
    });
    tauri::async_runtime::spawn(pump(hub.clone()));
    *runtime.hub.lock().unwrap() = Some(hub);
    log::info!("deck: listening on the home network, port {port}");
}

fn stop_hub(app: &AppHandle, hub: Arc<Hub>) {
    let _ = hub.kick.send(true);
    if let Some(tx) = hub.shutdown.lock().unwrap().take() {
        let _ = tx.send(());
    }
    hub.obs_alive.store(false, Ordering::Relaxed);
    for (_, tx) in hub.desktop_requests.lock().unwrap().drain() {
        let _ = tx.send(Err(Msg::DeckOff.now()));
    }
    *app.state::<AppState>().deck.hub.lock().unwrap() = None;
    log::info!("deck: stopped");
}

/// Starts, stops or moves the server to match the saved settings.
pub async fn sync(app: AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let runtime = &state.deck;
    let _guard = runtime.lifecycle.lock().await;
    let cfg = crate::config::load(&app);
    let port = cfg.settings.deck_port as u16;
    let current = runtime.hub.lock().unwrap().clone();
    match (cfg.settings.deck_enabled, current) {
        (false, Some(hub)) => stop_hub(&app, hub),
        (false, None) => *runtime.error.lock().unwrap() = None,
        (true, Some(hub)) if hub.port != port => {
            stop_hub(&app, hub);
            start_hub(&app, cfg).await;
        }
        (true, None) => start_hub(&app, cfg).await,
        (true, Some(_)) => {}
    }
    publish_status(&app);
}

pub fn shutdown(app: &AppHandle) {
    if let Some(hub) = hub(app) {
        stop_hub(app, hub);
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    id: String,
    name: String,
    paired_at: u64,
    connected: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeckStatus {
    running: bool,
    port: u16,
    address: Option<String>,
    error: Option<String>,
    devices: Vec<DeviceStatus>,
}

pub fn status(app: &AppHandle) -> DeckStatus {
    let cfg = crate::config::load(app);
    let hub = hub(app);
    let connected: HashSet<String> = hub
        .as_ref()
        .map(|h| {
            h.clients
                .lock()
                .unwrap()
                .values()
                .filter_map(|c| c.device.clone())
                .collect()
        })
        .unwrap_or_default();
    let error = app
        .try_state::<AppState>()
        .and_then(|s| s.deck.error.lock().unwrap().clone());
    DeckStatus {
        running: hub.is_some(),
        port: hub
            .as_ref()
            .map(|h| h.port)
            .unwrap_or(cfg.settings.deck_port as u16),
        address: hub
            .as_ref()
            .and_then(|h| crate::studio::lan_ipv4().map(|ip| format!("{ip}:{}", h.port))),
        error,
        devices: cfg
            .settings
            .deck_devices
            .iter()
            .map(|d| DeviceStatus {
                id: d.id.clone(),
                name: d.name.clone(),
                paired_at: d.paired_at,
                connected: connected.contains(&d.id),
            })
            .collect(),
    }
}

fn publish_status(app: &AppHandle) {
    let _ = app.emit("deck://status", status(app));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairTicket {
    url: String,
    expires_in_ms: u64,
}

pub fn pair_start(app: &AppHandle) -> Result<PairTicket, String> {
    let hub = hub(app).ok_or_else(|| Msg::DeckOff.now())?;
    let ip = crate::studio::lan_ipv4().ok_or_else(|| Msg::DeckNoNetwork.now())?;
    let token = hub.pairing.lock().unwrap().issue(Instant::now());
    Ok(PairTicket {
        url: format!("http://{ip}:{}/deck#t={token}", hub.port),
        expires_in_ms: pairing::TOKEN_TTL.as_millis() as u64,
    })
}

pub fn pair_answer(app: &AppHandle, request: &str, allow: bool) -> Result<(), String> {
    let hub = hub(app).ok_or_else(|| Msg::DeckOff.now())?;
    let pending = hub
        .pairing
        .lock()
        .unwrap()
        .take(request)
        .ok_or_else(|| Msg::DeckPairGone.now())?;
    let _ = app.emit("deck://pair-closed", json!({ "requestId": request }));
    if !allow {
        hub.send(pending.conn, &json!({ "type": "refused" }));
        return Ok(());
    }
    if !hub.clients.lock().unwrap().contains_key(&pending.conn) {
        return Err(Msg::DeckPairGone.now());
    }
    let id = pairing::new_device_id();
    let secret = pairing::random_secret();
    let vault = pairing::vault_key(&id);
    crate::keys::set_key(&vault, &pairing::digest(&secret))?;
    let device = crate::config::DeckDevice {
        id: id.clone(),
        name: pending.name.clone(),
        paired_at: now_ms() as u64,
    };
    let saved = crate::commands::save_native_config(app, move |cfg| {
        cfg.settings.deck_devices.retain(|d| d.id != device.id);
        cfg.settings.deck_devices.push(device);
    });
    if let Err(e) = saved {
        let _ = crate::keys::clear_key(&vault);
        return Err(e);
    }
    hub.authenticate(pending.conn, &id);
    hub.send(
        pending.conn,
        &json!({ "type": "paired", "device": id, "secret": secret, "name": pending.name }),
    );
    hub.send_initial(pending.conn);
    publish_status(app);
    Ok(())
}

pub fn remove_device(app: &AppHandle, id: &str) -> Result<(), String> {
    crate::keys::clear_key(&pairing::vault_key(id))?;
    let gone = id.to_string();
    crate::commands::save_native_config(app, move |cfg| {
        cfg.settings.deck_devices.retain(|d| d.id != gone);
    })?;
    if let Some(hub) = hub(app) {
        hub.revoke(id);
    }
    publish_status(app);
    Ok(())
}

/// Keeps the cached config current and follows the on/off switch and port.
pub fn config_saved(app: &AppHandle, cfg: &AppConfig) {
    let hub = hub(app);
    if let Some(hub) = &hub {
        hub.refresh_config(cfg.clone());
        hub.touch();
    }
    let running_port = hub.map(|h| h.port);
    let wanted_port = cfg
        .settings
        .deck_enabled
        .then_some(cfg.settings.deck_port as u16);
    if running_port != wanted_port {
        let app = app.clone();
        tauri::async_runtime::spawn(sync(app));
    }
}

pub fn engine_changed(app: &AppHandle) {
    if let Some(hub) = hub(app) {
        hub.touch();
    }
}

pub fn viewers_changed(app: &AppHandle, sample: &Value) {
    let Some(hub) = hub(app) else {
        return;
    };
    if let Some(total) = sample.get("total").and_then(Value::as_u64) {
        hub.session.lock().unwrap().audience(total);
    }
    *hub.viewers.lock().unwrap() = Some(sample.clone());
    hub.touch();
}

pub fn moment_marked(app: &AppHandle, label: &str) {
    let Some(hub) = hub(app) else {
        return;
    };
    hub.observe_session();
    hub.session.lock().unwrap().mark(now_ms(), label);
    hub.touch();
}

fn chat_json(msg: &crate::chat::ChatMessage) -> Value {
    json!({
        "id": msg.id,
        "platform": msg.platform,
        "source": msg.source,
        "author": msg.author,
        "authorId": msg.author_id,
        "nativeId": msg.native_id,
        "color": msg.color,
        "text": msg.text,
        "ts": msg.ts,
        "highlight": msg.highlight,
        "system": msg.system,
    })
}

pub fn chat_message(app: &AppHandle, msg: &crate::chat::ChatMessage) {
    let Some(hub) = hub(app) else {
        return;
    };
    let value = chat_json(msg);
    {
        let mut ring = hub.chat.lock().unwrap();
        ring.push_back(value.clone());
        while ring.len() > CHAT_HISTORY {
            ring.pop_front();
        }
    }
    if hub.authed.load(Ordering::Relaxed) > 0 {
        hub.broadcast(&json!({ "type": "chat", "message": value }));
    }
}

/// Moderation removes the same lines the overlay and the desktop chat remove.
fn matches_delete(message: &Value, event: &Value) -> bool {
    let field = |v: &Value, key: &str| v.get(key).and_then(Value::as_str).map(str::to_string);
    let same_platform = field(message, "platform") == field(event, "platform");
    match event.get("scope").and_then(Value::as_str) {
        Some("message") => {
            same_platform
                && field(message, "nativeId").is_some()
                && field(message, "nativeId") == field(event, "nativeId")
        }
        Some("user") => {
            same_platform
                && field(message, "source") == field(event, "source")
                && match field(event, "authorId") {
                    Some(id) => field(message, "authorId").as_deref() == Some(id.as_str()),
                    None => field(message, "author") == field(event, "author"),
                }
        }
        Some("all") => same_platform && field(message, "source") == field(event, "source"),
        _ => false,
    }
}

pub fn chat_deleted(app: &AppHandle, event: &Value) {
    let Some(hub) = hub(app) else {
        return;
    };
    hub.chat
        .lock()
        .unwrap()
        .retain(|message| !matches_delete(message, event));
    if hub.authed.load(Ordering::Relaxed) > 0 {
        hub.broadcast(&json!({ "type": "chat-delete", "event": event }));
    }
}

pub fn alert(app: &AppHandle, alert: &crate::chat::Alert) {
    let Some(hub) = hub(app) else {
        return;
    };
    if hub.authed.load(Ordering::Relaxed) > 0 {
        hub.broadcast(&json!({ "type": "alert", "alert": {
            "kind": alert.kind,
            "platform": alert.platform,
            "user": alert.user,
            "amount": alert.amount,
            "currency": alert.currency,
            "tier": alert.tier,
        }}));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moderation_matches_the_same_lines_as_the_overlay() {
        let msg = json!({ "platform": "p", "source": "s", "author": "Ana", "authorId": "42", "nativeId": "m1" });
        assert!(matches_delete(
            &msg,
            &json!({ "scope": "message", "platform": "p", "nativeId": "m1" })
        ));
        assert!(!matches_delete(
            &msg,
            &json!({ "scope": "message", "platform": "q", "nativeId": "m1" })
        ));
        assert!(matches_delete(
            &msg,
            &json!({ "scope": "user", "platform": "p", "source": "s", "author": "x", "authorId": "42" })
        ));
        assert!(!matches_delete(
            &msg,
            &json!({ "scope": "user", "platform": "p", "source": "s", "author": "Ana", "authorId": "7" })
        ));
        assert!(matches_delete(
            &msg,
            &json!({ "scope": "user", "platform": "p", "source": "s", "author": "Ana" })
        ));
        assert!(matches_delete(
            &msg,
            &json!({ "scope": "all", "platform": "p", "source": "s" })
        ));
        assert!(!matches_delete(
            &msg,
            &json!({ "scope": "all", "platform": "p", "source": "other" })
        ));
        assert!(!matches_delete(
            &json!({ "platform": "p" }),
            &json!({ "scope": "message", "platform": "p" })
        ));
    }

    #[test]
    fn the_desktop_csp_is_replaced_on_the_deck_page() {
        let html = r#"<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src ipc:"><title>x</title></head>"#;
        let out = strip_csp_meta(html);
        assert!(!out.contains("Content-Security-Policy"));
        assert!(out.contains("<title>x</title>") && out.contains(r#"<meta charset="utf-8">"#));
    }

    #[test]
    fn client_messages_parse_by_type() {
        let pair: ClientMsg =
            serde_json::from_str(r#"{"type":"pair","token":"t","name":"n"}"#).unwrap();
        assert!(matches!(pair, ClientMsg::Pair { .. }));
        let cmd: ClientMsg =
            serde_json::from_str(r#"{"type":"cmd","id":"1","action":"mark"}"#).unwrap();
        assert!(matches!(
            cmd,
            ClientMsg::Cmd {
                args: Value::Null,
                ..
            }
        ));
        assert!(serde_json::from_str::<ClientMsg>(r#"{"type":"admin"}"#).is_err());
    }
}
