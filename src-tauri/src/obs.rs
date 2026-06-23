//! Auto-configuração do OBS via obs-websocket v5 (define servidor + chave de transmissão).
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tungstenite::Message;

fn sha256_b64(input: &str) -> String {
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(h.finalize())
}

fn read_json<S: std::io::Read + std::io::Write>(
    socket: &mut tungstenite::WebSocket<S>,
) -> Result<Value, String> {
    loop {
        match socket.read().map_err(|e| e.to_string())? {
            Message::Text(t) => return serde_json::from_str(&t).map_err(|e| e.to_string()),
            Message::Close(_) => return Err("o OBS fechou a conexão".into()),
            _ => continue, // ping/pong/binário → ignora
        }
    }
}

fn send_json<S: std::io::Read + std::io::Write>(
    socket: &mut tungstenite::WebSocket<S>,
    v: &Value,
) -> Result<(), String> {
    socket
        .send(Message::Text(v.to_string()))
        .map_err(|e| e.to_string())
}

/// Conecta no obs-websocket e define o serviço de transmissão "personalizado".
pub fn autoconfigure(
    host: &str,
    port: u16,
    password: &str,
    server: &str,
    key: &str,
) -> Result<(), String> {
    let url = format!("ws://{host}:{port}");
    let (mut socket, _resp) = tungstenite::connect(url.as_str()).map_err(|e| {
        format!(
            "não consegui conectar no obs-websocket ({url}): {e}. \
             No OBS, ative em Ferramentas → Configurações do Servidor WebSocket."
        )
    })?;

    // 1) Hello (op 0) — pode trazer um desafio de autenticação.
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

    // 2) Identify (op 1) → 3) Identified (op 2)
    send_json(&mut socket, &identify)?;
    let identified = read_json(&mut socket)?;
    if identified.get("op").and_then(|v| v.as_i64()) != Some(2) {
        let _ = socket.close(None);
        return Err(format!(
            "falha ao identificar no OBS (senha errada?). Resposta: {identified}"
        ));
    }

    // 4) Request SetStreamServiceSettings (op 6)
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

    // 5) RequestResponse (op 7)
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
