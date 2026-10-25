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

/// obs-websocket v5 rejects an Identify by closing the socket; 4009 means a wrong password.
fn read_identified(socket: &mut Socket) -> Result<Value, ConnErr> {
    loop {
        match socket.read().map_err(|e| ConnErr::from(e.to_string()))? {
            Message::Text(t) => {
                return serde_json::from_str(&t).map_err(|e| ConnErr::from(e.to_string()))
            }
            Message::Close(Some(frame)) if u16::from(frame.code) == 4009 => {
                return Err(ConnErr {
                    failure: ConnFailure::AuthenticationFailed,
                    msg: Msg::ObsPasswordRejected.now(),
                })
            }
            Message::Close(_) => return Err(ConnErr::from(Msg::ObsConnectionClosed.now())),
            _ => continue,
        }
    }
}

fn send_json(socket: &mut Socket, v: &Value) -> Result<(), String> {
    socket
        .send(Message::Text(v.to_string().into()))
        .map_err(|e| e.to_string())
}

/// Stable failure kinds; the UI classifies OBS errors by these, never by translated text.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub enum ConnFailure {
    #[serde(rename = "connectionFailed")]
    Connect,
    #[serde(rename = "exchangeFailed")]
    Exchange,
    #[serde(rename = "passwordRequired")]
    PasswordRequired,
    #[serde(rename = "authenticationFailed")]
    AuthenticationFailed,
    #[serde(rename = "identificationFailed")]
    Identification,
    #[serde(rename = "requestRefused")]
    RequestRefused,
}

impl ConnFailure {
    fn code(self) -> &'static str {
        match self {
            Self::Connect => "connection_failed",
            Self::Exchange => "exchange_failed",
            Self::PasswordRequired => "password_required",
            Self::AuthenticationFailed => "authentication_failed",
            Self::Identification => "identification_failed",
            Self::RequestRefused => "request_refused",
        }
    }

    fn is_auth(self) -> bool {
        matches!(
            self,
            Self::PasswordRequired | Self::AuthenticationFailed | Self::Identification
        )
    }
}

/// IPC error for OBS actions: the stable code plus the localized message.
#[derive(Debug, serde::Serialize)]
pub struct ObsFailure {
    pub code: ConnFailure,
    pub message: String,
}

impl ObsFailure {
    pub fn exchange(message: String) -> Self {
        Self {
            code: ConnFailure::Exchange,
            message,
        }
    }
}

impl From<ConnErr> for ObsFailure {
    fn from(e: ConnErr) -> Self {
        Self {
            code: e.failure,
            message: e.msg,
        }
    }
}

// Display is diagnostic-only; IPC conversion preserves the localized message.
pub(crate) struct ConnErr {
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
    connect_with_events(host, port, password, 0)
}

fn connect_with_events(
    host: &str,
    port: u16,
    password: &str,
    events: u32,
) -> Result<Socket, ConnErr> {
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
    let mut identify = json!({ "op": 1, "d": { "rpcVersion": 1, "eventSubscriptions": events } });
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
    let identified = read_identified(&mut socket)?;
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
) -> Result<(), ConnErr> {
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
        Err(ConnErr {
            failure: ConnFailure::RequestRefused,
            msg: Msg::ObsRefusedConfig {
                response: &response.to_string(),
            }
            .now(),
        })
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<ConnFailure>,
}

pub fn check(host: &str, port: u16, password: &str, expected_server: &str) -> ObsCheck {
    let mut socket = match connect_identify(host, port, password) {
        Ok(s) => s,
        Err(e) => {
            return ObsCheck {
                auth_failed: e.failure.is_auth(),
                error_code: Some(e.failure),
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
        error_code: None,
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

/// OBS's output video, plus the stream bitrate when the simple output mode exposes it.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsVideo {
    pub output_width: u32,
    pub output_height: u32,
    pub fps_numerator: u32,
    pub fps_denominator: u32,
    /// The advanced output mode keeps the bitrate where obs-websocket cannot reach it.
    pub simple_kbps: Option<u32>,
}

impl ObsVideo {
    pub fn signal(&self) -> crate::engine::SourceSignal {
        crate::engine::SourceSignal {
            width: self.output_width,
            height: self.output_height,
            fps: f64::from(self.fps_numerator) / f64::from(self.fps_denominator.max(1)),
            video_kbps: self.simple_kbps,
        }
    }
}

/// obs-websocket's OutputRunning status: video settings are locked while streaming or recording.
const OUTPUT_RUNNING: i64 = 500;

fn checked(resp: Value, req_type: &str) -> Result<Value, ConnErr> {
    if req_ok(&resp) {
        return Ok(resp
            .pointer("/d/responseData")
            .cloned()
            .unwrap_or(Value::Null));
    }
    let status = resp
        .pointer("/d/requestStatus")
        .cloned()
        .unwrap_or(Value::Null);
    Err(ConnErr {
        failure: ConnFailure::RequestRefused,
        msg: if status.get("code").and_then(Value::as_i64) == Some(OUTPUT_RUNNING) {
            Msg::ObsVideoOutputActive.now()
        } else {
            Msg::ObsRefusedRequest {
                req_type,
                response: &status.to_string(),
            }
            .now()
        },
    })
}

fn profile_parameter(socket: &mut Socket, category: &str, name: &str) -> Result<Value, ConnErr> {
    let resp = request_with(
        socket,
        "GetProfileParameter",
        "corneta-profile",
        json!({ "parameterCategory": category, "parameterName": name }),
    )?;
    checked(resp, "GetProfileParameter")
}

/// An unset profile parameter falls back to OBS's default value.
fn profile_value(v: &Value) -> Option<&str> {
    v.get("parameterValue")
        .and_then(Value::as_str)
        .or_else(|| v.get("defaultParameterValue").and_then(Value::as_str))
        .map(str::trim)
}

fn parse_obs_video(video: &Value, mode: &Value, bitrate: &Value) -> Option<ObsVideo> {
    let number = |key: &str| {
        video
            .get(key)?
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .filter(|n| *n > 0)
    };
    let simple = profile_value(mode) == Some("Simple");
    Some(ObsVideo {
        output_width: number("outputWidth")?,
        output_height: number("outputHeight")?,
        fps_numerator: number("fpsNumerator")?,
        fps_denominator: number("fpsDenominator")?,
        simple_kbps: if simple {
            profile_value(bitrate).and_then(|kbps| kbps.parse().ok())
        } else {
            None
        },
    })
}

pub fn read_video(host: &str, port: u16, password: &str) -> Result<ObsVideo, ConnErr> {
    let mut socket = connect_identify(host, port, password)?;
    let result = (|| {
        let video = checked(
            request_with(&mut socket, "GetVideoSettings", "corneta-video", json!({}))?,
            "GetVideoSettings",
        )?;
        let mode = profile_parameter(&mut socket, "Output", "Mode")?;
        let bitrate = profile_parameter(&mut socket, "SimpleOutput", "VBitrate")?;
        parse_obs_video(&video, &mode, &bitrate)
            .ok_or_else(|| ConnErr::from(Msg::ObsVideoUnreadable.now()))
    })();
    let _ = socket.close(None);
    result
}

/// Writes only the output (scaled) resolution, the frame rate and, in simple mode, the bitrate.
fn write_video(host: &str, port: u16, password: &str, video: &ObsVideo) -> Result<(), ConnErr> {
    let mut socket = connect_identify(host, port, password)?;
    let result = (|| {
        checked(
            request_with(
                &mut socket,
                "SetVideoSettings",
                "corneta-set-video",
                json!({
                    "outputWidth": video.output_width,
                    "outputHeight": video.output_height,
                    "fpsNumerator": video.fps_numerator,
                    "fpsDenominator": video.fps_denominator,
                }),
            )?,
            "SetVideoSettings",
        )?;
        if let Some(kbps) = video.simple_kbps {
            checked(
                request_with(
                    &mut socket,
                    "SetProfileParameter",
                    "corneta-set-bitrate",
                    json!({
                        "parameterCategory": "SimpleOutput",
                        "parameterName": "VBitrate",
                        "parameterValue": kbps.to_string(),
                    }),
                )?,
                "SetProfileParameter",
            )?;
        }
        Ok(())
    })();
    let _ = socket.close(None);
    result
}

fn even(n: u32) -> u32 {
    (n / 2 * 2).max(2)
}

/// The OBS change that fits its signal within `limits`. It only lowers values and keeps the aspect ratio.
pub fn fit_video(current: &ObsVideo, limits: &crate::engine::CopyLimits) -> Option<ObsVideo> {
    let mut next = *current;
    let short = current.output_width.min(current.output_height);
    if short > limits.max_height {
        let scale = f64::from(limits.max_height) / f64::from(short);
        next.output_width = even((f64::from(current.output_width) * scale).round() as u32);
        next.output_height = even((f64::from(current.output_height) * scale).round() as u32);
    }
    if current.signal().fps > f64::from(limits.max_fps) + 0.5 {
        next.fps_numerator = limits.max_fps;
        next.fps_denominator = 1;
    }
    if current
        .simple_kbps
        .is_some_and(|kbps| kbps > limits.max_kbps)
    {
        next.simple_kbps = Some(limits.max_kbps);
    }
    (next != *current).then_some(next)
}

/// Applies the fit and returns the new video. The first backup is kept, since it holds the
/// settings from before any Corneta adjustment.
pub fn apply_fit(
    host: &str,
    port: u16,
    password: &str,
    limits: &crate::engine::CopyLimits,
    backup: &std::path::Path,
) -> Result<ObsVideo, ConnErr> {
    let current = read_video(host, port, password)?;
    let Some(next) = fit_video(&current, limits) else {
        return Ok(current);
    };
    if !backup.is_file() {
        let saved = serde_json::to_vec(&current)
            .ok()
            .and_then(|bytes| std::fs::write(backup, bytes).ok());
        if saved.is_none() {
            return Err(ConnErr::from(Msg::ObsVideoBackupFailed.now()));
        }
    }
    write_video(host, port, password, &next)?;
    Ok(next)
}

pub fn undo_fit(
    host: &str,
    port: u16,
    password: &str,
    backup: &std::path::Path,
) -> Result<(), ConnErr> {
    let saved = std::fs::read(backup)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<ObsVideo>(&bytes).ok())
        .ok_or_else(|| ConnErr::from(Msg::ObsVideoNoBackup.now()))?;
    write_video(host, port, password, &saved)?;
    let _ = std::fs::remove_file(backup);
    Ok(())
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

/// Scenes and Inputs event categories in obs-websocket v5.
const LINK_EVENTS: u32 = (1 << 2) | (1 << 3);

/// What the phone deck shows from OBS: scenes, the scene on air and the microphone.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkState {
    pub connected: bool,
    pub scenes: Vec<String>,
    pub scene: Option<String>,
    pub mic: Option<MicState>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct MicState {
    pub name: String,
    pub muted: bool,
}

pub enum LinkCmd {
    Scene(String),
    Mute(bool),
}

pub struct LinkRequest {
    pub cmd: LinkCmd,
    pub reply: std::sync::mpsc::Sender<Result<(), String>>,
}

/// OBS lists scenes bottom-up by index; the deck shows them in the order OBS's dock does.
pub(crate) fn scene_names(data: &Value) -> Vec<String> {
    let mut scenes: Vec<(i64, String)> = data
        .get("scenes")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|scene| {
                    Some((
                        scene.get("sceneIndex").and_then(Value::as_i64).unwrap_or(0),
                        scene.get("sceneName")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    scenes.sort_by_key(|scene| std::cmp::Reverse(scene.0));
    scenes.into_iter().map(|(_, name)| name).collect()
}

/// Applies one obs-websocket event (op 5); true when the deck needs a fresh state.
pub(crate) fn apply_link_event(state: &mut LinkState, message: &Value) -> bool {
    let kind = message.pointer("/d/eventType").and_then(Value::as_str);
    let data = message
        .pointer("/d/eventData")
        .cloned()
        .unwrap_or(Value::Null);
    let text = |key: &str| data.get(key).and_then(Value::as_str).map(str::to_string);
    match kind {
        Some("CurrentProgramSceneChanged") => {
            let next = text("sceneName");
            let changed = state.scene != next;
            state.scene = next;
            changed
        }
        Some("SceneListChanged") => {
            let next = scene_names(&data);
            let changed = state.scenes != next;
            state.scenes = next;
            changed
        }
        Some("SceneNameChanged") => {
            let (Some(old), Some(new)) = (text("oldSceneName"), text("sceneName")) else {
                return false;
            };
            for name in &mut state.scenes {
                if *name == old {
                    name.clone_from(&new);
                }
            }
            if state.scene.as_deref() == Some(old.as_str()) {
                state.scene = Some(new);
            }
            true
        }
        Some("InputMuteStateChanged") => {
            let muted = data.get("inputMuted").and_then(Value::as_bool);
            match (&mut state.mic, text("inputName"), muted) {
                (Some(mic), Some(name), Some(muted)) if mic.name == name && mic.muted != muted => {
                    mic.muted = muted;
                    true
                }
                _ => false,
            }
        }
        Some("InputNameChanged") => match (&mut state.mic, text("oldInputName"), text("inputName"))
        {
            (Some(mic), Some(old), Some(new)) if mic.name == old => {
                mic.name = new;
                true
            }
            _ => false,
        },
        _ => false,
    }
}

fn link_idle(error: &tungstenite::Error) -> bool {
    matches!(error, tungstenite::Error::Io(e)
        if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut))
}

/// Sends a request and waits for its response, applying events that arrive in between.
fn link_call(
    socket: &mut Socket,
    state: &mut LinkState,
    seq: &mut u64,
    req_type: &str,
    data: Value,
) -> Result<Value, String> {
    *seq += 1;
    let id = format!("corneta-deck-{seq}");
    send_json(
        socket,
        &json!({ "op": 6, "d": { "requestType": req_type, "requestId": id, "requestData": data } }),
    )?;
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while std::time::Instant::now() < deadline {
        match socket.read() {
            Ok(Message::Text(text)) => {
                let Ok(message) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                match message.get("op").and_then(Value::as_i64) {
                    Some(5) => {
                        apply_link_event(state, &message);
                    }
                    Some(7)
                        if message.pointer("/d/requestId").and_then(Value::as_str) == Some(&id) =>
                    {
                        if req_ok(&message) {
                            return Ok(message
                                .pointer("/d/responseData")
                                .cloned()
                                .unwrap_or(Value::Null));
                        }
                        let comment = message
                            .pointer("/d/requestStatus/comment")
                            .and_then(Value::as_str)
                            .unwrap_or(req_type);
                        return Err(Msg::DeckObsRefused { e: comment }.now());
                    }
                    _ => {}
                }
            }
            Ok(Message::Close(_)) => return Err(Msg::ObsConnectionClosed.now()),
            Ok(_) => {}
            Err(e) if link_idle(&e) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Err(Msg::DeckObsUnavailable.now())
}

fn link_snapshot(socket: &mut Socket, seq: &mut u64) -> Result<LinkState, String> {
    let mut state = LinkState {
        connected: true,
        ..LinkState::default()
    };
    let scenes = link_call(socket, &mut state, seq, "GetSceneList", json!({}))?;
    state.scenes = scene_names(&scenes);
    state.scene = scenes
        .get("currentProgramSceneName")
        .and_then(Value::as_str)
        .map(str::to_string);
    let special = link_call(socket, &mut state, seq, "GetSpecialInputs", json!({}))?;
    if let Some(name) = special.get("mic1").and_then(Value::as_str) {
        let mute = link_call(
            socket,
            &mut state,
            seq,
            "GetInputMute",
            json!({ "inputName": name }),
        )?;
        state.mic = Some(MicState {
            name: name.to_string(),
            muted: mute
                .get("inputMuted")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        });
    }
    Ok(state)
}

fn link_run_command(
    socket: &mut Socket,
    state: &mut LinkState,
    seq: &mut u64,
    cmd: LinkCmd,
) -> Result<(), String> {
    match cmd {
        LinkCmd::Scene(name) => {
            link_call(
                socket,
                state,
                seq,
                "SetCurrentProgramScene",
                json!({ "sceneName": name }),
            )?;
            state.scene = Some(name);
        }
        LinkCmd::Mute(muted) => {
            let Some(mic) = state.mic.clone() else {
                return Err(Msg::DeckObsNoMic.now());
            };
            link_call(
                socket,
                state,
                seq,
                "SetInputMute",
                json!({ "inputName": mic.name, "inputMuted": muted }),
            )?;
            if let Some(mic) = &mut state.mic {
                mic.muted = muted;
            }
        }
    }
    Ok(())
}

/// Keeps one OBS connection for the phone deck while `wanted` holds. Blocking; run on its own thread.
pub(crate) fn run_link(
    password: impl Fn() -> String,
    wanted: impl Fn() -> bool,
    alive: Arc<AtomicBool>,
    shared: Arc<std::sync::Mutex<LinkState>>,
    requests: std::sync::mpsc::Receiver<LinkRequest>,
    changed: impl Fn(),
) {
    let publish = |next: LinkState| {
        let mut current = shared.lock().unwrap();
        if *current != next {
            *current = next;
            drop(current);
            changed();
        }
    };
    let refuse_pending = || {
        while let Ok(request) = requests.try_recv() {
            let _ = request.reply.send(Err(Msg::DeckObsUnavailable.now()));
        }
    };
    let pause = |ms: u64| {
        for _ in 0..(ms / 100) {
            if !alive.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    };
    while alive.load(Ordering::Relaxed) {
        if !wanted() {
            publish(LinkState::default());
            refuse_pending();
            pause(400);
            continue;
        }
        let mut socket = match connect_with_events(
            crate::commands::OBS_WS_HOST,
            crate::commands::OBS_WS_PORT,
            &password(),
            LINK_EVENTS,
        ) {
            Ok(socket) => socket,
            Err(_) => {
                publish(LinkState::default());
                refuse_pending();
                pause(3000);
                continue;
            }
        };
        if let tungstenite::stream::MaybeTlsStream::Plain(tcp) = socket.get_mut() {
            let _ = tcp.set_read_timeout(Some(Duration::from_millis(200)));
        }
        let mut seq = 0u64;
        let mut state = match link_snapshot(&mut socket, &mut seq) {
            Ok(state) => state,
            Err(e) => {
                log::warn!("deck: OBS link setup failed: {e}");
                let _ = socket.close(None);
                publish(LinkState::default());
                pause(3000);
                continue;
            }
        };
        publish(state.clone());
        'session: while alive.load(Ordering::Relaxed) && wanted() {
            while let Ok(request) = requests.try_recv() {
                let result = link_run_command(&mut socket, &mut state, &mut seq, request.cmd);
                let _ = request.reply.send(result);
                publish(state.clone());
            }
            match socket.read() {
                Ok(Message::Text(text)) => {
                    if let Ok(message) = serde_json::from_str::<Value>(&text) {
                        if message.get("op").and_then(Value::as_i64) == Some(5)
                            && apply_link_event(&mut state, &message)
                        {
                            publish(state.clone());
                        }
                    }
                }
                Ok(Message::Close(_)) => break 'session,
                Ok(_) => {}
                Err(e) if link_idle(&e) => {}
                Err(_) => break 'session,
            }
        }
        let _ = socket.close(None);
        publish(LinkState::default());
    }
    publish(LinkState::default());
    refuse_pending();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_scenes_follow_the_obs_dock_order() {
        let data = json!({ "scenes": [
            { "sceneName": "Intervalo", "sceneIndex": 0 },
            { "sceneName": "Conversa", "sceneIndex": 1 },
            { "sceneName": "Jogo", "sceneIndex": 2 },
        ]});
        assert_eq!(scene_names(&data), ["Jogo", "Conversa", "Intervalo"]);
        assert!(scene_names(&json!({})).is_empty());
    }

    #[test]
    fn deck_link_events_update_scene_and_microphone() {
        let event = |kind: &str, data: Value| json!({ "op": 5, "d": { "eventType": kind, "eventData": data } });
        let mut state = LinkState {
            connected: true,
            scenes: vec!["Jogo".into(), "Conversa".into()],
            scene: Some("Jogo".into()),
            mic: Some(MicState {
                name: "Mic/Aux".into(),
                muted: false,
            }),
        };
        assert!(apply_link_event(
            &mut state,
            &event(
                "CurrentProgramSceneChanged",
                json!({ "sceneName": "Conversa" })
            )
        ));
        assert_eq!(state.scene.as_deref(), Some("Conversa"));
        assert!(!apply_link_event(
            &mut state,
            &event(
                "CurrentProgramSceneChanged",
                json!({ "sceneName": "Conversa" })
            )
        ));
        assert!(apply_link_event(
            &mut state,
            &event(
                "SceneNameChanged",
                json!({ "oldSceneName": "Conversa", "sceneName": "Papo" })
            )
        ));
        assert_eq!(state.scenes, ["Jogo", "Papo"]);
        assert_eq!(state.scene.as_deref(), Some("Papo"));
        assert!(apply_link_event(
            &mut state,
            &event(
                "InputMuteStateChanged",
                json!({ "inputName": "Mic/Aux", "inputMuted": true })
            )
        ));
        assert!(state.mic.as_ref().unwrap().muted);
        // Another input muting is not the deck's microphone.
        assert!(!apply_link_event(
            &mut state,
            &event(
                "InputMuteStateChanged",
                json!({ "inputName": "Desktop Audio", "inputMuted": false })
            )
        ));
        assert!(apply_link_event(
            &mut state,
            &event(
                "InputNameChanged",
                json!({ "oldInputName": "Mic/Aux", "inputName": "Microfone" })
            )
        ));
        assert_eq!(state.mic.as_ref().unwrap().name, "Microfone");
        assert!(!apply_link_event(
            &mut state,
            &event("StreamStateChanged", json!({}))
        ));
    }

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
                (
                    ConnFailure::AuthenticationFailed,
                    Msg::ObsPasswordRejected,
                    "authentication_failed",
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
    fn failures_reach_the_ui_as_stable_codes_with_their_message() {
        let failure = ObsFailure::from(ConnErr {
            failure: ConnFailure::AuthenticationFailed,
            msg: "senha recusada".into(),
        });
        assert_eq!(
            serde_json::to_value(&failure).unwrap(),
            json!({ "code": "authenticationFailed", "message": "senha recusada" })
        );
        for (failure, code) in [
            (ConnFailure::Connect, "connectionFailed"),
            (ConnFailure::Exchange, "exchangeFailed"),
            (ConnFailure::PasswordRequired, "passwordRequired"),
            (ConnFailure::Identification, "identificationFailed"),
            (ConnFailure::RequestRefused, "requestRefused"),
        ] {
            assert_eq!(serde_json::to_value(failure).unwrap(), json!(code));
        }
    }

    #[test]
    fn a_rejected_password_is_an_authentication_failure_not_a_missing_obs() {
        use tungstenite::protocol::{frame::coding::CloseCode, CloseFrame};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut ws = tungstenite::accept(stream).unwrap();
            let hello = json!({
                "op": 0,
                "d": { "rpcVersion": 1, "authentication": { "challenge": "Y2g=", "salt": "c2FsdA==" } }
            });
            ws.send(Message::Text(hello.to_string().into())).unwrap();
            let _identify = ws.read().unwrap();
            ws.close(Some(CloseFrame {
                code: CloseCode::from(4009),
                reason: "".into(),
            }))
            .unwrap();
            while ws.read().is_ok() {}
        });
        let error = match connect_identify("127.0.0.1", port, "wrong-password") {
            Err(error) => error,
            Ok(_) => panic!("a rejected password must not connect"),
        };
        server.join().unwrap();
        assert_eq!(error.failure, ConnFailure::AuthenticationFailed);
        assert!(error.failure.is_auth());
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

    fn video(width: u32, height: u32, fps: (u32, u32), simple_kbps: Option<u32>) -> ObsVideo {
        ObsVideo {
            output_width: width,
            output_height: height,
            fps_numerator: fps.0,
            fps_denominator: fps.1,
            simple_kbps,
        }
    }

    #[test]
    fn obs_video_settings_and_the_simple_bitrate_are_read() {
        let settings = json!({
            "baseWidth": 2560, "baseHeight": 1440,
            "outputWidth": 1920, "outputHeight": 1080,
            "fpsNumerator": 60000, "fpsDenominator": 1001
        });
        let simple = json!({ "parameterValue": "Simple", "defaultParameterValue": "Simple" });
        let advanced = json!({ "parameterValue": "Advanced", "defaultParameterValue": "Simple" });
        let unset_bitrate = json!({ "parameterValue": null, "defaultParameterValue": "2500" });
        assert_eq!(
            parse_obs_video(&settings, &simple, &unset_bitrate),
            Some(video(1920, 1080, (60000, 1001), Some(2500)))
        );
        assert_eq!(
            parse_obs_video(&settings, &advanced, &json!({ "parameterValue": "9000" })),
            Some(video(1920, 1080, (60000, 1001), None)),
            "the simple-mode bitrate does not apply to advanced output"
        );
        assert_eq!(
            parse_obs_video(&json!({ "outputWidth": 0 }), &simple, &unset_bitrate),
            None
        );
    }

    #[test]
    fn fitting_obs_only_lowers_and_keeps_the_aspect_ratio() {
        let twitch = crate::engine::copy_limits("twitch").unwrap();
        assert_eq!(
            fit_video(&video(2560, 1440, (60, 1), Some(9000)), &twitch),
            Some(video(1920, 1080, (60, 1), Some(6000)))
        );
        assert_eq!(
            fit_video(&video(3440, 1440, (120, 1), None), &twitch),
            Some(video(2580, 1080, (60, 1), None))
        );
        assert_eq!(
            fit_video(&video(1280, 720, (30, 1), Some(3000)), &twitch),
            None,
            "a signal under the limits is never raised"
        );
        assert_eq!(
            fit_video(&video(1920, 1080, (60000, 1001), Some(6000)), &twitch),
            None
        );
    }

    #[test]
    fn undo_needs_a_saved_backup() {
        let dir = std::env::temp_dir().join(format!("corneta-obs-fit-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let backup = dir.join("obs-video-backup.json");
        let _ = std::fs::remove_file(&backup);
        assert!(
            undo_fit("127.0.0.1", 9, "", &backup).is_err(),
            "nothing to undo"
        );
        std::fs::write(
            &backup,
            serde_json::to_vec(&video(2560, 1440, (60, 1), None)).unwrap(),
        )
        .unwrap();
        let saved: ObsVideo = serde_json::from_slice(&std::fs::read(&backup).unwrap()).unwrap();
        assert_eq!(saved, video(2560, 1440, (60, 1), None));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
