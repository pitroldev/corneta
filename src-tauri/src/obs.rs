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

/// Resposta de autenticação do obs-websocket v5 (pura, testável):
/// `base64(sha256( base64(sha256(password + salt)) + challenge ))`.
fn obs_auth_response(password: &str, salt: &str, challenge: &str) -> String {
    let secret = sha256_b64(&format!("{password}{salt}"));
    sha256_b64(&format!("{secret}{challenge}"))
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

    if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(8)));
        let _ = tcp.set_write_timeout(Some(Duration::from_secs(8)));
    }

    let hello = read_json(&mut socket)?;
    let mut identify = json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": 0 } });
    if let Some(auth) = hello.get("d").and_then(|d| d.get("authentication")) {
        if password.is_empty() {
            return Err("O obs-websocket está com senha. Informe-a em Configurações → OBS.".into());
        }
        let challenge = auth.get("challenge").and_then(|v| v.as_str()).unwrap_or("");
        let salt = auth.get("salt").and_then(|v| v.as_str()).unwrap_or("");
        identify["d"]["authentication"] =
            Value::String(obs_auth_response(password, salt, challenge));
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
    // 500 = OutputRunning (já transmitindo) / 501 = OutputNotRunning (não estava) → já no estado desejado.
    let already = if start { 500 } else { 501 };
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

/// Envia um request COM `requestData` e devolve a resposta inteira (pra inspecionar o status).
fn request_with(socket: &mut Socket, req_type: &str, id: &str, data: Value) -> Result<Value, String> {
    send_json(
        socket,
        &json!({ "op": 6, "d": { "requestType": req_type, "requestId": id, "requestData": data } }),
    )?;
    read_json(socket)
}

fn req_ok(resp: &Value) -> bool {
    resp.pointer("/d/requestStatus/result")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

// --------------------- Mesa: Browser Source no OBS ---------------------

/// Cria (ou atualiza) um Browser Source apontando pra `url`, na cena atual do OBS.
/// Idempotente: checa o GetInputList primeiro (sem depender de código de erro) — se o
/// input já existe, só atualiza a URL/tamanho (preserva a posição que o usuário ajustou).
pub fn add_or_update_browser_source(
    host: &str,
    port: u16,
    password: &str,
    input_name: &str,
    url: &str,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let mut socket = connect_identify(host, port, password)?;

    let settings = json!({
        "url": url,
        "width": width,
        "height": height,
        // Roteia o áudio dos convidados pela mesa de som do OBS (vai pra live).
        "reroute_audio": true,
    });

    // Já existe um input com esse nome? Nomes são GLOBAIS no OBS (entre cenas E tipos),
    // então também conferimos o tipo: se existir com OUTRO tipo, é colisão de nome.
    let list = request(&mut socket, "GetInputList", "corneta-inputs")?;
    let existing_kind = list.get("inputs").and_then(|v| v.as_array()).and_then(|arr| {
        arr.iter()
            .find(|i| i.get("inputName").and_then(|n| n.as_str()) == Some(input_name))
            .map(|i| {
                i.get("inputKind")
                    .and_then(|k| k.as_str())
                    .unwrap_or("")
                    .to_string()
            })
    });
    if let Some(kind) = &existing_kind {
        if kind != "browser_source" {
            let _ = socket.close(None);
            return Err(format!(
                "já existe uma fonte \"{input_name}\" no OBS (do tipo {kind}). Renomeie ou apague pra a Mesa usar esse nome."
            ));
        }
    }

    // Cena atual (program) — os dois ramos precisam dela.
    let scene_resp = request(&mut socket, "GetCurrentProgramScene", "corneta-scene")?;
    let scene = scene_resp
        .get("currentProgramSceneName")
        .or_else(|| scene_resp.get("sceneName"))
        .and_then(|v| v.as_str())
        .ok_or("não consegui descobrir a cena atual do OBS")?
        .to_string();

    let resp = if existing_kind.is_some() {
        // O input existe globalmente, mas o scene item é POR-CENA: pode ter sobrado de uma
        // sessão anterior em OUTRA cena. Garante que ele está na cena atual (senão a Mesa
        // "soma" — atualiza a fonte numa cena que o streamer não está usando).
        let item = request_with(
            &mut socket,
            "GetSceneItemId",
            "corneta-itemid",
            json!({ "sceneName": scene, "sourceName": input_name }),
        )?;
        let missing = item.pointer("/d/requestStatus/code").and_then(|v| v.as_u64()) == Some(600);
        if missing {
            let added = request_with(
                &mut socket,
                "CreateSceneItem",
                "corneta-additem",
                json!({ "sceneName": scene, "sourceName": input_name, "sceneItemEnabled": true }),
            )?;
            if !req_ok(&added) {
                let _ = socket.close(None);
                return Err(format!("o OBS recusou pôr a Mesa na cena atual: {added}"));
            }
        }
        request_with(
            &mut socket,
            "SetInputSettings",
            "corneta-update",
            json!({ "inputName": input_name, "inputSettings": settings, "overlay": true }),
        )?
    } else {
        request_with(
            &mut socket,
            "CreateInput",
            "corneta-create",
            json!({
                "sceneName": scene,
                "inputName": input_name,
                "inputKind": "browser_source",
                "inputSettings": settings,
                "sceneItemEnabled": true,
            }),
        )?
    };

    let _ = socket.close(None);
    if req_ok(&resp) {
        Ok(())
    } else {
        Err(format!("o OBS recusou a fonte da Mesa: {resp}"))
    }
}

/// Remove um input da Mesa (limpeza ao encerrar). Tolera "não encontrado".
pub fn remove_input(host: &str, port: u16, password: &str, input_name: &str) -> Result<(), String> {
    let mut socket = connect_identify(host, port, password)?;
    let resp = request_with(
        &mut socket,
        "RemoveInput",
        "corneta-remove",
        json!({ "inputName": input_name }),
    )?;
    let _ = socket.close(None);
    // Se já não existe, o objetivo (não estar lá) já foi alcançado.
    let not_found = resp
        .pointer("/d/requestStatus/code")
        .and_then(|v| v.as_u64())
        == Some(600);
    if req_ok(&resp) || not_found {
        Ok(())
    } else {
        Err(format!("o OBS recusou remover a fonte da Mesa: {resp}"))
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obs_auth_is_deterministic_and_input_sensitive() {
        let (p, s, c) = ("senha", "c2FsdA==", "Y2hhbGxlbmdl");
        let a = obs_auth_response(p, s, c);
        // base64 de um sha256 (32 bytes) = 44 chars com padding.
        assert_eq!(a.len(), 44);
        // determinístico.
        assert_eq!(a, obs_auth_response(p, s, c));
        // sensível a CADA entrada (senão o handshake autenticaria errado sem avisar).
        assert_ne!(a, obs_auth_response("outra", s, c));
        assert_ne!(a, obs_auth_response(p, "b3V0cm8=", c));
        assert_ne!(a, obs_auth_response(p, s, "b3V0cm8="));
    }

    #[test]
    fn obs_auth_matches_known_vector() {
        // KAT computado INDEPENDENTE (Python): fixa a ordem de concatenação + o hash do
        // handshake v5. base64(sha256( base64(sha256("senha"+"c2FsdA==")) + "Y2hhbGxlbmdl" )).
        assert_eq!(
            obs_auth_response("senha", "c2FsdA==", "Y2hhbGxlbmdl"),
            "+8Ytw+UBaCto3PZWaabX3QK0lhU/2NwTnVBbh4BAt80="
        );
    }
}
