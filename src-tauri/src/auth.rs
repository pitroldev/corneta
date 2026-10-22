//! OAuth for chat and broadcasts: direct Twitch/YouTube flows, brokered Kick, and vault-only BYOK secrets.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::keys;
use crate::telemetry::TelemetryCorrelation;
use crate::AppState;

use crate::platforms::provider::{LoginOptions, Moderation, OwnCredentials, StreamKeyGrant};
use crate::platforms::{account_provider, account_providers, chat_provider};

pub(crate) const GRANT_DEVICE: &str = "urn:ietf:params:oauth:grant-type:device_code";
/// Twitch's own timeout ceiling; YouTube and Kick are clamped further by their APIs.
pub(crate) const MAX_TIMEOUT_SECONDS: u64 = 1_209_600;
/// Official IDs survive BYOK switches; active IDs select either the official client or vault credentials.
#[derive(Default, Clone)]
pub struct OauthConfig {
    pub twitch_client_id: String,
    pub twitch_client_secret: String,
    pub youtube_official_id: String,
    pub kick_official_id: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub kick_client_id: String,
    pub kick_client_secret: String,
    pub setup_api_url: String,
    pub youtube_direct: bool,
    pub kick_brokered: bool,
    /// Official Kick requires a ready broker because its client secret stays server-side.
    pub kick_broker_ready: bool,
}

pub(crate) fn oauth(app: &AppHandle) -> OauthConfig {
    app.state::<AppState>().oauth.lock().unwrap().clone()
}
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, (u16, Value)> {
    let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap_or(Value::Null);
    match ureq::post(url)
        .timeout(Duration::from_secs(12))
        .send_form(form)
    {
        Ok(r) => Ok(parse(r.into_string().unwrap_or_default())),
        Err(ureq::Error::Status(code, r)) => {
            Err((code, parse(r.into_string().unwrap_or_default())))
        }
        Err(_) => Err((0, Value::Null)),
    }
}

fn build_setup_correlation_headers(
    correlation: Option<TelemetryCorrelation>,
    operation_id: Option<String>,
) -> Vec<(&'static str, String)> {
    let Some(correlation) = correlation else {
        // Operation IDs are correlation data too; never send them without consent headers.
        return Vec::new();
    };
    let mut headers = Vec::with_capacity(3);
    headers.push(("X-Corneta-Telemetry-Id", correlation.installation_id));
    headers.push((
        "X-Corneta-Telemetry-Purposes",
        correlation.purposes.to_string(),
    ));
    if let Some(id) = operation_id.filter(|id| uuid::Uuid::parse_str(id).is_ok()) {
        headers.push(("X-Corneta-Operation-Id", id));
    }
    headers
}

fn setup_correlation_headers(app: &AppHandle) -> Vec<(&'static str, String)> {
    let state = app.state::<AppState>();
    let correlation = state.telemetry.correlation();
    let operation_id = correlation
        .as_ref()
        .and_then(|_| state.engine.lock().unwrap().operation_id.clone());
    build_setup_correlation_headers(correlation, operation_id)
}

fn with_setup_correlation(app: &AppHandle, mut request: ureq::Request) -> ureq::Request {
    // Only Corneta setup requests receive these headers, never direct provider requests.
    for (name, value) in setup_correlation_headers(app) {
        request = request.set(name, &value);
    }
    request
}

/// Error bodies may contain tokens: parse locally, never log them.
pub(crate) fn post_setup_json(
    app: &AppHandle,
    url: &str,
    body: &Value,
) -> Result<Value, (u16, Value)> {
    let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap_or(Value::Null);
    match with_setup_correlation(app, ureq::post(url))
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(12))
        .send_string(&body.to_string())
    {
        Ok(r) => Ok(parse(r.into_string().unwrap_or_default())),
        Err(ureq::Error::Status(code, r)) => {
            Err((code, parse(r.into_string().unwrap_or_default())))
        }
        Err(_) => Err((0, Value::Null)),
    }
}

fn get_setup_json(app: &AppHandle, url: &str) -> Result<Value, (u16, Value)> {
    let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap_or(Value::Null);
    match with_setup_correlation(app, ureq::get(url))
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(8))
        .call()
    {
        Ok(r) => Ok(parse(r.into_string().unwrap_or_default())),
        Err(ureq::Error::Status(code, r)) => {
            Err((code, parse(r.into_string().unwrap_or_default())))
        }
        Err(_) => Err((0, Value::Null)),
    }
}

pub(crate) fn setup_url(cfg: &OauthConfig, path: &str) -> Option<String> {
    let base = cfg.setup_api_url.trim().trim_end_matches('/');
    let secure = base.starts_with("https://");
    let local = cfg!(debug_assertions)
        && (base.starts_with("http://localhost:")
            || base.starts_with("http://127.0.0.1:")
            || base == "http://localhost"
            || base == "http://127.0.0.1");
    if base.is_empty() || (!secure && !local) {
        return None;
    }
    Some(format!("{base}{path}"))
}

fn broker_request_id(body: &Value) -> Option<String> {
    body.get("error")
        .and_then(|error| error.get("requestId"))
        .or_else(|| body.get("requestId"))
        .and_then(Value::as_str)
        .filter(|id| uuid::Uuid::parse_str(id).is_ok())
        .map(str::to_string)
}

pub(crate) fn record_broker_failure(app: &AppHandle, body: &Value, code: &str) -> Option<String> {
    let request_id = broker_request_id(body)?;
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.record_diagnostic(
        code,
        "oauth",
        operation_id.as_deref(),
        None,
        Some(&request_id),
    );
    Some(request_id)
}

pub(crate) fn broker_error(app: &AppHandle, code: u16, body: &Value, fallback: &str) -> String {
    let message = body
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let base = if !message.is_empty() {
        message.to_string()
    } else if code == 0 {
        Msg::AuthBrokerDown.now()
    } else {
        fallback.into()
    };
    if let Some(request_id) = record_broker_failure(app, body, "oauth_broker_failed") {
        format!("{base} (request_id: {request_id})")
    } else {
        base
    }
}

/// Legacy installations without a preference retain BYOK; selecting official preserves saved credentials.
pub(crate) fn byok_active(preference: Option<&str>, has_own_creds: bool) -> bool {
    has_own_creds && preference != Some("official")
}

pub(crate) fn own_creds(id_key: &str, secret_key: &str) -> Option<(String, String)> {
    let id = keys::get_key(id_key)?.trim().to_string();
    let secret = keys::get_key(secret_key)?.trim().to_string();
    (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
}

/// Refreshes public IDs/capabilities only; client secrets remain server-side.
pub(crate) fn refresh_broker_config(app: &AppHandle) -> Result<(), String> {
    let current = oauth(app);
    let base = current
        .setup_api_url
        .trim()
        .trim_end_matches('/')
        .to_string();
    let Some(url) = setup_url(&current, "/api/v1/bootstrap") else {
        return Err(if base.is_empty() {
            Msg::AuthSetupApiMissing.now()
        } else {
            Msg::AuthSetupApiNotHttps { base: &base }.now()
        });
    };
    let value = get_setup_json(app, &url).map_err(|(code, body)| {
        let message = match code {
            0 => Msg::AuthSetupApiUnreachable { base: &base }.now(),
            code => Msg::AuthSetupApiStatus { base: &base, code }.now(),
        };
        if let Some(request_id) = record_broker_failure(app, &body, "setup_bootstrap_failed") {
            format!("{message} (request_id: {request_id})")
        } else {
            message
        }
    })?;
    // Reject unrelated services responding on the configured setup port.
    let providers = value
        .get("providers")
        .filter(|p| p.is_object())
        .ok_or_else(|| Msg::AuthSetupApiWrongService { base: &base }.now())?
        .clone();
    let state = app.state::<AppState>();
    let mut config = state.oauth.lock().unwrap();
    for provider in account_providers() {
        let entry = providers.get(provider.id()).cloned().unwrap_or(Value::Null);
        provider.apply_bootstrap(&entry, &mut config);
    }
    for provider in account_providers() {
        provider.apply_mode(&mut config);
    }
    Ok(())
}

pub(crate) fn bootstrap_enabled(entry: &Value) -> bool {
    entry.get("enabled").and_then(|v| v.as_bool()) == Some(true)
}

pub(crate) fn bootstrap_client_id(entry: &Value) -> Option<String> {
    entry
        .get("clientId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub(crate) fn auth_event(
    app: &AppHandle,
    who: &str,
    state: &str,
    user_code: &str,
    verify: &str,
    login: &str,
) {
    if state == "connected" || state == "loggedout" {
        forget_account_channel(who);
    }
    let _ = app.emit(
        &format!("auth://{who}"),
        json!({ "state": state, "userCode": user_code, "verifyUri": verify, "login": login }),
    );
}

pub(crate) fn auth_code_event(
    app: &AppHandle,
    who: &str,
    user_code: &str,
    verify: &str,
    verify_complete: &str,
) {
    let _ = app.emit(
        &format!("auth://{who}"),
        json!({
            "state": "code",
            "userCode": user_code,
            "verifyUri": verify,
            "verifyUriComplete": verify_complete,
            "login": "",
        }),
    );
}

/// Empty values keep what the setup API bootstrap already supplied.
pub(crate) fn keep_client_id(slot: &mut String, value: &str) {
    if !value.trim().is_empty() {
        *slot = value.trim().to_string();
    }
}

#[tauri::command]
pub fn set_oauth_config(
    app: AppHandle,
    official_client_ids: std::collections::HashMap<String, String>,
    setup_api_url: String,
) {
    // Update in place to preserve IDs/capabilities supplied by bootstrap.
    // BYOK secrets remain native and never enter the distributed JavaScript.
    let st = app.state::<AppState>();
    let mut config = st.oauth.lock().unwrap();
    config.setup_api_url = setup_api_url.trim().trim_end_matches('/').to_string();
    for provider in account_providers() {
        let id = official_client_ids
            .get(provider.id())
            .map(String::as_str)
            .unwrap_or("");
        provider.set_official_client_id(&mut config, id);
        provider.apply_mode(&mut config);
    }
}

/// Invalidate volatile tokens even on partial deletion, but announce completion only on success.
pub(crate) fn finish_local_logout(
    delete: impl FnOnce() -> Result<(), String>,
    invalidate_cache: impl FnOnce(),
    completed: impl FnOnce(),
) -> Result<(), String> {
    let result = delete();
    invalidate_cache();
    result?;
    completed();
    Ok(())
}

/// Reports both session state and available login modes without blocking the UI thread.
#[tauri::command]
pub async fn auth_status(app: AppHandle) -> Value {
    tauri::async_runtime::spawn_blocking(move || {
        let broker = refresh_broker_config(&app);
        let cfg = oauth(&app);
        let mut status = Map::new();
        for provider in account_providers() {
            status.extend(provider.status(&app, &cfg));
        }
        status.insert("brokerError".into(), json!(broker.err()));
        Value::Object(status)
    })
    .await
    .unwrap_or_else(|_| {
        let mut status = Map::new();
        for provider in account_providers() {
            status.extend(provider.signed_out_status());
        }
        status.insert("brokerError".into(), Value::Null);
        Value::Object(status)
    })
}

/// A logged-in account's own channel, offered as a chat source.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct AccountChannel {
    pub platform: &'static str,
    /// What a chat source stores for this channel.
    pub value: String,
    /// Other spellings of the same channel, so sources added by hand are recognized.
    pub aliases: Vec<String>,
    pub name: String,
}

pub(crate) fn forget_account_channel(who: &str) {
    if let Some(provider) = account_provider(who) {
        provider.forget_account_channel();
    }
}

#[tauri::command]
pub async fn account_chat_channels(app: AppHandle) -> Vec<AccountChannel> {
    tauri::async_runtime::spawn_blocking(move || {
        account_providers()
            .iter()
            .filter_map(|provider| provider.account_channel(&app))
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn account_login_start(
    app: AppHandle,
    platform: String,
    moderation: Option<bool>,
    stream_key: Option<bool>,
) -> Result<(), String> {
    let provider = account_provider(&platform).ok_or_else(|| Msg::AuthStartFailed.now())?;
    provider.login_start(
        &app,
        LoginOptions {
            moderation: moderation.unwrap_or(false),
            stream_key: stream_key.unwrap_or(false),
        },
    );
    Ok(())
}

fn own_credentials(platform: &str) -> Result<&'static dyn OwnCredentials, String> {
    account_provider(platform)
        .and_then(|provider| provider.own_credentials())
        .ok_or_else(|| Msg::AuthByokNoSavedCreds.now())
}

#[tauri::command]
pub fn account_save_own_credentials(
    app: AppHandle,
    platform: String,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    own_credentials(&platform)?.save(&app, client_id, client_secret)
}

// Saved credentials stay through mode switches; only this forgets them.
#[tauri::command]
pub fn account_clear_own_credentials(app: AppHandle, platform: String) -> Result<(), String> {
    own_credentials(&platform)?.clear(&app)
}

#[tauri::command]
pub fn account_use_official(app: AppHandle, platform: String) -> Result<(), String> {
    own_credentials(&platform)?.use_official(&app)
}

#[tauri::command]
pub fn account_use_own_credentials(app: AppHandle, platform: String) -> Result<(), String> {
    own_credentials(&platform)?.use_saved(&app)
}

#[tauri::command]
pub async fn account_logout(app: AppHandle, platform: String) -> Result<(), String> {
    let provider = account_provider(&platform).ok_or_else(|| Msg::VaultDeleteFailed.now())?;
    tauri::async_runtime::spawn_blocking(move || provider.logout(&app))
        .await
        .map_err(|_| Msg::VaultDeleteFailed.now())?
}

/// The key goes straight to the target's vault slot; only the account name and server return.
#[tauri::command]
pub async fn account_fetch_stream_key(
    app: AppHandle,
    platform: String,
    target_id: String,
) -> Result<StreamKeyGrant, String> {
    let provider = account_provider(&platform).ok_or_else(|| Msg::StreamKeyFailed.now())?;
    tauri::async_runtime::spawn_blocking(move || {
        provider
            .fetch_stream_key(&app, &target_id)
            .unwrap_or_else(|| Err(Msg::StreamKeyFailed.now()))
    })
    .await
    .map_err(|_| Msg::StreamKeyFailed.now())?
}

pub(crate) fn provider_reason(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect::<String>()
        .trim()
        .to_string()
}

#[tauri::command]
pub async fn chat_moderate(
    app: AppHandle,
    source_id: String,
    action: String,
    native_id: Option<String>,
    author: Option<String>,
    author_id: Option<String>,
    seconds: Option<u64>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = crate::config::load(&app);
        let src = cfg
            .settings
            .chat_sources
            .iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| Msg::AlertSourceNotFound.now())?;
        let provider =
            chat_provider(&src.platform).ok_or_else(|| Msg::ModeratePlatformUnsupported.now())?;
        provider.moderate(
            &app,
            src,
            Moderation {
                action,
                native_id,
                author,
                author_id,
                seconds,
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(crate) fn timeout_seconds(seconds: Option<u64>) -> u64 {
    seconds.unwrap_or(600).clamp(1, MAX_TIMEOUT_SECONDS)
}

/// PKCE and anti-CSRF state require OS randomness, not timestamps or process IDs.
pub(crate) fn rand_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS RNG unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

pub(crate) fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub(crate) fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 3 <= b.len() => {
                // Decode bytes to avoid slicing inside a UTF-8 character.
                match (
                    (b[i + 1] as char).to_digit(16),
                    (b[i + 2] as char).to_digit(16),
                ) {
                    (Some(h), Some(l)) => out.push((h * 16 + l) as u8),
                    _ => out.push(b'%'),
                }
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn oauth_callback_error(provider: &str, detail: &str) -> String {
    // Google callbacks can reflect request data in error_description, too.
    let safe_detail = if provider == "YouTube" {
        "authorization_failed"
    } else {
        detail
    };
    Msg::AuthAuthorizationDenied {
        provider,
        err: safe_detail,
    }
    .now()
}

pub(crate) fn oauth_wait(
    listeners: &[TcpListener],
    expected_state: &str,
    provider: &str,
) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if Instant::now() > deadline {
            return Err(Msg::AuthLoginExpired { provider }.now());
        }
        let mut idle = true;
        for listener in listeners {
            let mut stream = match listener.accept() {
                Ok((s, _)) => s,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => continue,
                Err(_) => continue,
            };
            idle = false;
            // Windows may inherit nonblocking mode; bound reads while collecting the complete request.
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buf = [0u8; 8192];
            let mut n = 0usize;
            loop {
                match stream.read(&mut buf[n..]) {
                    Ok(0) => break,
                    Ok(k) => {
                        n += k;
                        if n >= buf.len() || buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
            let req = String::from_utf8_lossy(&buf[..n]);
            let line = req.lines().next().unwrap_or("");
            let path = line.split_whitespace().nth(1).unwrap_or("");
            let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
            let (mut code, mut got_state, mut err) = (String::new(), String::new(), String::new());
            for kv in query.split('&') {
                if let Some((k, v)) = kv.split_once('=') {
                    match k {
                        "code" => code = pct_decode(v),
                        "state" => got_state = pct_decode(v),
                        "error_description" => err = pct_decode(v),
                        "error" if err.is_empty() => err = pct_decode(v),
                        _ => {}
                    }
                }
            }
            // Only matching state may complete or abort login; ignore forged callbacks until the deadline.
            let state_ok = got_state == expected_state;
            let ok = err.is_empty() && !code.is_empty() && state_ok;
            let is_callback = !code.is_empty() || !err.is_empty();
            let msg = if ok {
                Msg::AuthCallbackPageOk.now()
            } else if is_callback {
                Msg::AuthCallbackPageError.now()
            } else {
                Msg::AuthCallbackPageWaiting.now()
            };
            let html = format!(
                "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;text-align:center;padding-top:3rem\"><h2>{msg}</h2>"
            );
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = stream.flush();
            if ok {
                return Ok(code);
            }
            if state_ok && !err.is_empty() {
                return Err(oauth_callback_error(provider, &err));
            }
        }
        if idle {
            std::thread::sleep(Duration::from_millis(150));
        }
    }
}

fn result_json(r: Result<Option<String>, String>) -> Value {
    match r {
        Ok(None) => json!({ "ok": true }),
        Ok(Some(w)) => json!({ "ok": true, "warn": w }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn set_stream_info(
    app: AppHandle,
    title: String,
    category: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let title = title.trim().to_string();
        if title.is_empty() {
            return Err(Msg::StreamInfoEmptyTitle.now());
        }
        let category = category.unwrap_or_default().trim().to_string();
        let mut out = Map::new();
        for provider in account_providers().iter().filter(|p| p.signed_in()) {
            out.insert(
                provider.id().into(),
                result_json(provider.set_stream_info(&app, &title, &category)),
            );
        }
        if out.is_empty() {
            return Err(Msg::StreamInfoNoPlatformSignedIn.now());
        }
        Ok(Value::Object(out))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn youtube_callback_error_never_echoes_provider_text() {
        let message = oauth_callback_error(
            "YouTube",
            "https://user:private-fixture@example.invalid?token=private-fixture",
        );
        assert!(!message.contains("private-fixture"));
        assert!(!message.contains("https://"));
        assert!(message.contains("authorization_failed"));
    }

    #[test]
    fn logout_invalidates_volatile_state_but_only_announces_confirmed_deletion() {
        for deletion in [Ok(()), Err("partial deletion".to_string())] {
            let expected_success = deletion.is_ok();
            let mut invalidated = false;
            let mut announced = false;
            let result =
                finish_local_logout(|| deletion, || invalidated = true, || announced = true);
            assert_eq!(result.is_ok(), expected_success);
            assert!(invalidated);
            assert_eq!(announced, expected_success);
        }
    }

    #[test]
    fn pkce_matches_rfc7636_vector() {
        // RFC 7636 Appendix B known-answer vector.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn pct_encode_and_roundtrip() {
        assert_eq!(pct("a b/c=d"), "a%20b%2Fc%3Dd");
        assert_eq!(pct_decode(&pct("olá mundo/?&=")), "olá mundo/?&=");
        assert_eq!(pct_decode("a+b"), "a b");
        assert_eq!(pct_decode("a%2Bb"), "a+b");
    }

    #[test]
    fn loopback_ignores_wrong_state_then_accepts_valid_callback() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let client = std::thread::spawn(move || {
            for request in [
                "GET /callback?code=forged&state=wrong HTTP/1.1\r\nHost: localhost\r\n\r\n",
                "GET /callback?code=real%2Bcode&state=expected HTTP/1.1\r\nHost: localhost\r\n\r\n",
            ] {
                let mut stream = std::net::TcpStream::connect(address).unwrap();
                stream.write_all(request.as_bytes()).unwrap();
                let mut response = String::new();
                stream.read_to_string(&mut response).unwrap();
                assert!(response.starts_with("HTTP/1.1 200 OK"));
            }
        });

        assert_eq!(
            oauth_wait(&[listener], "expected", "Teste").unwrap(),
            "real+code"
        );
        client.join().unwrap();
    }

    #[test]
    fn byok_survives_switch_to_official() {
        assert!(byok_active(None, true));
        assert!(byok_active(Some("byok"), true));
        assert!(!byok_active(Some("official"), true));
        assert!(byok_active(Some("byok"), true));
        assert!(!byok_active(Some("byok"), false));
        assert!(!byok_active(None, false));
    }

    #[test]
    fn result_json_shapes() {
        assert_eq!(result_json(Ok(None)), serde_json::json!({ "ok": true }));
        assert_eq!(
            result_json(Ok(Some("aviso".into()))),
            serde_json::json!({ "ok": true, "warn": "aviso" })
        );
        assert_eq!(
            result_json(Err("x".into())),
            serde_json::json!({ "ok": false, "error": "x" })
        );
    }

    #[test]
    fn setup_correlation_headers_are_paired_with_consent_purposes() {
        let operation_id = uuid::Uuid::new_v4().to_string();
        assert!(build_setup_correlation_headers(None, Some(operation_id.clone())).is_empty());

        for purpose in ["usage", "crash_reports", "usage,crash_reports"] {
            let installation_id = uuid::Uuid::new_v4().to_string();
            let headers = build_setup_correlation_headers(
                Some(TelemetryCorrelation {
                    installation_id: installation_id.clone(),
                    purposes: purpose,
                }),
                Some(operation_id.clone()),
            );
            assert_eq!(headers.len(), 3);
            assert_eq!(
                headers
                    .iter()
                    .find(|(name, _)| *name == "X-Corneta-Telemetry-Id")
                    .map(|(_, value)| value.as_str()),
                Some(installation_id.as_str())
            );
            assert_eq!(
                headers
                    .iter()
                    .find(|(name, _)| *name == "X-Corneta-Telemetry-Purposes")
                    .map(|(_, value)| value.as_str()),
                Some(purpose)
            );
            assert_eq!(
                headers
                    .iter()
                    .find(|(name, _)| *name == "X-Corneta-Operation-Id")
                    .map(|(_, value)| value.as_str()),
                Some(operation_id.as_str())
            );
        }

        let headers = build_setup_correlation_headers(
            Some(TelemetryCorrelation {
                installation_id: uuid::Uuid::new_v4().to_string(),
                purposes: "usage",
            }),
            Some("not-a-uuid".into()),
        );
        assert_eq!(headers.len(), 2);
        assert!(headers
            .iter()
            .all(|(name, _)| *name != "X-Corneta-Operation-Id"));
    }

    #[test]
    fn broker_request_id_accepts_only_uuid_from_known_fields() {
        let nested = serde_json::json!({
            "error": { "requestId": "018f9f2a-04b4-7a5b-9c8d-123456789abc" }
        });
        assert_eq!(
            broker_request_id(&nested).as_deref(),
            Some("018f9f2a-04b4-7a5b-9c8d-123456789abc")
        );

        let top = serde_json::json!({
            "requestId": "4f9cf1d4-79c9-44c8-afd9-0ec39bd4dd24"
        });
        assert_eq!(
            broker_request_id(&top).as_deref(),
            Some("4f9cf1d4-79c9-44c8-afd9-0ec39bd4dd24")
        );
        assert_eq!(
            broker_request_id(&serde_json::json!({ "requestId": "not-a-uuid" })),
            None
        );
        assert_eq!(
            broker_request_id(&serde_json::json!({
                "error": { "request_id": "4f9cf1d4-79c9-44c8-afd9-0ec39bd4dd24" }
            })),
            None,
            "Arbitrary fields are not part of the broker contract"
        );
    }

    #[test]
    fn timeouts_fit_the_shared_range() {
        assert_eq!(timeout_seconds(None), 600);
        assert_eq!(timeout_seconds(Some(0)), 1);
        assert_eq!(timeout_seconds(Some(u64::MAX)), MAX_TIMEOUT_SECONDS);
    }
}
