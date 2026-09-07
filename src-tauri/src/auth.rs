//! OAuth for chat and broadcasts: direct Twitch/YouTube flows, brokered Kick, and vault-only BYOK secrets.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::http_client as ureq;
use crate::i18n::{self, Locale, Msg};
use crate::keys;
use crate::telemetry::TelemetryCorrelation;
use crate::AppState;

mod youtube_broadcast;
mod youtube_error;
use youtube_broadcast::{Error as BroadcastError, Recovery as YoutubeRecovery, RemoteState};
use youtube_error::GoogleError;

const TWITCH_SCOPES: &str =
    "chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users channel:manage:broadcast";
// This scope supports broadcasts/chat and the BYOK limited-input device flow.
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/youtube";
const GRANT_DEVICE: &str = "urn:ietf:params:oauth:grant-type:device_code";
const KICK_SCOPES: &str =
    "user:read channel:read channel:write chat:write moderation:chat_message:manage";
const KICK_PORT: u16 = 7395;

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

fn oauth(app: &AppHandle) -> OauthConfig {
    app.state::<AppState>().oauth.lock().unwrap().clone()
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, (u16, Value)> {
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
fn post_setup_json(app: &AppHandle, url: &str, body: &Value) -> Result<Value, (u16, Value)> {
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

fn setup_url(cfg: &OauthConfig, path: &str) -> Option<String> {
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

fn record_broker_failure(app: &AppHandle, body: &Value, code: &str) -> Option<String> {
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

fn broker_error(app: &AppHandle, code: u16, body: &Value, fallback: &str) -> String {
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
fn byok_active(preference: Option<&str>, has_own_creds: bool) -> bool {
    has_own_creds && preference != Some("official")
}

fn own_creds(id_key: &str, secret_key: &str) -> Option<(String, String)> {
    let id = keys::get_key(id_key)?.trim().to_string();
    let secret = keys::get_key(secret_key)?.trim().to_string();
    (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
}

fn resolve_youtube_mode(
    config: &mut OauthConfig,
    own: Option<(String, String)>,
    preference: Option<&str>,
) {
    match own {
        Some((id, secret)) if byok_active(preference, true) => {
            config.google_client_id = id;
            config.google_client_secret = secret;
            config.youtube_direct = false;
        }
        _ => {
            config.google_client_id = config.youtube_official_id.clone();
            config.google_client_secret.clear();
            config.youtube_direct = !config.youtube_official_id.is_empty();
        }
    }
}

fn resolve_kick_mode(
    config: &mut OauthConfig,
    own: Option<(String, String)>,
    preference: Option<&str>,
) {
    match own {
        Some((id, secret)) if byok_active(preference, true) => {
            config.kick_client_id = id;
            config.kick_client_secret = secret;
            config.kick_brokered = false;
        }
        _ => {
            config.kick_client_id = config.kick_official_id.clone();
            config.kick_client_secret.clear();
            config.kick_brokered = config.kick_broker_ready && !config.kick_official_id.is_empty();
        }
    }
}

fn apply_youtube_mode(config: &mut OauthConfig) {
    let own = own_creds("youtube_client_id", "youtube_client_secret");
    let preference = keys::get_key("youtube_oauth_preference");
    resolve_youtube_mode(config, own, preference.as_deref());
}

fn apply_kick_mode(config: &mut OauthConfig) {
    let own = own_creds("kick_client_id", "kick_client_secret");
    let preference = keys::get_key("kick_oauth_preference");
    resolve_kick_mode(config, own, preference.as_deref());
}

/// Refreshes public IDs/capabilities only; client secrets remain server-side.
fn refresh_broker_config(app: &AppHandle) -> Result<(), String> {
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
    let provider = |name: &str| providers.get(name).cloned().unwrap_or(Value::Null);
    let twitch = provider("twitch");
    let youtube = provider("youtube");
    let kick = provider("kick");
    let enabled = |p: &Value| p.get("enabled").and_then(|v| v.as_bool()) == Some(true);
    let client_id = |p: &Value| {
        p.get("clientId")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(str::to_string)
    };

    let state = app.state::<AppState>();
    let mut config = state.oauth.lock().unwrap();
    if let Some(id) = client_id(&twitch) {
        config.twitch_client_id = id;
    }
    // Keep build-time IDs as fallback when the broker does not enable a provider.
    if enabled(&youtube) {
        if let Some(id) = client_id(&youtube) {
            config.youtube_official_id = id;
        }
    }
    if enabled(&kick) {
        if let Some(id) = client_id(&kick) {
            config.kick_official_id = id;
        }
    }
    config.kick_broker_ready = enabled(&kick);
    apply_youtube_mode(&mut config);
    apply_kick_mode(&mut config);
    Ok(())
}

/// Translate allowlisted codes only; provider descriptions can reflect request data.
fn google_oauth_err(code: u16, e: &Value, l: Locale) -> String {
    let err = e.get("error").and_then(|x| x.as_str()).unwrap_or("");
    match err {
        "invalid_client" | "unauthorized_client" => Msg::AuthGoogleWrongClientType.text(l),
        _ if code == 0 => Msg::AuthGoogleNoConnection.text(l),
        _ => Msg::AuthGoogleStatus { code }.text(l),
    }
}

/// Desktop PKCE uses the verifier, not a bundled client secret.
fn youtube_official_exchange_form<'a>(
    client_id: &'a str,
    code: &'a str,
    verifier: &'a str,
    redirect: &'a str,
) -> Vec<(&'a str, &'a str)> {
    vec![
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", verifier),
        ("redirect_uri", redirect),
        ("grant_type", "authorization_code"),
    ]
}

/// Google requires a client secret for device polling, so this is BYOK-only.
fn youtube_device_poll_form<'a>(
    client_id: &'a str,
    client_secret: &'a str,
    device_code: &'a str,
) -> Vec<(&'a str, &'a str)> {
    vec![
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("device_code", device_code),
        ("grant_type", GRANT_DEVICE),
    ]
}

/// The official refresh omits the optional client secret; BYOK supplies its own.
fn youtube_refresh_form<'a>(
    client_id: &'a str,
    refresh: &'a str,
    client_secret: Option<&'a str>,
) -> Vec<(&'a str, &'a str)> {
    let mut form = vec![
        ("client_id", client_id),
        ("refresh_token", refresh),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }
    form
}

fn auth_event(app: &AppHandle, who: &str, state: &str, user_code: &str, verify: &str, login: &str) {
    let _ = app.emit(
        &format!("auth://{who}"),
        json!({ "state": state, "userCode": user_code, "verifyUri": verify, "login": login }),
    );
}

fn auth_code_event(
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

#[tauri::command]
pub fn set_oauth_config(
    app: AppHandle,
    twitch_client_id: String,
    google_client_id: String,
    kick_client_id: Option<String>,
    setup_api_url: String,
) {
    // Update in place to preserve IDs/capabilities supplied by bootstrap.
    // BYOK secrets remain native and never enter the distributed JavaScript.
    let st = app.state::<AppState>();
    let mut config = st.oauth.lock().unwrap();
    config.setup_api_url = setup_api_url.trim().trim_end_matches('/').to_string();
    config.twitch_client_secret.clear();
    let keep = |slot: &mut String, value: &str| {
        if !value.trim().is_empty() {
            *slot = value.trim().to_string();
        }
    };
    keep(&mut config.twitch_client_id, &twitch_client_id);
    keep(&mut config.youtube_official_id, &google_client_id);
    keep(
        &mut config.kick_official_id,
        &kick_client_id.unwrap_or_default(),
    );
    apply_youtube_mode(&mut config);
    apply_kick_mode(&mut config);
}

/// Clears session tokens/caches, not saved OAuth client credentials.
fn forget_youtube_session() -> Result<(), String> {
    let _guard = YT_REFRESH_LOCK
        .lock()
        .map_err(|_| Msg::VaultDeleteFailed.now())?;
    finish_local_logout(
        || keys::clear_keys(&["youtube_refresh", "youtube_oauth", "youtube_oauth_mode"]),
        || {
            *YT_TOKEN.lock().unwrap() = None;
            *YT_CHAT.lock().unwrap() = None;
        },
        || {},
    )
}

/// Invalidate volatile tokens even on partial deletion, but announce completion only on success.
fn finish_local_logout(
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

fn youtube_mode_changed(app: &AppHandle) {
    // Release the config guard before emitting an auth event.
    apply_youtube_mode(&mut app.state::<AppState>().oauth.lock().unwrap());
    auth_event(app, "youtube", "loggedout", "", "", "");
}

#[tauri::command]
pub fn set_youtube_oauth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let id = client_id.trim();
    let secret = client_secret.trim();
    if id.is_empty() || secret.is_empty() {
        return Err(Msg::AuthByokFillClientIdAndSecret.now());
    }
    forget_youtube_session()?;
    keys::set_key("youtube_client_id", id)?;
    keys::set_key("youtube_client_secret", secret)?;
    keys::set_key("youtube_oauth_preference", "byok")?;
    youtube_mode_changed(&app);
    Ok(())
}

/// Preserves BYOK credentials and refuses to switch unless the official flow is available.
#[tauri::command]
pub fn youtube_use_official(app: AppHandle) -> Result<(), String> {
    let broker = refresh_broker_config(&app);
    if oauth(&app).youtube_official_id.is_empty() {
        return Err(match broker {
            Err(reason) => Msg::AuthYoutubeOfficialUnavailableReason { reason: &reason }.now(),
            Ok(()) => Msg::AuthYoutubeOfficialNotEnabled.now(),
        });
    }
    forget_youtube_session()?;
    keys::set_key("youtube_oauth_preference", "official")?;
    youtube_mode_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn youtube_use_own_creds(app: AppHandle) -> Result<(), String> {
    if own_creds("youtube_client_id", "youtube_client_secret").is_none() {
        return Err(Msg::AuthByokNoSavedCreds.now());
    }
    forget_youtube_session()?;
    keys::set_key("youtube_oauth_preference", "byok")?;
    youtube_mode_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn clear_youtube_oauth(app: AppHandle) -> Result<(), String> {
    let credentials = keys::clear_keys(&[
        "youtube_client_id",
        "youtube_client_secret",
        "youtube_oauth_preference",
    ]);
    let session = forget_youtube_session();
    credentials?;
    session?;
    youtube_mode_changed(&app);
    Ok(())
}

fn forget_kick_session() -> Result<(), String> {
    let _guard = KICK_REFRESH_LOCK
        .lock()
        .map_err(|_| Msg::VaultDeleteFailed.now())?;
    finish_local_logout(
        || keys::clear_keys(&["kick_refresh", "kick_oauth", "kick_oauth_mode"]),
        || KICK_IDS.lock().unwrap().clear(),
        || {},
    )
}

fn kick_mode_changed(app: &AppHandle) {
    apply_kick_mode(&mut app.state::<AppState>().oauth.lock().unwrap());
    auth_event(app, "kick", "loggedout", "", "", "");
}

#[tauri::command]
pub fn set_kick_oauth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let id = client_id.trim();
    let secret = client_secret.trim();
    if id.is_empty() || secret.is_empty() || id.len() > 512 || secret.len() > 512 {
        return Err(Msg::AuthKickFillValidCreds.now());
    }
    forget_kick_session()?;
    keys::set_key("kick_client_id", id)?;
    keys::set_key("kick_client_secret", secret)?;
    keys::set_key("kick_oauth_preference", "byok")?;
    kick_mode_changed(&app);
    Ok(())
}

/// Preserves BYOK credentials and refuses to switch unless the official broker is ready.
#[tauri::command]
pub fn kick_use_official(app: AppHandle) -> Result<(), String> {
    let broker = refresh_broker_config(&app);
    let cfg = oauth(&app);
    if cfg.kick_official_id.is_empty() || !cfg.kick_broker_ready {
        return Err(match broker {
            Err(reason) => Msg::AuthKickOfficialUnavailableReason { reason: &reason }.now(),
            Ok(()) => Msg::AuthKickOfficialNotEnabled.now(),
        });
    }
    forget_kick_session()?;
    keys::set_key("kick_oauth_preference", "official")?;
    kick_mode_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn kick_use_own_creds(app: AppHandle) -> Result<(), String> {
    if own_creds("kick_client_id", "kick_client_secret").is_none() {
        return Err(Msg::AuthByokNoSavedCreds.now());
    }
    forget_kick_session()?;
    keys::set_key("kick_oauth_preference", "byok")?;
    kick_mode_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn clear_kick_oauth(app: AppHandle) -> Result<(), String> {
    let credentials = keys::clear_keys(&[
        "kick_client_id",
        "kick_client_secret",
        "kick_oauth_preference",
    ]);
    let session = forget_kick_session();
    credentials?;
    session?;
    kick_mode_changed(&app);
    Ok(())
}

/// Reports both session state and available login modes without blocking the UI thread.
#[tauri::command]
pub async fn auth_status(app: AppHandle) -> Value {
    tauri::async_runtime::spawn_blocking(move || {
        let broker = refresh_broker_config(&app);
        let twitch = twitch_token(&app).and_then(|t| twitch_validate(&t)).map(|i| i.login);
        let youtube = keys::has_key("youtube_refresh");
        let cfg = oauth(&app);
        let youtube_own = own_creds("youtube_client_id", "youtube_client_secret").is_some();
        let kick_own = own_creds("kick_client_id", "kick_client_secret").is_some();
        let youtube_configured = cfg.youtube_direct || !cfg.google_client_secret.is_empty();
        let kick = keys::has_key("kick_refresh");
        let kick_configured = cfg.kick_brokered || !cfg.kick_client_secret.is_empty();
        json!({
            "twitchLogin": twitch,
            "youtube": youtube,
            "youtubeConfigured": youtube_configured,
            "youtubeOfficialReady": !cfg.youtube_official_id.is_empty(),
            "youtubeOwnCreds": youtube_own,
            "youtubeUsingOwnCreds": !cfg.google_client_secret.is_empty(),
            "kick": kick,
            "kickConfigured": kick_configured,
            "kickOfficialReady": cfg.kick_broker_ready && !cfg.kick_official_id.is_empty(),
            "kickOwnCreds": kick_own,
            "kickUsingOwnCreds": !cfg.kick_client_secret.is_empty(),
            "brokerError": broker.err(),
        })
    })
    .await
    .unwrap_or_else(|_| json!({ "twitchLogin": null, "youtube": false, "youtubeConfigured": false, "youtubeOfficialReady": false, "youtubeOwnCreds": false, "youtubeUsingOwnCreds": false, "kick": false, "kickConfigured": false, "kickOfficialReady": false, "kickOwnCreds": false, "kickUsingOwnCreds": false, "brokerError": null }))
}

pub struct TwitchInfo {
    pub user_id: String,
    pub login: String,
}

pub fn twitch_validate(token: &str) -> Option<TwitchInfo> {
    let body = ureq::get("https://id.twitch.tv/oauth2/validate")
        .set("Authorization", &format!("OAuth {token}"))
        .timeout(Duration::from_secs(8))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    Some(TwitchInfo {
        user_id: v.get("user_id")?.as_str()?.to_string(),
        login: v.get("login")?.as_str()?.to_lowercase(),
    })
}

#[tauri::command]
pub fn twitch_login_start(app: AppHandle) {
    let cfg = oauth(&app);
    if cfg.twitch_client_id.is_empty() {
        auth_event(
            &app,
            "twitch",
            "error",
            "",
            "",
            &Msg::AuthTwitchMissingClientId.now(),
        );
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let dev = match post_form(
            "https://id.twitch.tv/oauth2/device",
            &[
                ("client_id", &cfg.twitch_client_id),
                ("scopes", TWITCH_SCOPES),
            ],
        ) {
            Ok(v) => v,
            Err(_) => {
                return auth_event(&app, "twitch", "error", "", "", &Msg::AuthStartFailed.now())
            }
        };
        let device_code = dev
            .get("device_code")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let user_code = dev
            .get("user_code")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let verify = dev
            .get("verification_uri")
            .and_then(|x| x.as_str())
            .unwrap_or("https://www.twitch.tv/activate")
            .to_string();
        let verify_complete = dev
            .get("verification_uri_complete")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let interval = dev
            .get("interval")
            .and_then(|x| x.as_u64())
            .unwrap_or(5)
            .max(1);
        let expires = dev
            .get("expires_in")
            .and_then(|x| x.as_u64())
            .unwrap_or(1800);
        if device_code.is_empty() {
            return auth_event(
                &app,
                "twitch",
                "error",
                "",
                "",
                &Msg::AuthTwitchBadResponse.now(),
            );
        }
        auth_code_event(&app, "twitch", &user_code, &verify, &verify_complete);

        let deadline = Instant::now() + Duration::from_secs(expires);
        loop {
            std::thread::sleep(Duration::from_secs(interval));
            if Instant::now() > deadline {
                return auth_event(&app, "twitch", "error", "", "", &Msg::AuthCodeExpired.now());
            }
            match post_form(
                "https://id.twitch.tv/oauth2/token",
                &[
                    ("client_id", &cfg.twitch_client_id),
                    ("device_code", &device_code),
                    ("grant_type", GRANT_DEVICE),
                ],
            ) {
                Ok(v) => {
                    let access = v.get("access_token").and_then(|x| x.as_str()).unwrap_or("");
                    if access.is_empty() {
                        continue;
                    }
                    // Announce success only after the vault has persisted the session.
                    if let Err(e) = keys::set_key("twitch_oauth", access) {
                        return auth_event(&app, "twitch", "error", "", "", &e);
                    }
                    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
                        if let Err(e) = keys::set_key("twitch_refresh", r) {
                            return auth_event(&app, "twitch", "error", "", "", &e);
                        }
                    }
                    let login = twitch_validate(access).map(|i| i.login).unwrap_or_default();
                    return auth_event(&app, "twitch", "connected", "", "", &login);
                }
                Err((_, e)) => {
                    let msg = e
                        .get("message")
                        .and_then(|x| x.as_str())
                        .or_else(|| e.get("error").and_then(|x| x.as_str()))
                        .unwrap_or("");
                    if msg.contains("pending") || msg.is_empty() {
                        continue;
                    }
                    if msg.contains("slow") {
                        std::thread::sleep(Duration::from_secs(interval));
                        continue;
                    }
                    return auth_event(&app, "twitch", "error", "", "", msg);
                }
            }
        }
    });
}

#[tauri::command]
pub async fn twitch_logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = TWITCH_REFRESH_LOCK
            .lock()
            .map_err(|_| Msg::VaultDeleteFailed.now())?;
        finish_local_logout(
            || keys::clear_keys(&["twitch_refresh", "twitch_oauth"]),
            || {},
            || auth_event(&app, "twitch", "loggedout", "", "", ""),
        )
    })
    .await
    .map_err(|_| Msg::VaultDeleteFailed.now())?
}

pub fn twitch_token(app: &AppHandle) -> Option<String> {
    let access = keys::get_key("twitch_oauth")?;
    if twitch_validate(&access).is_some() {
        return Some(access);
    }
    twitch_refresh(app)
}

// Serialize rotating refresh tokens to avoid consuming the same token twice.
static TWITCH_REFRESH_LOCK: Mutex<()> = Mutex::new(());

fn twitch_refresh(app: &AppHandle) -> Option<String> {
    let cfg = oauth(app);
    let refresh = keys::get_key("twitch_refresh")?;
    let _guard = TWITCH_REFRESH_LOCK.lock().unwrap();
    // Re-read under the lock: another refresh may already have replaced this token.
    let current = keys::get_key("twitch_refresh")?;
    if current != refresh {
        return keys::get_key("twitch_oauth");
    }
    let mut form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", current.as_str()),
        ("client_id", cfg.twitch_client_id.as_str()),
    ];
    if !cfg.twitch_client_secret.is_empty() {
        form.push(("client_secret", cfg.twitch_client_secret.as_str()));
    }
    let v = post_form("https://id.twitch.tv/oauth2/token", &form).ok()?;
    let access = v.get("access_token").and_then(|x| x.as_str())?.to_string();
    // Announce success only after the vault has persisted the session.
    keys::set_key("twitch_oauth", &access).ok()?;
    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
        keys::set_key("twitch_refresh", r).ok()?;
    }
    Some(access)
}

#[tauri::command]
pub fn youtube_login_start(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        let broker = refresh_broker_config(&app);
        let cfg = oauth(&app);
        if cfg.youtube_direct {
            return youtube_direct_login(&app, &cfg);
        }
        if cfg.google_client_id.is_empty() || cfg.google_client_secret.is_empty() {
            let reason = broker
                .err()
                .unwrap_or_else(|| Msg::AuthYoutubeServerNotEnabled.now());
            return auth_event(
                &app,
                "youtube",
                "error",
                "",
                "",
                &Msg::AuthOfficialUnavailable { reason: &reason }.now(),
            );
        }
        let dev = match post_form(
            "https://oauth2.googleapis.com/device/code",
            &[
                ("client_id", &cfg.google_client_id),
                ("scope", GOOGLE_SCOPE),
            ],
        ) {
            Ok(v) => v,
            Err((code, e)) => {
                return auth_event(
                    &app,
                    "youtube",
                    "error",
                    "",
                    "",
                    &google_oauth_err(code, &e, i18n::locale()),
                )
            }
        };
        let device_code = dev
            .get("device_code")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let user_code = dev
            .get("user_code")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let verify = dev
            .get("verification_url")
            .or_else(|| dev.get("verification_uri"))
            .and_then(|x| x.as_str())
            .unwrap_or("https://www.google.com/device")
            .to_string();
        let verify_complete = dev
            .get("verification_url_complete")
            .or_else(|| dev.get("verification_uri_complete"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let interval = dev
            .get("interval")
            .and_then(|x| x.as_u64())
            .unwrap_or(5)
            .max(1);
        let expires = dev
            .get("expires_in")
            .and_then(|x| x.as_u64())
            .unwrap_or(1800);
        if device_code.is_empty() {
            return auth_event(
                &app,
                "youtube",
                "error",
                "",
                "",
                &Msg::AuthGoogleBadResponse.now(),
            );
        }
        auth_code_event(&app, "youtube", &user_code, &verify, &verify_complete);

        let deadline = Instant::now() + Duration::from_secs(expires);
        loop {
            std::thread::sleep(Duration::from_secs(interval));
            if Instant::now() > deadline {
                return auth_event(
                    &app,
                    "youtube",
                    "error",
                    "",
                    "",
                    &Msg::AuthCodeExpired.now(),
                );
            }
            match post_form(
                "https://oauth2.googleapis.com/token",
                &youtube_device_poll_form(
                    &cfg.google_client_id,
                    &cfg.google_client_secret,
                    &device_code,
                ),
            ) {
                Ok(v) => {
                    let access = v.get("access_token").and_then(|x| x.as_str()).unwrap_or("");
                    if access.is_empty() {
                        continue;
                    }
                    // Announce success only after the vault has persisted the session.
                    if let Err(e) = keys::set_key("youtube_oauth", access) {
                        return auth_event(&app, "youtube", "error", "", "", &e);
                    }
                    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
                        if let Err(e) = keys::set_key("youtube_refresh", r) {
                            return auth_event(&app, "youtube", "error", "", "", &e);
                        }
                    }
                    let _ = keys::set_key("youtube_oauth_mode", "byok");
                    return auth_event(&app, "youtube", "connected", "", "", "");
                }
                Err((status, e)) => {
                    let err = e.get("error").and_then(|x| x.as_str()).unwrap_or("");
                    if err == "authorization_pending" || err.is_empty() {
                        continue;
                    }
                    if err == "slow_down" {
                        std::thread::sleep(Duration::from_secs(interval));
                        continue;
                    }
                    return auth_event(
                        &app,
                        "youtube",
                        "error",
                        "",
                        "",
                        &google_oauth_err(status, &e, i18n::locale()),
                    );
                }
            }
        }
    });
}

fn youtube_direct_login(app: &AppHandle, cfg: &OauthConfig) {
    if cfg.google_client_id.is_empty() {
        return auth_event(
            app,
            "youtube",
            "error",
            "",
            "",
            &Msg::AuthYoutubeOfficialNotConfigured.now(),
        );
    }

    // Bind the ephemeral loopback listener before opening the browser to avoid a callback race.
    let listener = match TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0)) {
        Ok(listener) => listener,
        Err(_) => {
            return auth_event(
                app,
                "youtube",
                "error",
                "",
                "",
                &Msg::AuthYoutubeCallbackOpenFailed.now(),
            )
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(_) => {
            return auth_event(
                app,
                "youtube",
                "error",
                "",
                "",
                &Msg::AuthYoutubeCallbackPrepFailed.now(),
            )
        }
    };
    if listener.set_nonblocking(true).is_err() {
        return auth_event(
            app,
            "youtube",
            "error",
            "",
            "",
            &Msg::AuthYoutubeCallbackPrepFailed.now(),
        );
    }

    let verifier = rand_token();
    let challenge = pkce_challenge(&verifier);
    let state = rand_token();
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent&include_granted_scopes=true",
        pct(&cfg.google_client_id),
        pct(&redirect),
        pct(GOOGLE_SCOPE),
        pct(&challenge),
        pct(&state),
    );
    auth_code_event(app, "youtube", "", &url, &url);

    let code = match oauth_wait(&[listener], &state, "YouTube") {
        Ok(code) => code,
        Err(error) => return auth_event(app, "youtube", "error", "", "", &error),
    };
    let value = match post_form(
        "https://oauth2.googleapis.com/token",
        &youtube_official_exchange_form(&cfg.google_client_id, &code, &verifier, &redirect),
    ) {
        Ok(value) => value,
        Err((status, body)) => {
            let message = if body.get("error").and_then(Value::as_str) == Some("invalid_client") {
                Msg::AuthGoogleWrongDesktopClient.now()
            } else {
                google_oauth_err(status, &body, i18n::locale())
            };
            return auth_event(app, "youtube", "error", "", "", &message);
        }
    };
    let access = value
        .get("access_token")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let refresh = value
        .get("refresh_token")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if access.is_empty() || refresh.is_empty() {
        return auth_event(
            app,
            "youtube",
            "error",
            "",
            "",
            &Msg::AuthGoogleNoRefreshableSession.now(),
        );
    }
    if let Err(error) = keys::set_key("youtube_oauth", access) {
        return auth_event(app, "youtube", "error", "", "", &error);
    }
    if let Err(error) = keys::set_key("youtube_refresh", refresh) {
        let _ = keys::clear_key("youtube_oauth");
        return auth_event(app, "youtube", "error", "", "", &error);
    }
    let _ = keys::set_key("youtube_oauth_mode", "official");
    let expires = value
        .get("expires_in")
        .and_then(|value| value.as_u64())
        .unwrap_or(3_600);
    *YT_TOKEN.lock().unwrap() = Some((access.to_string(), now_ms() + expires * 1_000));
    auth_event(app, "youtube", "connected", "", "", "");
}

#[tauri::command]
pub async fn youtube_logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        finish_local_logout(
            forget_youtube_session,
            || {},
            || auth_event(&app, "youtube", "loggedout", "", "", ""),
        )
    })
    .await
    .map_err(|_| Msg::VaultDeleteFailed.now())?
}

// Cache chat resolution to conserve YouTube API quota.
static YT_TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);
static YT_CHAT: Mutex<Option<(String, u64)>> = Mutex::new(None);
static YT_REFRESH_LOCK: Mutex<()> = Mutex::new(());

pub fn youtube_token(app: &AppHandle) -> Option<String> {
    // Serialize refresh and logout so an in-flight refresh cannot recreate deleted tokens.
    let _guard = YT_REFRESH_LOCK.lock().ok()?;
    let now = now_ms();
    if let Some((t, exp)) = &*YT_TOKEN.lock().unwrap() {
        if *exp > now + 30_000 {
            return Some(t.clone());
        }
    }
    let cfg = oauth(app);
    let refresh = keys::get_key("youtube_refresh")?;
    let mode = keys::get_key("youtube_oauth_mode");
    let byok =
        mode.as_deref() == Some("byok") || (mode.is_none() && !cfg.google_client_secret.is_empty());
    let form = youtube_refresh_form(
        &cfg.google_client_id,
        &refresh,
        byok.then_some(cfg.google_client_secret.as_str()),
    );
    let v = post_form("https://oauth2.googleapis.com/token", &form).ok()?;
    let access = v.get("access_token").and_then(|x| x.as_str())?.to_string();
    let exp = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600);
    if let Some(rotated) = v.get("refresh_token").and_then(|x| x.as_str()) {
        if !rotated.is_empty() {
            let _ = keys::set_key("youtube_refresh", rotated);
        }
    }
    *YT_TOKEN.lock().unwrap() = Some((access.clone(), now + exp * 1000));
    let _ = keys::set_key("youtube_oauth", &access);
    Some(access)
}

fn youtube_live_chat_id(token: &str) -> Option<String> {
    let now = now_ms();
    if let Some((id, exp)) = &*YT_CHAT.lock().unwrap() {
        if *exp > now {
            return Some(id.clone());
        }
    }
    let body = ureq::get(
        "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=active&broadcastType=all",
    )
    .set("Authorization", &format!("Bearer {token}"))
    .timeout(Duration::from_secs(10))
    .call()
    .ok()?
    .into_string()
    .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    let id = v
        .get("items")?
        .as_array()?
        .first()?
        .get("snippet")?
        .get("liveChatId")?
        .as_str()?
        .to_string();
    *YT_CHAT.lock().unwrap() = Some((id.clone(), now + 5 * 60 * 1000));
    Some(id)
}

pub fn youtube_send(app: &AppHandle, text: &str) -> Result<(), String> {
    let token = youtube_token(app).ok_or_else(|| Msg::ChatYoutubeNotSignedIn.now())?;
    let chat_id = youtube_live_chat_id(&token).ok_or_else(|| Msg::ChatYoutubeNoActiveLive.now())?;
    let body = json!({
        "snippet": {
            "liveChatId": chat_id,
            "type": "textMessageEvent",
            "textMessageDetails": { "messageText": text }
        }
    });
    let res = google_json(
        "POST",
        "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
        &token,
        Some(&body),
    );
    if res.is_err() {
        *YT_CHAT.lock().unwrap() = None; // Resolve again if the broadcast has changed or ended.
    }
    res.map(|_| ())
}

/// Public errors never contain provider bodies or URLs.
fn google_json(
    method: &str,
    url: &str,
    token: &str,
    body: Option<&Value>,
) -> Result<String, String> {
    google_json_typed(method, url, token, body).map_err(GoogleError::message)
}

fn google_json_typed(
    method: &str,
    url: &str,
    token: &str,
    body: Option<&Value>,
) -> Result<String, GoogleError> {
    let req = match method {
        "POST" => ureq::post(url),
        "PUT" => ureq::request("PUT", url),
        "DELETE" => ureq::delete(url),
        _ => ureq::get(url),
    }
    .set("Authorization", &format!("Bearer {token}"))
    .timeout(Duration::from_secs(12));
    let res = match body {
        Some(b) => req
            .set("Content-Type", "application/json")
            .send_string(&b.to_string()),
        None => req.call(),
    };
    match res {
        Ok(r) => r.into_string().map_err(|_| GoogleError::InvalidResponse),
        Err(ureq::Error::Status(c, r)) => Err(GoogleError::response(c, r.into_reader())),
        Err(_) => Err(GoogleError::Transport),
    }
}

fn helix(token: &str, client_id: &str, url: &str) -> Option<Value> {
    let body = ureq::get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Client-Id", client_id)
        .timeout(Duration::from_secs(10))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    serde_json::from_str(&body).ok()
}

fn helix_user_id(token: &str, client_id: &str, login: &str) -> Option<String> {
    let v = helix(
        token,
        client_id,
        &format!("https://api.twitch.tv/helix/users?login={login}"),
    )?;
    Some(
        v.get("data")?
            .as_array()?
            .first()?
            .get("id")?
            .as_str()?
            .to_string(),
    )
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
        match src.platform.as_str() {
            "twitch" => twitch_moderate(
                &app, &src.value, &action, native_id, author, author_id, seconds,
            ),
            "youtube" => youtube_moderate(&app, &action, native_id),
            "kick" => kick_moderate(&app, &action, native_id),
            _ => Err(Msg::ModeratePlatformUnsupported.now()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn twitch_moderate(
    app: &AppHandle,
    channel: &str,
    action: &str,
    native_id: Option<String>,
    author: Option<String>,
    author_id: Option<String>,
    seconds: Option<u64>,
) -> Result<(), String> {
    let token = twitch_token(app).ok_or_else(|| Msg::ModerateTwitchSignInFirst.now())?;
    let client_id = oauth(app).twitch_client_id;
    let info = twitch_validate(&token).ok_or_else(|| Msg::AuthTwitchTokenInvalid.now())?;
    let chan = channel.trim().trim_start_matches('#').to_lowercase();
    let broadcaster = helix_user_id(&token, &client_id, &chan)
        .ok_or_else(|| Msg::ModerateTwitchChannelNotFound.now())?;
    let mod_id = info.user_id;

    let run = |method: &str, url: String, body: Option<Value>| -> Result<(), String> {
        let req = match method {
            "DELETE" => ureq::delete(&url),
            _ => ureq::post(&url),
        }
        .set("Authorization", &format!("Bearer {token}"))
        .set("Client-Id", &client_id)
        .timeout(Duration::from_secs(12));
        let res = match &body {
            Some(b) => req
                .set("Content-Type", "application/json")
                .send_string(&b.to_string()),
            None => req.call(),
        };
        match res {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(c, r)) => Err(Msg::AuthTwitchApiError {
                c,
                body: &r.into_string().unwrap_or_default(),
            }
            .now()),
            Err(e) => Err(Msg::AuthTwitchTransportError { e: &e.to_string() }.now()),
        }
    };

    match action {
        "delete" => {
            let mid = native_id.ok_or_else(|| Msg::ModerateNoMessageId.now())?;
            run(
                "DELETE",
                format!(
                    "https://api.twitch.tv/helix/moderation/chat?broadcaster_id={broadcaster}&moderator_id={mod_id}&message_id={mid}"
                ),
                None,
            )
        }
        "timeout" | "ban" => {
            // Prefer the IRC user ID; resolve by login only when it is absent.
            let target = match author_id {
                Some(id) if !id.trim().is_empty() => id,
                _ => {
                    let a = author
                        .ok_or_else(|| Msg::ModerateNoUser.now())?
                        .to_lowercase();
                    helix_user_id(&token, &client_id, &a)
                        .ok_or_else(|| Msg::ModerateUserNotFound.now())?
                }
            };
            let data = if action == "timeout" {
                json!({ "data": { "user_id": target, "duration": seconds.unwrap_or(600) } })
            } else {
                json!({ "data": { "user_id": target } })
            };
            run(
                "POST",
                format!(
                    "https://api.twitch.tv/helix/moderation/bans?broadcaster_id={broadcaster}&moderator_id={mod_id}"
                ),
                Some(data),
            )
        }
        _ => Err(Msg::ModerateInvalidAction.now()),
    }
}

fn youtube_moderate(
    app: &AppHandle,
    action: &str,
    native_id: Option<String>,
) -> Result<(), String> {
    let token = youtube_token(app).ok_or_else(|| Msg::ModerateYoutubeSignInFirst.now())?;
    match action {
        "delete" => {
            let id = native_id.ok_or_else(|| Msg::ModerateNoMessageId.now())?;
            google_json(
                "DELETE",
                &format!("https://www.googleapis.com/youtube/v3/liveChat/messages?id={id}"),
                &token,
                None,
            )
            .map(|_| ())
        }
        // Bans/timeouts require an author channel ID that this feed does not provide.
        _ => Err(Msg::ModerateYoutubeDeleteOnly.now()),
    }
}

static KICK_IDS: Mutex<BTreeMap<String, i64>> = Mutex::new(BTreeMap::new());
const KICK_ID_CACHE_CAP: usize = 64;

/// PKCE and anti-CSRF state require OS randomness, not timestamps or process IDs.
fn rand_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS RNG unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn pct(s: &str) -> String {
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

#[tauri::command]
pub fn kick_login_start(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        let broker = refresh_broker_config(&app);
        let cfg = oauth(&app);
        if cfg.kick_client_id.is_empty()
            || (!cfg.kick_brokered && cfg.kick_client_secret.is_empty())
        {
            let reason = broker
                .err()
                .unwrap_or_else(|| Msg::AuthKickServerNotEnabled.now());
            return auth_event(
                &app,
                "kick",
                "error",
                "",
                "",
                &Msg::AuthOfficialUnavailable { reason: &reason }.now(),
            );
        }
        let verifier = rand_token();
        let challenge = pkce_challenge(&verifier);
        let state = rand_token();
        let redirect = format!("http://localhost:{KICK_PORT}/callback");
        // Bind before opening the browser; Windows localhost may resolve to IPv4 or IPv6.
        let mut listeners = Vec::new();
        for ip in [
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V6(Ipv6Addr::LOCALHOST),
        ] {
            if let Ok(l) = TcpListener::bind(SocketAddr::new(ip, KICK_PORT)) {
                let _ = l.set_nonblocking(true);
                listeners.push(l);
            }
        }
        if listeners.is_empty() {
            return auth_event(
                &app,
                "kick",
                "error",
                "",
                "",
                &Msg::AuthKickPortBusy { port: KICK_PORT }.now(),
            );
        }
        let url = format!(
            "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
            pct(&cfg.kick_client_id),
            pct(&redirect),
            pct(KICK_SCOPES),
            pct(&challenge),
            pct(&state),
        );
        auth_code_event(&app, "kick", "", &url, &url);
        match oauth_wait(&listeners, &state, "Kick") {
            Ok(code) => match kick_exchange(&app, &cfg, &code, &verifier, &redirect) {
                Ok(()) => {
                    let login = kick_whoami(&app).unwrap_or_default();
                    auth_event(&app, "kick", "connected", "", "", &login);
                }
                Err(e) => auth_event(&app, "kick", "error", "", "", &e),
            },
            Err(e) => auth_event(&app, "kick", "error", "", "", &e),
        }
    });
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

fn oauth_wait(
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

fn kick_exchange(
    app: &AppHandle,
    cfg: &OauthConfig,
    code: &str,
    verifier: &str,
    redirect: &str,
) -> Result<(), String> {
    let brokered = cfg.kick_brokered;
    let v = if brokered {
        let url = setup_url(cfg, "/api/v1/oauth/kick/exchange")
            .ok_or_else(|| Msg::AuthKickBrokerNotConfigured.now())?;
        post_setup_json(
            app,
            &url,
            &json!({
                "code": code,
                "codeVerifier": verifier,
                "redirectUri": redirect,
            }),
        )
        .map_err(|(status, body)| {
            broker_error(app, status, &body, &Msg::AuthKickLoginFailed.now())
        })?
    } else {
        post_form(
            "https://id.kick.com/oauth/token",
            &[
                ("grant_type", "authorization_code"),
                ("client_id", cfg.kick_client_id.as_str()),
                ("client_secret", cfg.kick_client_secret.as_str()),
                ("redirect_uri", redirect),
                ("code_verifier", verifier),
                ("code", code),
            ],
        )
        .map_err(|(status, _)| Msg::AuthKickLoginRefused { status }.now())?
    };
    let access = v
        .get(if brokered {
            "accessToken"
        } else {
            "access_token"
        })
        .and_then(|x| x.as_str())
        .ok_or_else(|| Msg::AuthKickEmptyToken.now())?;
    keys::set_key("kick_oauth", access)?;
    let refresh = v
        .get(if brokered {
            "refreshToken"
        } else {
            "refresh_token"
        })
        .and_then(|x| x.as_str())
        .unwrap_or("");
    if refresh.is_empty() {
        let _ = keys::clear_key("kick_oauth");
        return Err(Msg::AuthKickNoRefreshableSession.now());
    }
    keys::set_key("kick_refresh", refresh)?;
    keys::set_key("kick_oauth_mode", if brokered { "broker" } else { "byok" })?;
    Ok(())
}

#[tauri::command]
pub async fn kick_logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        finish_local_logout(
            forget_kick_session,
            || {},
            || auth_event(&app, "kick", "loggedout", "", "", ""),
        )
    })
    .await
    .map_err(|_| Msg::VaultDeleteFailed.now())?
}

// Serialize rotating refresh tokens to avoid consuming the same token twice.
static KICK_REFRESH_LOCK: Mutex<()> = Mutex::new(());

fn kick_refresh(app: &AppHandle) -> Option<String> {
    let cfg = oauth(app);
    let refresh = keys::get_key("kick_refresh")?;
    let _guard = KICK_REFRESH_LOCK.lock().unwrap();
    // Re-read under the lock: another refresh may already have replaced this token.
    let current = keys::get_key("kick_refresh")?;
    if current != refresh {
        return keys::get_key("kick_oauth");
    }
    let brokered = keys::get_key("kick_oauth_mode").as_deref() == Some("broker");
    let result = if brokered {
        let url = setup_url(&cfg, "/api/v1/oauth/kick/refresh")?;
        post_setup_json(app, &url, &json!({ "refreshToken": current.as_str() }))
    } else {
        post_form(
            "https://id.kick.com/oauth/token",
            &[
                ("grant_type", "refresh_token"),
                ("refresh_token", current.as_str()),
                ("client_id", cfg.kick_client_id.as_str()),
                ("client_secret", cfg.kick_client_secret.as_str()),
            ],
        )
    };
    let v = match result {
        Ok(v) => v,
        Err((code, e)) => {
            let _ = record_broker_failure(app, &e, "oauth_refresh_failed");
            // Preserve the session on transport/server failures; invalidate only rejected refresh tokens.
            let broker_dead = e
                .get("error")
                .and_then(|x| x.get("code"))
                .and_then(|x| x.as_str())
                == Some("OAUTH_SESSION_EXPIRED");
            let dead = code == 400
                || code == 401
                || broker_dead
                || e.get("error").and_then(|x| x.as_str()) == Some("invalid_grant");
            // Do not delete a newer token installed by a concurrent login.
            if dead && keys::get_key("kick_refresh").as_deref() == Some(current.as_str()) {
                let deleted = keys::clear_keys(&["kick_refresh", "kick_oauth", "kick_oauth_mode"]);
                KICK_IDS.lock().unwrap().clear();
                match deleted {
                    Ok(()) => auth_event(app, "kick", "loggedout", "", "", ""),
                    Err(error) => auth_event(app, "kick", "error", "", "", &error),
                }
            }
            return None;
        }
    };
    let access = v
        .get(if brokered {
            "accessToken"
        } else {
            "access_token"
        })
        .and_then(|x| x.as_str())?
        .to_string();
    let _ = keys::set_key("kick_oauth", &access);
    if let Some(r) = v
        .get(if brokered {
            "refreshToken"
        } else {
            "refresh_token"
        })
        .and_then(|x| x.as_str())
    {
        let _ = keys::set_key("kick_refresh", r);
    }
    Some(access)
}

/// Best-effort detached refresh before go-live; broker failure must not delay or reject stream startup.
pub fn warm_kick_session(app: &AppHandle) {
    if !keys::has_key("kick_refresh") {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = kick_refresh(&app);
    });
}

fn kick_api(
    app: &AppHandle,
    method: &str,
    url: &str,
    body: Option<&Value>,
) -> Result<String, String> {
    let mut token = keys::get_key("kick_oauth").ok_or_else(|| Msg::AuthKickSignInFirst.now())?;
    for attempt in 0..2 {
        let req = match method {
            "POST" => ureq::post(url),
            "PATCH" => ureq::request("PATCH", url),
            "DELETE" => ureq::delete(url),
            _ => ureq::get(url),
        }
        .set("Authorization", &format!("Bearer {token}"))
        .timeout(Duration::from_secs(12));
        let res = match body {
            Some(b) => req
                .set("Content-Type", "application/json")
                .send_string(&b.to_string()),
            None => req.call(),
        };
        match res {
            Ok(r) => return Ok(r.into_string().unwrap_or_default()),
            Err(ureq::Error::Status(401, _)) if attempt == 0 => {
                token = kick_refresh(app).ok_or_else(|| Msg::AuthKickSessionExpired.now())?;
            }
            Err(ureq::Error::Status(c, r)) => {
                return Err(Msg::AuthKickApiError {
                    c,
                    body: &r.into_string().unwrap_or_default(),
                }
                .now());
            }
            Err(e) => return Err(Msg::AuthKickTransportError { e: &e.to_string() }.now()),
        }
    }
    Err(Msg::AuthKickStillFailingAfterRefresh.now())
}

fn kick_broadcaster_id(app: &AppHandle, slug: &str) -> Result<i64, String> {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return Err(Msg::AuthKickChannelHasNoName.now());
    }
    if let Some(id) = KICK_IDS.lock().unwrap().get(&slug) {
        return Ok(*id);
    }
    let body = kick_api(
        app,
        "GET",
        &format!(
            "https://api.kick.com/public/v1/channels?slug={}",
            pct(&slug)
        ),
        None,
    )?;
    let v: Value = serde_json::from_str(&body).map_err(|_| Msg::AuthKickBadResponse.now())?;
    let id = v
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("broadcaster_user_id"))
        .and_then(|x| x.as_i64())
        .ok_or_else(|| Msg::AuthKickChannelNotFound.now())?;
    let mut cache = KICK_IDS.lock().unwrap();
    if cache.len() >= KICK_ID_CACHE_CAP {
        cache.pop_first();
    }
    cache.insert(slug, id);
    Ok(id)
}

pub fn kick_send(app: &AppHandle, text: &str, slug: &str) -> Result<(), String> {
    let bid = kick_broadcaster_id(app, slug)?;
    let content: String = text.chars().take(500).collect();
    let body = json!({ "type": "user", "content": content, "broadcaster_user_id": bid });
    kick_api(
        app,
        "POST",
        "https://api.kick.com/public/v1/chat",
        Some(&body),
    )
    .map(|_| ())
}

fn kick_whoami(app: &AppHandle) -> Option<String> {
    let body = kick_api(app, "GET", "https://api.kick.com/public/v1/users", None).ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    let u = v.get("data")?.as_array()?.first()?;
    u.get("name")
        .or_else(|| u.get("username"))
        .or_else(|| u.get("slug"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

fn kick_moderate(app: &AppHandle, action: &str, native_id: Option<String>) -> Result<(), String> {
    match action {
        "delete" => {
            let id = native_id.ok_or_else(|| Msg::ModerateNoMessageId.now())?;
            kick_api(
                app,
                "DELETE",
                &format!("https://api.kick.com/public/v1/chat/{id}"),
                None,
            )
            .map(|_| ())
        }
        // Bans/timeouts require an author user ID; the Pusher feed only supplies a username.
        _ => Err(Msg::ModerateKickDeleteOnly.now()),
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
        let mut out = serde_json::Map::new();
        if keys::has_key("twitch_oauth") {
            out.insert(
                "twitch".into(),
                result_json(twitch_set_info(&app, &title, &category)),
            );
        }
        if keys::has_key("youtube_refresh") {
            out.insert(
                "youtube".into(),
                result_json(youtube_set_title(&app, &title)),
            );
        }
        if keys::has_key("kick_refresh") {
            out.insert(
                "kick".into(),
                result_json(kick_set_info(&app, &title, &category)),
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

fn twitch_set_info(app: &AppHandle, title: &str, category: &str) -> Result<Option<String>, String> {
    let token = twitch_token(app).ok_or_else(|| Msg::StreamInfoTwitchSignIn.now())?;
    let client_id = oauth(app).twitch_client_id;
    let info = twitch_validate(&token).ok_or_else(|| Msg::AuthTwitchTokenInvalid.now())?;
    let mut body = json!({ "title": title.chars().take(140).collect::<String>() });
    let mut warn = None;
    if !category.is_empty() {
        match twitch_game_id(&token, &client_id, category) {
            Some(gid) => body["game_id"] = json!(gid),
            None => warn = Some(Msg::StreamInfoCategoryNotFound { category }.now()),
        }
    }
    let url = format!(
        "https://api.twitch.tv/helix/channels?broadcaster_id={}",
        info.user_id
    );
    match ureq::request("PATCH", &url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Client-Id", &client_id)
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(12))
        .send_string(&body.to_string())
    {
        Ok(_) => Ok(warn),
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
            Err(Msg::StreamInfoTwitchMissingScope.now())
        }
        Err(ureq::Error::Status(c, r)) => Err(Msg::AuthTwitchApiError {
            c,
            body: &r.into_string().unwrap_or_default(),
        }
        .now()),
        Err(e) => Err(Msg::AuthTwitchTransportError { e: &e.to_string() }.now()),
    }
}

fn twitch_game_id(token: &str, client_id: &str, name: &str) -> Option<String> {
    let v = helix(
        token,
        client_id,
        &format!(
            "https://api.twitch.tv/helix/search/categories?query={}&first=1",
            pct(name)
        ),
    )?;
    Some(
        v.get("data")?
            .as_array()?
            .first()?
            .get("id")?
            .as_str()?
            .to_string(),
    )
}

fn youtube_set_title(app: &AppHandle, title: &str) -> Result<Option<String>, String> {
    let token = youtube_token(app).ok_or_else(|| Msg::StreamInfoYoutubeSignIn.now())?;
    let vid = youtube_active_video_id(&token)
        .ok_or_else(|| Msg::StreamInfoYoutubeNoActiveBroadcast.now())?;
    // Updates replace the snippet; preserve description, tags, and other fields.
    let body = google_json(
        "GET",
        &format!("https://www.googleapis.com/youtube/v3/videos?part=snippet&id={vid}"),
        &token,
        None,
    )?;
    let v: Value = serde_json::from_str(&body).map_err(|_| Msg::AuthYoutubeBadResponse.now())?;
    let mut snippet = v
        .get("items")
        .and_then(|i| i.as_array())
        .and_then(|a| a.first())
        .and_then(|x| x.get("snippet"))
        .cloned()
        .ok_or_else(|| Msg::StreamInfoYoutubeVideoNotFound.now())?;
    let cut = title.chars().count() > 100;
    snippet["title"] = json!(title.chars().take(100).collect::<String>());
    // categoryId is required; preserve it or use Entertainment (24) as fallback.
    if snippet
        .get("categoryId")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .is_empty()
    {
        snippet["categoryId"] = json!("24");
    }
    let put = json!({ "id": vid, "snippet": snippet });
    google_json(
        "PUT",
        "https://www.googleapis.com/youtube/v3/videos?part=snippet",
        &token,
        Some(&put),
    )
    .map(|_| {
        if cut {
            Some(Msg::StreamInfoYoutubeTitleTruncated.now())
        } else {
            None
        }
    })
}

fn youtube_active_video_id(token: &str) -> Option<String> {
    let body = ureq::get(
        "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id&broadcastStatus=active&broadcastType=all",
    )
    .set("Authorization", &format!("Bearer {token}"))
    .timeout(Duration::from_secs(10))
    .call()
    .ok()?
    .into_string()
    .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.get("items")?
        .as_array()?
        .first()?
        .get("id")?
        .as_str()
        .map(|s| s.to_string())
}

fn kick_set_info(app: &AppHandle, title: &str, category: &str) -> Result<Option<String>, String> {
    let mut body = json!({ "stream_title": title.chars().take(255).collect::<String>() });
    let mut warn = None;
    if !category.is_empty() {
        match kick_category_id(app, category) {
            Some(cid) => body["category_id"] = json!(cid),
            None => warn = Some(Msg::StreamInfoCategoryNotFound { category }.now()),
        }
    }
    match kick_api(
        app,
        "PATCH",
        "https://api.kick.com/public/v1/channels",
        Some(&body),
    ) {
        Ok(_) => Ok(warn),
        // Classification depends on the language-independent "Kick {status}:" error prefix.
        Err(e) if e.contains("Kick 401") || e.contains("Kick 403") => {
            Err(Msg::StreamInfoKickMissingScope.now())
        }
        Err(e) => Err(e),
    }
}

fn kick_category_id(app: &AppHandle, name: &str) -> Option<i64> {
    let body = kick_api(
        app,
        "GET",
        &format!(
            "https://api.kick.com/public/v2/categories?name={}",
            pct(name)
        ),
        None,
    )
    .ok()?;
    let v: Value = serde_json::from_str(&body).ok()?;
    v.get("data")?.as_array()?.first()?.get("id")?.as_i64()
}

/// UTC conversion uses Howard Hinnant's civil_from_days algorithm.
fn rfc3339_utc(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y0 = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y0 + 1 } else { y0 };
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

fn youtube_reusable_stream(token: &str) -> Result<(String, String, String), BroadcastError> {
    if let (Some(id), Some(addr), Some(key)) = (
        keys::read_key("youtube_stream_id").map_err(|_| BroadcastError::Vault)?,
        keys::read_key("youtube_ingest_addr").map_err(|_| BroadcastError::Vault)?,
        keys::read_key("youtube_stream_key").map_err(|_| BroadcastError::Vault)?,
    ) {
        if !id.is_empty() && !addr.is_empty() && !key.is_empty() {
            return Ok((id, addr, key));
        }
    }
    let body = json!({
        "snippet": { "title": "Corneta — ingest" },
        "cdn": { "ingestionType": "rtmp", "resolution": "variable", "frameRate": "variable" },
        "contentDetails": { "isReusable": true }
    });
    let resp = google_json_typed(
        "POST",
        "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails",
        token,
        Some(&body),
    )?;
    let v: Value = serde_json::from_str(&resp).map_err(|_| GoogleError::InvalidResponse)?;
    let id = v
        .get("id")
        .and_then(|x| x.as_str())
        .filter(|id| youtube_broadcast::valid_id(id))
        .ok_or(GoogleError::InvalidResponse)?
        .to_string();
    let info = v
        .get("cdn")
        .and_then(|c| c.get("ingestionInfo"))
        .ok_or(GoogleError::InvalidResponse)?;
    let addr = info
        .get("ingestionAddress")
        .and_then(|x| x.as_str())
        .ok_or(GoogleError::InvalidResponse)?
        .to_string();
    let key = info
        .get("streamName")
        .and_then(|x| x.as_str())
        .ok_or(GoogleError::InvalidResponse)?
        .to_string();
    // ID is the commit marker for the three legacy cache slots; never pair a new key with an old ID.
    keys::clear_key("youtube_stream_id").map_err(|_| BroadcastError::Vault)?;
    keys::set_key("youtube_ingest_addr", &addr).map_err(|_| BroadcastError::Vault)?;
    keys::set_key("youtube_stream_key", &key).map_err(|_| BroadcastError::Vault)?;
    keys::set_key("youtube_stream_id", &id).map_err(|_| BroadcastError::Vault)?;
    Ok((id, addr, key))
}

fn youtube_bind(token: &str, broadcast_id: &str, stream_id: &str) -> Result<(), GoogleError> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id={}&streamId={}&part=id,contentDetails", pct(broadcast_id), pct(stream_id)
    );
    google_json_typed("POST", &url, token, None).map(|_| ())
}

static YT_BROADCAST: Mutex<YoutubeRecovery> = Mutex::new(YoutubeRecovery::new());

struct YoutubeBroadcastStore;
impl youtube_broadcast::Store for YoutubeBroadcastStore {
    fn read(&mut self) -> Result<Option<String>, ()> {
        keys::read_key("youtube_live_broadcast").map_err(|_| ())
    }
    fn write(&mut self, value: &str) -> Result<(), ()> {
        keys::set_key("youtube_live_broadcast", value).map_err(|_| ())
    }
    fn clear(&mut self) -> Result<(), ()> {
        keys::clear_key("youtube_live_broadcast").map_err(|_| ())
    }
}

struct YoutubeBroadcastRemote {
    token: Option<String>,
}
impl YoutubeBroadcastRemote {
    fn token(&self) -> Result<&str, BroadcastError> {
        self.token.as_deref().ok_or(BroadcastError::SignIn)
    }
}

fn youtube_remote_state(value: &Value, expected_id: &str) -> Result<RemoteState, GoogleError> {
    if value.get("id").and_then(Value::as_str) != Some(expected_id) {
        return Err(GoogleError::InvalidResponse);
    }
    match value
        .pointer("/status/lifeCycleStatus")
        .and_then(Value::as_str)
    {
        Some("created") => Ok(RemoteState::Created),
        Some("ready") => Ok(RemoteState::Ready),
        Some("live") => Ok(RemoteState::Live),
        Some("testing") => Ok(RemoteState::Testing),
        Some("complete") => Ok(RemoteState::Complete),
        Some("revoked") => Ok(RemoteState::Revoked),
        Some("liveStarting" | "testStarting") => Ok(RemoteState::Starting),
        _ => Err(GoogleError::InvalidResponse),
    }
}

impl youtube_broadcast::Remote for YoutubeBroadcastRemote {
    fn create(&mut self, title: &str) -> Result<String, BroadcastError> {
        let token = self.token()?;
        let start = rfc3339_utc(now_ms() / 1000 + 60); // YouTube requires a future scheduled start.
        let title: String = title.chars().take(100).collect();
        // Disable auto-stop so a long interruption remains recoverable; stop explicitly instead.
        let body = json!({
            "snippet": { "title": title, "scheduledStartTime": start },
            "status": { "privacyStatus": "public", "selfDeclaredMadeForKids": false },
            "contentDetails": {
                "enableAutoStart": true,
                "enableAutoStop": false,
                "monitorStream": { "enableMonitorStream": false }
            }
        });
        let resp = google_json_typed(
        "POST",
        "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
        token,
        Some(&body),
    )?;
        let v: Value = serde_json::from_str(&resp).map_err(|_| GoogleError::InvalidResponse)?;
        let broadcast_id = v
            .get("id")
            .and_then(|x| x.as_str())
            .filter(|id| youtube_broadcast::valid_id(id))
            .ok_or(GoogleError::InvalidResponse)?
            .to_string();
        Ok(broadcast_id)
    }

    fn status(&mut self, id: &str) -> Result<RemoteState, BroadcastError> {
        let url = format!(
            "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,status&id={}",
            pct(id)
        );
        let body = match google_json_typed("GET", &url, self.token()?, None) {
            Ok(body) => body,
            Err(error) if error.is_missing_broadcast() => return Ok(RemoteState::Missing),
            Err(error) => return Err(error.into()),
        };
        let value: Value = serde_json::from_str(&body).map_err(|_| GoogleError::InvalidResponse)?;
        let items = value
            .get("items")
            .and_then(Value::as_array)
            .ok_or(GoogleError::InvalidResponse)?;
        match items.as_slice() {
            [] => Ok(RemoteState::Missing),
            [item] => youtube_remote_state(item, id).map_err(Into::into),
            _ => Err(GoogleError::InvalidResponse.into()),
        }
    }

    fn complete(&mut self, id: &str) -> Result<RemoteState, BroadcastError> {
        let url = format!("https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id={}&part=id,status", pct(id));
        let body = match google_json_typed("POST", &url, self.token()?, None) {
            Ok(body) => body,
            Err(error) if error.is_missing_broadcast() => return Ok(RemoteState::Missing),
            Err(error) => return Err(error.into()),
        };
        let value: Value = serde_json::from_str(&body).map_err(|_| GoogleError::InvalidResponse)?;
        youtube_remote_state(&value, id).map_err(Into::into)
    }

    fn connect(&mut self, broadcast_id: &str) -> Result<(String, String), BroadcastError> {
        let token = self.token()?;
        // Recreate the stream only after confirmed absence, never on a transient error.
        let (mut sid, mut addr, mut key) = youtube_reusable_stream(token)?;
        if let Err(e) = youtube_bind(token, broadcast_id, &sid) {
            if !e.is_missing_stream() {
                return Err(e.into());
            }
            keys::clear_keys(&[
                "youtube_stream_id",
                "youtube_ingest_addr",
                "youtube_stream_key",
            ])
            .map_err(|_| BroadcastError::Vault)?;
            let s = youtube_reusable_stream(token)?;
            sid = s.0;
            addr = s.1;
            key = s.2;
            youtube_bind(token, broadcast_id, &sid)?;
        }
        Ok((addr, key))
    }
}

/// Serializes creation/recovery; forgets the ID only after remote and vault acknowledgment.
pub fn youtube_provision_broadcast(
    app: &AppHandle,
    title: &str,
    generation: u64,
) -> Result<(String, String), String> {
    let mut recovery = YT_BROADCAST
        .lock()
        .map_err(|_| BroadcastError::Pending.message())?;
    let current = || {
        let state = app.state::<AppState>();
        let engine = state.engine.lock().unwrap();
        engine.live && engine.start_gen == generation
    };
    if !current() {
        return Err(BroadcastError::Cancelled.message());
    }
    let mut remote = YoutubeBroadcastRemote {
        token: youtube_token(app),
    };
    recovery
        .provision(
            generation,
            current,
            &mut YoutubeBroadcastStore,
            &mut remote,
            title,
        )
        .map_err(BroadcastError::message)
}

pub fn youtube_complete_active(app: &AppHandle, generation: u64) -> Result<(), String> {
    let mut recovery = YT_BROADCAST
        .lock()
        .map_err(|_| BroadcastError::Pending.message())?;
    // A stop queued behind a newer start must never finish the new broadcast.
    if app.state::<AppState>().engine.lock().unwrap().start_gen != generation {
        return Ok(());
    }
    match recovery
        .status(&mut YoutubeBroadcastStore)
        .map_err(BroadcastError::message)?
    {
        "none" => return Ok(()),
        "unknown" => return Err(BroadcastError::CreationUnknown.message()),
        _ => {}
    }
    let mut remote = YoutubeBroadcastRemote {
        token: youtube_token(app),
    };
    recovery
        .stop(generation, &mut YoutubeBroadcastStore, &mut remote)
        .map_err(BroadcastError::message)
}

#[tauri::command]
pub async fn youtube_acknowledge_unknown_broadcast(
    app: AppHandle,
    confirmed: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut recovery = YT_BROADCAST
            .lock()
            .map_err(|_| BroadcastError::Pending.message())?;
        let state = app.state::<AppState>();
        let engine = state.engine.lock().unwrap();
        recovery
            .acknowledge_unknown(confirmed, !engine.live, &mut YoutubeBroadcastStore)
            .map_err(BroadcastError::message)
    })
    .await
    .map_err(|_| BroadcastError::Pending.message())?
}

#[tauri::command]
pub async fn youtube_broadcast_recovery_status() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        YT_BROADCAST
            .lock()
            .map_err(|_| BroadcastError::Pending.message())?
            .status(&mut YoutubeBroadcastStore)
            .map(str::to_string)
            .map_err(BroadcastError::message)
    })
    .await
    .map_err(|_| BroadcastError::Pending.message())?
}

#[tauri::command]
pub async fn youtube_retry_broadcast_cleanup(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut recovery = YT_BROADCAST
            .lock()
            .map_err(|_| BroadcastError::Pending.message())?;
        match recovery
            .status(&mut YoutubeBroadcastStore)
            .map_err(BroadcastError::message)?
        {
            "none" => return Ok(()),
            "unknown" => return Err(BroadcastError::CreationUnknown.message()),
            _ => {}
        }
        let state = app.state::<AppState>();
        let activity = {
            let engine = state.engine.lock().unwrap();
            if engine.live {
                return Err(BroadcastError::Pending.message());
            }
            engine.begin_pending_activity()
        };
        let mut remote = YoutubeBroadcastRemote {
            token: youtube_token(&app),
        };
        // A concurrent start waits on YT_BROADCAST before it can create or bind anything.
        let result = recovery
            .retry_stopped(true, &mut YoutubeBroadcastStore, &mut remote)
            .map_err(BroadcastError::message);
        drop(activity);
        result
    })
    .await
    .map_err(|_| BroadcastError::Pending.message())?
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn youtube_status_requires_matching_identity_and_known_lifecycle() {
        assert_eq!(
            youtube_remote_state(
                &json!({"id": "old-id", "status": {"lifeCycleStatus": "complete"}}),
                "old-id"
            ),
            Ok(RemoteState::Complete)
        );
        for value in [
            json!({}),
            json!({"id": "new-id", "status": {"lifeCycleStatus": "complete"}}),
            json!({"id": "old-id", "status": {"lifeCycleStatus": "private-fixture"}}),
        ] {
            assert_eq!(
                youtube_remote_state(&value, "old-id"),
                Err(GoogleError::InvalidResponse)
            );
        }
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
    fn rfc3339_known_instants() {
        assert_eq!(rfc3339_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339_utc(1_700_000_000), "2023-11-14T22:13:20Z");
    }

    #[test]
    fn google_oauth_err_classifies() {
        // Pass locale explicitly because other tests can change the process-wide value.
        let pt = Locale::PtBr;
        let e = serde_json::json!({ "error": "invalid_client" });
        assert!(google_oauth_err(401, &e, pt).contains("cliente OAuth"));
        assert!(google_oauth_err(401, &e, Locale::En).contains("OAuth client"));
        assert!(google_oauth_err(0, &serde_json::json!({}), pt).contains("sem conexão"));
        let e2 = serde_json::json!({ "error": "token=private-fixture", "error_description": "https://user:private-fixture@example.invalid" });
        for locale in [Locale::PtBr, Locale::En] {
            let message = google_oauth_err(400, &e2, locale);
            assert!(!message.contains("private-fixture"));
            assert!(!message.contains("https://"));
            assert!(message.contains("400"));
        }
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
    fn youtube_mode_round_trips_without_losing_either_flow() {
        let own = || Some(("meu-id".to_string(), "meu-secret".to_string()));
        let mut config = OauthConfig {
            youtube_official_id: "oficial".into(),
            ..Default::default()
        };

        resolve_youtube_mode(&mut config, own(), Some("byok"));
        assert_eq!(config.google_client_id, "meu-id");
        assert_eq!(config.google_client_secret, "meu-secret");
        assert!(!config.youtube_direct);

        resolve_youtube_mode(&mut config, own(), Some("official"));
        assert_eq!(config.google_client_id, "oficial");
        assert!(config.google_client_secret.is_empty());
        assert!(config.youtube_direct);

        resolve_youtube_mode(&mut config, own(), Some("byok"));
        assert_eq!(config.google_client_id, "meu-id");
        assert!(!config.youtube_direct);
    }

    #[test]
    fn youtube_without_official_id_has_no_direct_flow() {
        let mut config = OauthConfig::default();
        resolve_youtube_mode(&mut config, None, Some("official"));
        assert!(!config.youtube_direct);
        assert!(config.google_client_id.is_empty());
    }

    #[test]
    fn official_youtube_never_sends_a_client_secret() {
        let official =
            youtube_official_exchange_form("id", "code", "verifier", "http://127.0.0.1:1");
        assert!(!official.iter().any(|(k, _)| *k == "client_secret"));
        assert!(official
            .iter()
            .any(|(k, v)| *k == "code_verifier" && *v == "verifier"));

        let device = youtube_device_poll_form("id", "segredo", "device");
        assert!(device
            .iter()
            .any(|(k, v)| *k == "client_secret" && *v == "segredo"));

        assert!(!youtube_refresh_form("id", "r", None)
            .iter()
            .any(|(k, _)| *k == "client_secret"));
        assert!(youtube_refresh_form("id", "r", Some("s"))
            .iter()
            .any(|(k, _)| *k == "client_secret"));
    }

    #[test]
    fn official_is_the_default_without_an_explicit_preference() {
        let mut config = OauthConfig {
            youtube_official_id: "oficial-yt".into(),
            kick_official_id: "oficial-kick".into(),
            kick_broker_ready: true,
            ..Default::default()
        };
        resolve_youtube_mode(&mut config, None, None);
        resolve_kick_mode(&mut config, None, None);
        assert!(
            config.youtube_direct,
            "New YouTube configuration uses official PKCE"
        );
        assert!(
            config.kick_brokered,
            "New Kick configuration uses the broker"
        );
        assert!(config.google_client_secret.is_empty());
        assert!(config.kick_client_secret.is_empty());

        resolve_youtube_mode(&mut config, Some(("meu".into(), "meu-secret".into())), None);
        assert!(!config.youtube_direct);
        assert_eq!(config.google_client_id, "meu");
    }

    #[test]
    fn kick_official_needs_the_broker() {
        let mut config = OauthConfig {
            kick_official_id: "oficial".into(),
            ..Default::default()
        };
        resolve_kick_mode(&mut config, None, None);
        assert!(!config.kick_brokered);

        config.kick_broker_ready = true;
        resolve_kick_mode(&mut config, None, None);
        assert!(config.kick_brokered);

        resolve_kick_mode(
            &mut config,
            Some(("id".into(), "secret".into())),
            Some("byok"),
        );
        assert!(!config.kick_brokered);
        assert_eq!(config.kick_client_secret, "secret");
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
}
