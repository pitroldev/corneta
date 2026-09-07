//! obs-websocket v5 configuration and post-stream render/encode statistics.
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tungstenite::Message;

use crate::engine::ObsStats;
use crate::i18n::Msg;

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

fn sha256_b64(input: &str) -> String {
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(h.finalize())
}

/// Authentication: base64(sha256(base64(sha256(password + salt)) + challenge)).
fn obs_auth_response(password: &str, salt: &str, challenge: &str) -> String {
    let secret = sha256_b64(&format!("{password}{salt}"));
    sha256_b64(&format!("{secret}{challenge}"))
}

fn read_json(socket: &mut Socket) -> Result<Value, String> {
    loop {
        match socket.read().map_err(|e| e.to_string())? {
            Message::Text(t) => return serde_json::from_str(&t).map_err(|e| e.to_string()),
            Message::Close(_) => return Err(Msg::ObsConnectionClosed.now()),
            _ => continue,
        }
    }
}

fn send_json(socket: &mut Socket, v: &Value) -> Result<(), String> {
    socket
        .send(Message::Text(v.to_string().into()))
        .map_err(|e| e.to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ConnFailure {
    Connect,
    Exchange,
    PasswordRequired,
    Identification,
}

impl ConnFailure {
    fn code(self) -> &'static str {
        match self {
            Self::Connect => "connection_failed",
            Self::Exchange => "exchange_failed",
            Self::PasswordRequired => "password_required",
            Self::Identification => "identification_failed",
        }
    }

    fn is_auth(self) -> bool {
        matches!(self, Self::PasswordRequired | Self::Identification)
    }
}

// Display is diagnostic-only; IPC conversion preserves the localized message.
struct ConnErr {
    failure: ConnFailure,
    msg: String,
}

impl From<String> for ConnErr {
    fn from(msg: String) -> Self {
        Self {
            failure: ConnFailure::Exchange,
            msg,
        }
    }
}

impl From<ConnErr> for String {
    fn from(e: ConnErr) -> Self {
        e.msg
    }
}

impl std::fmt::Display for ConnErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.failure.code())
    }
}

fn connect_identify(host: &str, port: u16, password: &str) -> Result<Socket, ConnErr> {
    let url = format!("ws://{host}:{port}");
    let (mut socket, _resp) = tungstenite::connect(url.as_str()).map_err(|e| ConnErr {
        failure: ConnFailure::Connect,
        msg: Msg::ObsConnectFailed {
            url: &url,
            e: &e.to_string(),
        }
        .now(),
    })?;

    if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(8)));
        let _ = tcp.set_write_timeout(Some(Duration::from_secs(8)));
    }

    let hello = read_json(&mut socket)?;
    let mut identify = json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": 0 } });
    if let Some(auth) = hello.get("d").and_then(|d| d.get("authentication")) {
        if password.is_empty() {
            return Err(ConnErr {
                failure: ConnFailure::PasswordRequired,
                msg: Msg::ObsPasswordRequired.now(),
            });
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
        return Err(ConnErr {
            failure: ConnFailure::Identification,
            msg: Msg::ObsIdentifyFailed {
                identified: &identified.to_string(),
            }
            .now(),
        });
    }
    Ok(socket)
}

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
        Err(Msg::ObsRefusedConfig {
            response: &response.to_string(),
        }
        .now())
    }
}

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
    // OutputRunning (500) and OutputNotRunning (501) acknowledge an already satisfied request.
    let already = if start { 500 } else { 501 };
    if ok || code == already {
        Ok(())
    } else {
        Err(Msg::ObsRefusedRequest {
            req_type,
            response: &response.to_string(),
        }
        .now())
    }
}

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
    /// Distinguish authentication failure from an unreachable OBS without parsing translated text.
    #[serde(default)]
    pub auth_failed: bool,
}

pub fn check(host: &str, port: u16, password: &str, expected_server: &str) -> ObsCheck {
    let mut socket = match connect_identify(host, port, password) {
        Ok(s) => s,
        Err(e) => {
            return ObsCheck {
                auth_failed: e.failure.is_auth(),
                error: Some(e.msg),
                ..Default::default()
            };
        }
    };
    let svc = request(&mut socket, "GetStreamServiceSettings", "corneta-svc").ok();
    let server = svc
        .as_ref()
        .and_then(|v| v.pointer("/streamServiceSettings/server"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let pointing =
        !server.is_empty() && server.trim_end_matches('/') == expected_server.trim_end_matches('/');

    let vid = request(&mut socket, "GetVideoSettings", "corneta-vid").ok();
    let g = |k: &str| {
        vid.as_ref()
            .and_then(|v| v.get(k))
            .and_then(|x| x.as_f64())
            .unwrap_or(0.0)
    };
    let num = g("fpsNumerator");
    let den = g("fpsDenominator");
    let fps = if den > 0.0 {
        (num / den * 10.0).round() / 10.0
    } else {
        0.0
    };
    let _ = socket.close(None);

    ObsCheck {
        reachable: true,
        pointing_at_corneta: pointing,
        width: g("outputWidth") as u32,
        height: g("outputHeight") as u32,
        fps,
        error: None,
        auth_failed: false,
    }
}

fn request(socket: &mut Socket, req_type: &str, id: &str) -> Result<Value, String> {
    send_json(
        socket,
        &json!({ "op": 6, "d": { "requestType": req_type, "requestId": id } }),
    )?;
    let resp = read_json(socket)?;
    Ok(resp
        .pointer("/d/responseData")
        .cloned()
        .unwrap_or(Value::Null))
}

fn request_with(
    socket: &mut Socket,
    req_type: &str,
    id: &str,
    data: Value,
) -> Result<Value, String> {
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

/// Updating an existing source preserves its user-adjusted position.
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
        // Route guest audio through OBS's mixer so it reaches the stream.
        "reroute_audio": true,
    });

    // OBS input names are global across scenes and types; reject collisions with non-browser inputs.
    let list = request(&mut socket, "GetInputList", "corneta-inputs")?;
    let existing_kind = list
        .get("inputs")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
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
            return Err(Msg::ObsSourceNameTaken { input_name, kind }.now());
        }
    }

    let scene_resp = request(&mut socket, "GetCurrentProgramScene", "corneta-scene")?;
    let scene = scene_resp
        .get("currentProgramSceneName")
        .or_else(|| scene_resp.get("sceneName"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| Msg::ObsCurrentSceneUnknown.now())?
        .to_string();

    let resp = if existing_kind.is_some() {
        // Inputs are global but scene items are not; attach an existing input to the current scene.
        let item = request_with(
            &mut socket,
            "GetSceneItemId",
            "corneta-itemid",
            json!({ "sceneName": scene, "sourceName": input_name }),
        )?;
        let missing = item
            .pointer("/d/requestStatus/code")
            .and_then(|v| v.as_u64())
            == Some(600);
        if missing {
            let added = request_with(
                &mut socket,
                "CreateSceneItem",
                "corneta-additem",
                json!({ "sceneName": scene, "sourceName": input_name, "sceneItemEnabled": true }),
            )?;
            if !req_ok(&added) {
                let _ = socket.close(None);
                return Err(Msg::ObsRefusedSceneItem {
                    added: &added.to_string(),
                }
                .now());
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
        Err(Msg::ObsRefusedSource {
            resp: &resp.to_string(),
        }
        .now())
    }
}

/// Removing a Mesa input is idempotent when it is already missing.
pub fn remove_input(host: &str, port: u16, password: &str, input_name: &str) -> Result<(), String> {
    let mut socket = connect_identify(host, port, password)?;
    let resp = request_with(
        &mut socket,
        "RemoveInput",
        "corneta-remove",
        json!({ "inputName": input_name }),
    )?;
    let _ = socket.close(None);
    let not_found = resp
        .pointer("/d/requestStatus/code")
        .and_then(|v| v.as_u64())
        == Some(600);
    if req_ok(&resp) || not_found {
        Ok(())
    } else {
        Err(Msg::ObsRefusedRemoveSource {
            resp: &resp.to_string(),
        }
        .now())
    }
}

/// Stats are best-effort; unavailable OBS must not interrupt streaming.
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
            log::info!("OBS stats unavailable: {e}");
            return;
        }
    };
    // Bound reads so stalled OBS cannot retain the polling worker indefinitely.
    if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
        let _ = tcp.set_read_timeout(Some(Duration::from_secs(5)));
    }
    log::info!("OBS stats: connected; collecting render and encode lag");

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
            _ => break,
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
    fn connection_diagnostics_and_ipc_messages_have_separate_contracts() {
        for locale in [crate::i18n::Locale::PtBr, crate::i18n::Locale::En] {
            for (failure, message, code, auth) in [
                (
                    ConnFailure::Connect,
                    Msg::ObsConnectFailed {
                        url: "ws://private-fixture.invalid:4455",
                        e: "private-fixture",
                    },
                    "connection_failed",
                    false,
                ),
                (
                    ConnFailure::PasswordRequired,
                    Msg::ObsPasswordRequired,
                    "password_required",
                    true,
                ),
                (
                    ConnFailure::Identification,
                    Msg::ObsIdentifyFailed {
                        identified: "private-fixture",
                    },
                    "identification_failed",
                    true,
                ),
            ] {
                let text = message.text(locale);
                let error = ConnErr {
                    failure,
                    msg: text.clone(),
                };
                assert_eq!(error.to_string(), code);
                assert_eq!(error.failure.is_auth(), auth);
                assert!(!error.to_string().contains("private-fixture"));
                assert_eq!(String::from(error), text);
            }
            let text = Msg::ObsConnectionClosed.text(locale);
            let error = ConnErr::from(text.clone());
            assert_eq!(error.to_string(), "exchange_failed");
            assert!(!error.failure.is_auth());
            assert_eq!(String::from(error), text);
        }
    }

    #[test]
    fn provider_exchange_text_cannot_enter_connection_diagnostics() {
        let private = "falha privada https://example.invalid/private-fixture";
        let error = ConnErr::from(private.to_string());
        assert_eq!(
            format!("OBS stats unavailable: {error}"),
            "OBS stats unavailable: exchange_failed"
        );
        assert_eq!(String::from(error), private);
    }

    #[test]
    fn obs_auth_is_deterministic_and_input_sensitive() {
        let (p, s, c) = ("senha", "c2FsdA==", "Y2hhbGxlbmdl");
        let a = obs_auth_response(p, s, c);
        assert_eq!(a.len(), 44);
        assert_eq!(a, obs_auth_response(p, s, c));
        assert_ne!(a, obs_auth_response("outra", s, c));
        assert_ne!(a, obs_auth_response(p, "b3V0cm8=", c));
        assert_ne!(a, obs_auth_response(p, s, "b3V0cm8="));
    }

    #[test]
    fn obs_auth_matches_known_vector() {
        // Independently computed known-answer vector verifies the v5 hash and concatenation order.
        assert_eq!(
            obs_auth_response("senha", "c2FsdA==", "Y2hhbGxlbmdl"),
            "+8Ytw+UBaCto3PZWaabX3QK0lhU/2NwTnVBbh4BAt80="
        );
    }
}
