//! YouTube login (PKCE or device code), live chat sends, moderation, title, and the automatic broadcast.

use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::http_client as ureq;
use crate::i18n::{self, Locale, Msg};
use crate::keys;
use crate::AppState;

use super::broadcast as youtube_broadcast;
use super::broadcast::{Error as BroadcastError, Recovery as YoutubeRecovery, RemoteState};
use super::error::GoogleError;
use crate::auth::{
    auth_code_event, auth_event, byok_active, finish_local_logout, forget_account_channel, now_ms,
    oauth, oauth_wait, own_creds, pct, pkce_challenge, post_form, rand_token,
    refresh_broker_config, timeout_seconds, AccountChannel, OauthConfig, GRANT_DEVICE,
};

// This scope supports broadcasts/chat and the BYOK limited-input device flow.
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/youtube";
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

pub(crate) fn apply_youtube_mode(config: &mut OauthConfig) {
    let own = own_creds("youtube_client_id", "youtube_client_secret");
    let preference = keys::get_key("youtube_oauth_preference");
    resolve_youtube_mode(config, own, preference.as_deref());
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

/// Clears session tokens/caches, not saved OAuth client credentials.
fn forget_youtube_session() -> Result<(), String> {
    let _guard = YT_REFRESH_LOCK
        .lock()
        .map_err(|_| Msg::VaultDeleteFailed.now())?;
    finish_local_logout(
        // "youtube_oauth" held access tokens written by older versions; logout still purges it.
        || keys::clear_keys(&["youtube_refresh", "youtube_oauth", "youtube_oauth_mode"]),
        || {
            *YT_TOKEN.lock().unwrap() = None;
            *YT_CHAT.lock().unwrap() = None;
            forget_account_channel("youtube");
        },
        || {},
    )
}

fn youtube_mode_changed(app: &AppHandle) {
    // Release the config guard before emitting an auth event.
    apply_youtube_mode(&mut app.state::<AppState>().oauth.lock().unwrap());
    auth_event(app, "youtube", "loggedout", "", "", "");
}

pub(crate) fn set_youtube_oauth(
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
pub(crate) fn youtube_use_official(app: AppHandle) -> Result<(), String> {
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

pub(crate) fn youtube_use_own_creds(app: AppHandle) -> Result<(), String> {
    if own_creds("youtube_client_id", "youtube_client_secret").is_none() {
        return Err(Msg::AuthByokNoSavedCreds.now());
    }
    forget_youtube_session()?;
    keys::set_key("youtube_oauth_preference", "byok")?;
    youtube_mode_changed(&app);
    Ok(())
}

pub(crate) fn clear_youtube_oauth(app: AppHandle) -> Result<(), String> {
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

pub(crate) static YT_ACCOUNT_CHANNEL: Mutex<Option<AccountChannel>> = Mutex::new(None);

fn parse_youtube_account_channel(v: &Value) -> Option<AccountChannel> {
    let item = v.pointer("/items/0")?;
    let id = item
        .get("id")?
        .as_str()
        .filter(|id| id.len() == 24 && id.starts_with("UC"))?;
    let handle = item
        .pointer("/snippet/customUrl")
        .and_then(Value::as_str)
        .filter(|handle| handle.len() > 1 && handle.starts_with('@'));
    Some(match handle {
        Some(handle) => AccountChannel {
            platform: "youtube",
            value: handle.to_string(),
            aliases: vec![id.to_string()],
            name: String::new(),
        },
        None => AccountChannel {
            platform: "youtube",
            value: id.to_string(),
            aliases: Vec::new(),
            name: item
                .pointer("/snippet/title")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        },
    })
}

/// Costs one YouTube unit per login; the answer is kept until logout or the next login.
pub(crate) fn youtube_account_channel(app: &AppHandle) -> Option<AccountChannel> {
    if let Some(channel) = YT_ACCOUNT_CHANNEL.lock().unwrap().clone() {
        return Some(channel);
    }
    let token = youtube_token(app)?;
    let body = google_json(
        "GET",
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        &token,
        None,
    )
    .ok()?;
    let channel = parse_youtube_account_channel(&serde_json::from_str(&body).ok()?)?;
    *YT_ACCOUNT_CHANNEL.lock().unwrap() = Some(channel.clone());
    Some(channel)
}

pub(crate) fn youtube_login_start(app: AppHandle) {
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
                    // The refresh token is the persisted session; access tokens stay in memory.
                    let Some(refresh) = v
                        .get("refresh_token")
                        .and_then(|x| x.as_str())
                        .filter(|r| !r.is_empty())
                    else {
                        return auth_event(
                            &app,
                            "youtube",
                            "error",
                            "",
                            "",
                            &Msg::AuthGoogleNoRefreshableSession.now(),
                        );
                    };
                    // Announce success only after the vault has persisted the session.
                    if let Err(e) = keys::set_key("youtube_refresh", refresh) {
                        return auth_event(&app, "youtube", "error", "", "", &e);
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
    if let Err(error) = keys::set_key("youtube_refresh", refresh) {
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

pub(crate) fn youtube_logout(app: &AppHandle) -> Result<(), String> {
    finish_local_logout(
        forget_youtube_session,
        || {},
        || auth_event(app, "youtube", "loggedout", "", "", ""),
    )
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

fn youtube_channel_id(id: &str) -> Option<&str> {
    let id = id.trim();
    (id.len() == 24
        && id.starts_with("UC")
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
    .then_some(id)
}

fn youtube_ban_body(chat_id: &str, channel_id: &str, timeout: Option<u64>) -> Value {
    match timeout {
        Some(seconds) => json!({
            "snippet": {
                "liveChatId": chat_id,
                "type": "temporary",
                "banDurationSeconds": seconds,
                "bannedUserDetails": { "channelId": channel_id }
            }
        }),
        None => json!({
            "snippet": {
                "liveChatId": chat_id,
                "type": "permanent",
                "bannedUserDetails": { "channelId": channel_id }
            }
        }),
    }
}

/// The chat of the live the source is reading, which is not always the signed-in channel's own.
fn youtube_source_chat_id(token: &str, channel: &str) -> Result<String, String> {
    let video = super::chat::youtube_live_video(channel)
        .filter(|id| {
            id.len() == 11
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
        .ok_or_else(|| Msg::ChatYoutubeNoActiveLive.now())?;
    let body = google_json(
        "GET",
        &format!(
            "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={video}"
        ),
        token,
        None,
    )?;
    serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.pointer("/items/0/liveStreamingDetails/activeLiveChatId")?
                .as_str()
                .map(String::from)
        })
        .filter(|id| !id.is_empty())
        .ok_or_else(|| Msg::ChatYoutubeNoActiveLive.now())
}

pub(crate) fn youtube_moderate(
    app: &AppHandle,
    channel: &str,
    action: &str,
    native_id: Option<String>,
    author_id: Option<String>,
    seconds: Option<u64>,
) -> Result<(), String> {
    let token = youtube_token(app).ok_or_else(|| Msg::ModerateYoutubeSignInFirst.now())?;
    match action {
        "delete" => {
            let id = native_id.ok_or_else(|| Msg::ModerateNoMessageId.now())?;
            google_json(
                "DELETE",
                &format!(
                    "https://www.googleapis.com/youtube/v3/liveChat/messages?id={}",
                    pct(&id)
                ),
                &token,
                None,
            )
            .map(|_| ())
        }
        "timeout" | "ban" => {
            let author = author_id.unwrap_or_default();
            let channel_id =
                youtube_channel_id(&author).ok_or_else(|| Msg::ModerateNoAuthorId.now())?;
            let chat_id = youtube_source_chat_id(&token, channel)?;
            let timeout = (action == "timeout").then(|| timeout_seconds(seconds));
            google_json(
                "POST",
                "https://www.googleapis.com/youtube/v3/liveChat/bans?part=snippet",
                &token,
                Some(&youtube_ban_body(&chat_id, channel_id, timeout)),
            )
            .map(|_| ())
        }
        _ => Err(Msg::ModerateInvalidAction.now()),
    }
}

pub(crate) fn youtube_set_title(app: &AppHandle, title: &str) -> Result<Option<String>, String> {
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
    privacy: String,
    made_for_kids: bool,
}

impl YoutubeBroadcastRemote {
    /// Stop and recovery never create a broadcast, so they need no audience settings.
    fn without_audience(token: Option<String>) -> Self {
        Self {
            token,
            privacy: "public".to_string(),
            made_for_kids: false,
        }
    }
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

fn youtube_broadcast_body(title: &str, start: &str, privacy: &str, made_for_kids: bool) -> Value {
    let title: String = title.chars().take(100).collect();
    // Disable auto-stop so a long interruption remains recoverable; stop explicitly instead.
    json!({
        "snippet": { "title": title, "scheduledStartTime": start },
        "status": { "privacyStatus": privacy, "selfDeclaredMadeForKids": made_for_kids },
        "contentDetails": {
            "enableAutoStart": true,
            "enableAutoStop": false,
            "monitorStream": { "enableMonitorStream": false }
        }
    })
}

impl youtube_broadcast::Remote for YoutubeBroadcastRemote {
    fn create(&mut self, title: &str) -> Result<String, BroadcastError> {
        let token = self.token()?;
        let start = rfc3339_utc(now_ms() / 1000 + 60); // YouTube requires a future scheduled start.
        let body = youtube_broadcast_body(title, &start, &self.privacy, self.made_for_kids);
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
    privacy: &str,
    made_for_kids: bool,
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
        privacy: privacy.to_string(),
        made_for_kids,
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
    let mut remote = YoutubeBroadcastRemote::without_audience(youtube_token(app));
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
        let mut remote = YoutubeBroadcastRemote::without_audience(youtube_token(&app));
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
    fn youtube_broadcast_body_carries_the_chosen_audience() {
        let body = youtube_broadcast_body("Live", "2026-10-18T22:00:00Z", "unlisted", true);
        assert_eq!(body["status"]["privacyStatus"], "unlisted");
        assert_eq!(body["status"]["selfDeclaredMadeForKids"], true);
        assert_eq!(body["contentDetails"]["enableAutoStop"], false);

        let long_title = "x".repeat(150);
        let body = youtube_broadcast_body(&long_title, "2026-10-18T22:00:00Z", "public", false);
        assert_eq!(
            body["snippet"]["title"].as_str().map(|t| t.chars().count()),
            Some(100)
        );
        assert_eq!(body["status"]["selfDeclaredMadeForKids"], false);
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
    fn official_youtube_is_the_default_without_an_explicit_preference() {
        let mut config = OauthConfig {
            youtube_official_id: "oficial-yt".into(),
            ..Default::default()
        };
        resolve_youtube_mode(&mut config, None, None);
        assert!(
            config.youtube_direct,
            "New YouTube configuration uses official PKCE"
        );
        assert!(config.google_client_secret.is_empty());

        resolve_youtube_mode(&mut config, Some(("meu".into(), "meu-secret".into())), None);
        assert!(!config.youtube_direct);
        assert_eq!(config.google_client_id, "meu");
    }

    #[test]
    fn ban_requests_name_the_chat_and_the_person() {
        assert_eq!(
            youtube_channel_id(" UCaaaaaaaaaaaaaaaaaaaaaa "),
            Some("UCaaaaaaaaaaaaaaaaaaaaaa")
        );
        for invalid in [
            "",
            "UCshort",
            "XXaaaaaaaaaaaaaaaaaaaaaa",
            "UCaaaaaaaaaaaaaaaaaaaa&a",
        ] {
            assert_eq!(youtube_channel_id(invalid), None, "{invalid:?}");
        }

        let timeout = youtube_ban_body("chat-1", "UCaaaaaaaaaaaaaaaaaaaaaa", Some(600));
        assert_eq!(timeout["snippet"]["liveChatId"], "chat-1");
        assert_eq!(timeout["snippet"]["type"], "temporary");
        assert_eq!(timeout["snippet"]["banDurationSeconds"], 600);
        assert_eq!(
            timeout["snippet"]["bannedUserDetails"]["channelId"],
            "UCaaaaaaaaaaaaaaaaaaaaaa"
        );
        let ban = youtube_ban_body("chat-1", "UCaaaaaaaaaaaaaaaaaaaaaa", None);
        assert_eq!(ban["snippet"]["type"], "permanent");
        assert!(ban["snippet"].get("banDurationSeconds").is_none());
    }

    #[test]
    fn account_channel_prefers_the_handle_a_source_would_use() {
        let youtube = |item: Value| parse_youtube_account_channel(&json!({ "items": [item] }));
        assert_eq!(
            youtube(json!({
                "id": "UCaaaaaaaaaaaaaaaaaaaaaa",
                "snippet": { "title": "Canal da Ana", "customUrl": "@ana" }
            })),
            Some(AccountChannel {
                platform: "youtube",
                value: "@ana".into(),
                aliases: vec!["UCaaaaaaaaaaaaaaaaaaaaaa".into()],
                name: String::new(),
            })
        );
        assert_eq!(
            youtube(
                json!({ "id": "UCaaaaaaaaaaaaaaaaaaaaaa", "snippet": { "title": "Canal da Ana" } })
            ),
            Some(AccountChannel {
                platform: "youtube",
                value: "UCaaaaaaaaaaaaaaaaaaaaaa".into(),
                aliases: Vec::new(),
                name: "Canal da Ana".into(),
            })
        );
        assert_eq!(youtube(json!({ "id": "not-a-channel" })), None);
        assert_eq!(parse_youtube_account_channel(&json!({ "items": [] })), None);
    }
}
