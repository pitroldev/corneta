//! Fontes de alerta externas (Streamlabs, StreamElements) via socket de SAÍDA.
//! O app conecta no socket da plataforma com o token do streamer e recebe doações,
//! follows, subs, bits e raids — que viram `Alert` e saem no MESMO canal `alert://event`
//! que o chat já usa. Status da conexão em `alert://status`.
//!
//! Streamlabs e o realtime do StreamElements falam **Socket.IO** (engine.io v3) sobre WS.
//! Não é WS cru: tem handshake (`0{…}` open → `40` connect) e framing (`42["event",{…}]`),
//! além de ping/pong (`2`/`3`). Implementado na mão sobre `tungstenite`, no mesmo estilo
//! "protocolo na unha" que o chat.rs já usa pra IRC/Pusher.

use serde_json::{json, Value};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

use crate::chat::{emit_alert, Alert};
use crate::AppState;

#[derive(Default)]
pub struct AlertRuntime {
    pub running: Arc<AtomicBool>,
}

static AID: AtomicU64 = AtomicU64::new(1);
fn next_id(prefix: &str) -> String {
    format!("{prefix}{}", AID.fetch_add(1, Ordering::Relaxed))
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
/// Número que pode vir como número OU string (ex.: "10.00"); aceita vírgula decimal.
fn num(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_str().and_then(|s| s.trim().replace(',', ".").parse().ok()))
}
fn alert_status(app: &AppHandle, source: &str, status: &str) {
    let _ = app.emit("alert://status", json!({ "source": source, "status": status }));
}

// ----------------------------- Controle ----------------------------

/// (Re)inicia os conectores de alerta com base nas fontes configuradas (token no keyring).
pub fn start_alerts(app: &AppHandle) {
    let s = crate::config::load(app).settings;
    let running = {
        let st = app.state::<AppState>();
        let mut a = st.alerts.lock().unwrap();
        a.running.store(false, Ordering::Relaxed);
        let running = Arc::new(AtomicBool::new(true));
        a.running = running.clone();
        running
    };

    for src in s.alert_sources.iter().filter(|x| x.enabled) {
        // Token NUNCA fica no config — só no keyring, sob a chave `alert_<id>`.
        let token = match crate::keys::get_key(&format!("alert_{}", src.id)) {
            Some(t) if !t.trim().is_empty() => t,
            _ => continue, // sem token → não conecta
        };
        let label = if src.name.trim().is_empty() {
            src.kind.clone()
        } else {
            src.name.clone()
        };
        let (app2, run2, kind) = (app.clone(), running.clone(), src.kind.clone());
        tauri::async_runtime::spawn_blocking(move || {
            // Backoff exponencial: 3s → 6 → 12 → … → 60s; volta ao mínimo quando conecta.
            let mut backoff = Duration::from_secs(3);
            while run2.load(Ordering::Relaxed) {
                let r = match kind.as_str() {
                    "streamlabs" => run_streamlabs(&token, &label, run2.clone(), app2.clone()),
                    "streamelements" => run_streamelements(&token, &label, run2.clone(), app2.clone()),
                    _ => return,
                };
                backoff = match r {
                    ConnResult::Connected => Duration::from_secs(3), // conectou → zera
                    ConnResult::AuthFailed => BACKOFF_MAX, // token inválido → teto direto
                    ConnResult::Failed => backoff,
                };
                reconnect_wait(&run2, backoff); // caiu/erro → espera o backoff e tenta de novo
                if !matches!(r, ConnResult::Connected) {
                    backoff = (backoff * 2).min(BACKOFF_MAX); // dobra pra próxima falha
                }
            }
        });
    }
}

pub fn stop_alerts(app: &AppHandle) {
    let st = app.state::<AppState>();
    st.alerts.lock().unwrap().running.store(false, Ordering::Relaxed);
}

/// Teto do backoff de reconexão.
const BACKOFF_MAX: Duration = Duration::from_secs(60);

/// Resultado de uma tentativa de conexão — orienta o backoff da reconexão.
enum ConnResult {
    /// Chegou a conectar (recebeu o `40`) — backoff volta ao mínimo.
    Connected,
    /// Falha transitória (rede, queda) — backoff dobra até o teto.
    Failed,
    /// Handshake recusado com 401/403 (token inválido/revogado) — teto direto.
    AuthFailed,
}

/// Espera `dur` antes de reconectar, abortando cedo se os alertas foram parados.
fn reconnect_wait(running: &AtomicBool, dur: Duration) {
    let mut left = dur;
    while left > Duration::ZERO {
        if !running.load(Ordering::Relaxed) {
            return;
        }
        let step = left.min(Duration::from_millis(200));
        thread::sleep(step);
        left -= step;
    }
}

// ----------------------------- Conectores --------------------------

fn run_streamlabs(token: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) -> ConnResult {
    // O Streamlabs autentica pelo token na query — sem emit de auth depois do connect.
    let url = format!(
        "wss://sockets.streamlabs.com/socket.io/?token={token}&EIO=3&transport=websocket"
    );
    let src = source.to_string();
    run_socketio(&url, source, None, running, app, move |app, name, data| {
        if name == "event" {
            if let Some(a) = parse_streamlabs(&src, data) {
                emit_alert(app, a);
            }
        }
    })
}

fn run_streamelements(token: &str, source: &str, running: Arc<AtomicBool>, app: AppHandle) -> ConnResult {
    // O realtime do SE precisa de um emit de autenticação com o JWT depois do connect.
    let url = "wss://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket";
    let auth = format!("42[\"authenticate\",{}]", json!({ "method": "jwt", "token": token }));
    let src = source.to_string();
    run_socketio(url, source, Some(auth), running, app, move |app, name, data| {
        // `event` (real) e `event:test` (o botão "testar" do dashboard) — os dois mostram.
        if name == "event" || name == "event:test" {
            if let Some(a) = parse_streamelements(&src, data) {
                emit_alert(app, a);
            }
        }
    })
}

// ----------------------------- Mapeamento --------------------------

/// Streamlabs: `{ type, message: [ { name, amount, currency, message, months, sub_plan, viewers… } ] }`.
fn parse_streamlabs(source: &str, data: &Value) -> Option<Alert> {
    let typ = data.get("type")?.as_str()?;
    let m = data
        .get("message")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(Value::Null);
    let user = m
        .get("name")
        .and_then(|x| x.as_str())
        .or_else(|| m.get("from").and_then(|x| x.as_str()))
        .unwrap_or("alguém")
        .to_string();
    let message = m
        .get("message")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    let (kind, amount, currency, tier) = match typ {
        "donation" => (
            "tip",
            m.get("amount").and_then(num),
            m.get("currency").and_then(|x| x.as_str()).map(String::from),
            None,
        ),
        "follow" => ("follow", None, None, None),
        "subscription" | "resub" => {
            let months = m.get("months").and_then(num);
            let kind = if months.unwrap_or(1.0) > 1.0 { "resub" } else { "sub" };
            (kind, months, None, m.get("sub_plan").and_then(|x| x.as_str()).map(String::from))
        }
        "bits" => ("bits", m.get("amount").and_then(num), None, None),
        "host" | "raid" => (
            "raid",
            m.get("viewers").and_then(num).or_else(|| m.get("raiders").and_then(num)),
            None,
            None,
        ),
        _ => return None,
    };
    Some(Alert {
        id: next_id("sl"),
        platform: "streamlabs".into(),
        source: source.into(),
        kind: kind.into(),
        user,
        amount,
        currency,
        tier,
        message,
        fragments: Vec::new(),
        ts: now_ms(),
    })
}

/// StreamElements: `{ type, data: { username|displayName, amount, currency, message, tier… } }`.
fn parse_streamelements(source: &str, ev: &Value) -> Option<Alert> {
    let typ = ev.get("type")?.as_str()?;
    let d = ev.get("data").cloned().unwrap_or(Value::Null);
    let user = d
        .get("displayName")
        .and_then(|x| x.as_str())
        .or_else(|| d.get("username").and_then(|x| x.as_str()))
        .unwrap_or("alguém")
        .to_string();
    let message = d
        .get("message")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    let (kind, amount, currency, tier) = match typ {
        "tip" => (
            "tip",
            d.get("amount").and_then(num),
            d.get("currency").and_then(|x| x.as_str()).map(String::from),
            None,
        ),
        "cheer" => ("bits", d.get("amount").and_then(num), None, None),
        "follow" => ("follow", None, None, None),
        "subscriber" => {
            let months = d.get("amount").and_then(num);
            let kind = if months.unwrap_or(1.0) > 1.0 { "resub" } else { "sub" };
            (kind, months, None, d.get("tier").and_then(|x| x.as_str()).map(String::from))
        }
        "raid" | "host" => ("raid", d.get("amount").and_then(num), None, None),
        _ => return None,
    };
    Some(Alert {
        id: next_id("se"),
        platform: "streamelements".into(),
        source: source.into(),
        kind: kind.into(),
        user,
        amount,
        currency,
        tier,
        message,
        fragments: Vec::new(),
        ts: now_ms(),
    })
}

// ----------------------------- Socket.IO (engine.io v3) ------------

fn set_read_timeout(socket: &mut WebSocket<MaybeTlsStream<TcpStream>>, ms: u64) {
    match socket.get_mut() {
        MaybeTlsStream::Rustls(s) => {
            let _ = s.sock.set_read_timeout(Some(Duration::from_millis(ms)));
        }
        MaybeTlsStream::Plain(tcp) => {
            let _ = tcp.set_read_timeout(Some(Duration::from_millis(ms)));
        }
        _ => {}
    }
}

/// Conecta no endpoint Socket.IO, faz o handshake e chama `on_event(app, nome, dados)` pra
/// cada `42["nome", dados]`. `auth` (opcional) é um frame `42[…]` enviado após o connect.
fn run_socketio<F>(
    url: &str,
    source: &str,
    auth: Option<String>,
    running: Arc<AtomicBool>,
    app: AppHandle,
    mut on_event: F,
) -> ConnResult
where
    F: FnMut(&AppHandle, &str, &Value),
{
    // NUNCA logar o erro cru do connect: o Display pode embutir a URL inteira —
    // que no Streamlabs carrega `?token=<segredo>` — e o log é persistido em arquivo.
    let mut socket = match tungstenite::connect(url) {
        Ok((s, _)) => s,
        Err(tungstenite::Error::Http(resp)) if matches!(resp.status().as_u16(), 401 | 403) => {
            // Token revogado/expirado: erro permanente — UI mostra e o backoff vai pro teto.
            log::warn!(
                "alerta ({source}): handshake recusado (HTTP {}) — token inválido/expirado",
                resp.status().as_u16()
            );
            alert_status(&app, source, "token inválido");
            return ConnResult::AuthFailed;
        }
        Err(e) => {
            // Descrição segura do erro (sem URL/query string).
            let desc = match &e {
                tungstenite::Error::Io(io) => io.kind().to_string(),
                tungstenite::Error::Http(r) => format!("HTTP {}", r.status().as_u16()),
                _ => "handshake".into(),
            };
            log::warn!("alerta ({source}): falha ao conectar ({desc})");
            alert_status(&app, source, "error");
            return ConnResult::Failed;
        }
    };
    set_read_timeout(&mut socket, 400);

    let mut ping_every = Duration::from_secs(20);
    let mut ping_grace = Duration::from_secs(20); // pingTimeout do handshake
    let mut last_ping = Instant::now();
    let mut last_pong = Instant::now(); // último sinal de vida do servidor
    let mut connected = false;

    while running.load(Ordering::Relaxed) {
        // engine.io v3: o cliente manda ping ("2") no intervalo; o servidor responde "3".
        if last_ping.elapsed() >= ping_every {
            let _ = socket.send(Message::Text("2".into()));
            last_ping = Instant::now();
        }
        // Rede caiu em silêncio (sem FIN/RST): read() só dá WouldBlock e o ping some no
        // buffer TCP sem erro — servidor mudo além do prazo → cai pro caminho de reconexão.
        if last_pong.elapsed() > ping_every + ping_grace {
            log::warn!("alerta ({source}): servidor sem responder — reconectando");
            break;
        }
        match socket.read() {
            Ok(Message::Text(t)) => {
                last_pong = Instant::now(); // qualquer frame conta como sinal de vida
                let t = t.as_str();
                if let Some(start) = t.strip_prefix("42").and(t.find('[')) {
                    // EVENT: ["nome", dados?]
                    if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&t[start..]) {
                        let name = arr.first().and_then(|x| x.as_str()).unwrap_or("");
                        let data = arr.get(1).cloned().unwrap_or(Value::Null);
                        on_event(&app, name, &data);
                    }
                } else if t.starts_with("40") {
                    // CONNECT ok → emite status e (se houver) autentica.
                    if !connected {
                        alert_status(&app, source, "connected");
                        connected = true;
                    }
                    if let Some(a) = &auth {
                        let _ = socket.send(Message::Text(a.clone().into()));
                    }
                } else if t.starts_with('0') {
                    // OPEN: lê pingInterval/pingTimeout e dispara o connect do namespace padrão.
                    if let Ok(v) = serde_json::from_str::<Value>(&t[1..]) {
                        if let Some(pi) = v.get("pingInterval").and_then(|x| x.as_u64()) {
                            ping_every = Duration::from_millis(pi.clamp(5000, 25000));
                        }
                        if let Some(pt) = v.get("pingTimeout").and_then(|x| x.as_u64()) {
                            ping_grace = Duration::from_millis(pt.clamp(5000, 60000));
                        }
                    }
                    let _ = socket.send(Message::Text("40".into()));
                } else if t == "2" {
                    // ping do servidor (engine.io v4) → pong
                    let _ = socket.send(Message::Text("3".into()));
                }
                // "3" (pong) já contou como sinal de vida acima;
                // "41"/"44" (disconnect/erro de namespace) → ignora
            }
            Ok(Message::Ping(p)) => {
                last_pong = Instant::now();
                let _ = socket.send(Message::Pong(p));
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {
                last_pong = Instant::now(); // pong WS/binário também contam
            }
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
    alert_status(&app, source, "disconnected");
    // Conectou de verdade nesta tentativa? → o chamador zera o backoff.
    if connected { ConnResult::Connected } else { ConnResult::Failed }
}

// ----------------------------- Teste de token (sob demanda) --------
// UMA tentativa de conexão pra dizer "esse token presta?" sem ligar o motor persistente.
// Streamlabs: o token vai na URL → handshake 401/403 = inválido, `40` = ok.
// StreamElements: conecta mesmo com JWT podre; a verdade vem no `authenticate` (evento
// `authenticated` = ok, `unauthorized` = inválido) → por isso o probe ESPERA esse evento.

/// Testa um token de alerta. Ok(()) = válido/conectou; Err(motivo) = inválido ou falha de rede.
pub fn probe_alert(kind: &str, token: &str) -> Result<(), String> {
    match kind {
        "streamlabs" => probe_socketio(
            &format!("wss://sockets.streamlabs.com/socket.io/?token={token}&EIO=3&transport=websocket"),
            None,
        ),
        "streamelements" => probe_socketio(
            "wss://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket",
            Some(format!("42[\"authenticate\",{}]", json!({ "method": "jwt", "token": token }))),
        ),
        _ => Err("fonte de alerta desconhecida".into()),
    }
}

/// Uma tentativa de handshake Socket.IO. Sem `auth` (Streamlabs): `40` já confirma o token.
/// Com `auth` (StreamElements): manda o frame e espera `authenticated`/`unauthorized`. Deadline 10s.
fn probe_socketio(url: &str, auth: Option<String>) -> Result<(), String> {
    let mut socket = match tungstenite::connect(url) {
        Ok((s, _)) => s,
        Err(tungstenite::Error::Http(resp)) if matches!(resp.status().as_u16(), 401 | 403) => {
            return Err("token inválido ou expirado".into());
        }
        Err(tungstenite::Error::Io(io)) => return Err(format!("sem conexão ({})", io.kind())),
        Err(_) => return Err("não consegui conectar".into()),
    };
    set_read_timeout(&mut socket, 400);
    let deadline = Instant::now() + Duration::from_secs(10);
    let waits_auth = auth.is_some();
    let mut sent_auth = false;
    while Instant::now() < deadline {
        match socket.read() {
            Ok(Message::Text(t)) => {
                let t = t.as_str();
                if let Some(start) = t.strip_prefix("42").and(t.find('[')) {
                    if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&t[start..]) {
                        match arr.first().and_then(|x| x.as_str()).unwrap_or("") {
                            "authenticated" => {
                                let _ = socket.close(None);
                                return Ok(());
                            }
                            "unauthorized" => {
                                let _ = socket.close(None);
                                return Err("token inválido ou expirado".into());
                            }
                            _ => {}
                        }
                    }
                } else if t.starts_with("40") {
                    match &auth {
                        // StreamElements: conectou — agora autentica e aguarda a resposta.
                        Some(a) if !sent_auth => {
                            let _ = socket.send(Message::Text(a.clone().into()));
                            sent_auth = true;
                        }
                        // Streamlabs: conectar já valida (o token estava na URL).
                        None => {
                            let _ = socket.close(None);
                            return Ok(());
                        }
                        _ => {}
                    }
                } else if t.starts_with('0') {
                    let _ = socket.send(Message::Text("40".into()));
                } else if t == "2" {
                    let _ = socket.send(Message::Text("3".into()));
                }
            }
            Ok(Message::Ping(p)) => {
                let _ = socket.send(Message::Pong(p));
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
    if waits_auth && sent_auth {
        Err("o StreamElements não confirmou a tempo — tente de novo".into())
    } else {
        Err("sem resposta a tempo — tente de novo".into())
    }
}
