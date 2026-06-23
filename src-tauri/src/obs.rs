//! obs-websocket v5: auto-config do serviço de transmissão + coleta de stats
//! (render/encode lag, congestionamento) para o relatório pós-live.
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tungstenite::Message;

use crate::engine::ObsStats;

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

fn sha256_b64(input: &str) -> String {
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(h.finalize())
}

fn read_json(socket: &mut Socket) -> Result<Value, String> {
    loop {
        match socket.read().map_err(|e| e.to_string())? {
            Message::Text(t) => return serde_json::from_str(&t).map_err(|e| e.to_string()),
            Message::Close(_) => return Err("o OBS fechou a conexão".into()),
            _ => continue, // ping/pong/binário → ignora
        }
    }
}

fn send_json(socket: &mut Socket, v: &Value) -> Result<(), String> {
    socket
        .send(Message::Text(v.to_string()))
        .map_err(|e| e.to_string())
}

/// Conecta no obs-websocket, faz Hello→Identify (com auth SHA256 se houver senha)
/// e devolve o socket pronto para enviar requests.
fn connect_identify(host: &str, port: u16, password: &str) -> Result<Socket, String> {
    let url = format!("ws://{host}:{port}");
    let (mut socket, _resp) = tungstenite::connect(url.as_str()).map_err(|e| {
        format!(
            "não consegui conectar no obs-websocket ({url}): {e}. \
             No OBS, ative em Ferramentas → Configurações do Servidor WebSocket."
        )
    })?;

    let hello = read_json(&mut socket)?;
    let mut identify = json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": 0 } });
    if let Some(auth) = hello.get("d").and_then(|d| d.get("authentication")) {
        if password.is_empty() {
            return Err("O obs-websocket está com senha. Informe-a em Configurações → OBS.".into());
        }
        let challenge = auth.get("challenge").and_then(|v| v.as_str()).unwrap_or("");
        let salt = auth.get("salt").and_then(|v| v.as_str()).unwrap_or("");
        let secret = sha256_b64(&format!("{password}{salt}"));
        let auth_response = sha256_b64(&format!("{secret}{challenge}"));
        identify["d"]["authentication"] = Value::String(auth_response);
    }

    send_json(&mut socket, &identify)?;
    let identified = read_json(&mut socket)?;
    if identified.get("op").and_then(|v| v.as_i64()) != Some(2) {
        let _ = socket.close(None);
        return Err(format!("falha ao identificar no OBS (senha errada?): {identified}"));
    }
    Ok(socket)
}

/// Define o serviço de transmissão "personalizado" (servidor + chave).
pub fn autoconfigure(
    host: &str,
    port: u16,
    password: &str,
    server: &str,
    key: &str,
) -> Result<(), String> {
    let mut socket = connect_identify(host, port, password)?;

    let request = json!({
        "op": 6,
        "d": {
            "requestType": "SetStreamServiceSettings",
            "requestId": "corneta-1",
            "requestData": {
                "streamServiceType": "rtmp_custom",
                "streamServiceSettings": { "server": server, "key": key, "use_auth": false }
            }
        }
    });
    send_json(&mut socket, &request)?;
    let response = read_json(&mut socket)?;
    let ok = response
        .pointer("/d/requestStatus/result")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let _ = socket.close(None);

    if ok {
        Ok(())
    } else {
        Err(format!("o OBS recusou a configuração: {response}"))
    }
}

/// Liga (start=true) ou desliga a transmissão no OBS.
pub fn set_stream(host: &str, port: u16, password: &str, start: bool) -> Result<(), String> {
    let mut socket = connect_identify(host, port, password)?;
    let req_type = if start { "StartStream" } else { "StopStream" };
    send_json(
        &mut socket,
        &json!({ "op": 6, "d": { "requestType": req_type, "requestId": "corneta-stream" } }),
    )?;
    let response = read_json(&mut socket)?;
    let status = response.pointer("/d/requestStatus");
    let ok = status
        .and_then(|s| s.get("result"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let code = status
        .and_then(|s| s.get("code"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let _ = socket.close(None);
    // 604 = já transmitindo / 702 = não estava transmitindo → já está no estado desejado.
    let already = if start { 604 } else { 702 };
    if ok || code == already {
        Ok(())
    } else {
        Err(format!("o OBS recusou {req_type}: {response}"))
    }
}

/// Resultado da checagem pré-live do OBS.
#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsCheck {
    pub reachable: bool,
    pub pointing_at_corneta: bool,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Verifica se o OBS está acessível, apontando pra Corneta e em qual resolução/fps.
pub fn check(host: &str, port: u16, password: &str, expected_server: &str) -> ObsCheck {
    let mut socket = match connect_identify(host, port, password) {
        Ok(s) => s,
        Err(e) => {
            return ObsCheck { error: Some(e), ..Default::default() };
        }
    };
    let svc = request(&mut socket, "GetStreamServiceSettings", "corneta-svc").ok();
    let server = svc
        .as_ref()
        .and_then(|v| v.pointer("/streamServiceSettings/server"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let pointing = !server.is_empty() && server.trim_end_matches('/') == expected_server.trim_end_matches('/');

    let vid = request(&mut socket, "GetVideoSettings", "corneta-vid").ok();
    let g = |k: &str| vid.as_ref().and_then(|v| v.get(k)).and_then(|x| x.as_f64()).unwrap_or(0.0);
    let num = g("fpsNumerator");
    let den = g("fpsDenominator");
    let fps = if den > 0.0 { (num / den * 10.0).round() / 10.0 } else { 0.0 };
    let _ = socket.close(None);

    ObsCheck {
        reachable: true,
        pointing_at_corneta: pointing,
        width: g("outputWidth") as u32,
        height: g("outputHeight") as u32,
        fps,
        error: None,
    }
}

/// Envia um request e devolve o `responseData`.
fn request(socket: &mut Socket, req_type: &str, id: &str) -> Result<Value, String> {
    send_json(
        socket,
        &json!({ "op": 6, "d": { "requestType": req_type, "requestId": id } }),
    )?;
    let resp = read_json(socket)?;
    Ok(resp.pointer("/d/responseData").cloned().unwrap_or(Value::Null))
}

/// Coleta stats do OBS a cada ~2s enquanto `running`, chamando `on_stats`.
/// Melhor-esforço: se o OBS não estiver acessível, sai em silêncio.
pub fn poll_stats(
    host: &str,
    port: u16,
    password: &str,
    running: &Arc<AtomicBool>,
    mut on_stats: impl FnMut(ObsStats),
) {
    let mut socket = match connect_identify(host, port, password) {
        Ok(s) => s,
        Err(e) => {
            log::info!("OBS stats indisponível: {e}");
            return;
        }
    };
    // Timeout de leitura para não travar o coletor se o OBS engasgar.
    if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(5)));
    }
    log::info!("OBS stats: conectado, coletando render/encode lag");

    let num = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_f64()).unwrap_or(0.0);
    while running.load(Ordering::Relaxed) {
        let stats = request(&mut socket, "GetStats", "corneta-stats");
        let status = request(&mut socket, "GetStreamStatus", "corneta-status");
        match (stats, status) {
            (Ok(st), Ok(ss)) => on_stats(ObsStats {
                active_fps: num(&st, "activeFps"),
                avg_render_ms: num(&st, "averageFrameRenderTime"),
                render_skipped: num(&st, "renderSkippedFrames") as u32,
                output_skipped: num(&ss, "outputSkippedFrames") as u32,
                congestion: num(&ss, "outputCongestion"),
            }),
            _ => break, // erro/desconexão → encerra (best-effort)
        }
        for _ in 0..20 {
            if !running.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    let _ = socket.close(None);
}
