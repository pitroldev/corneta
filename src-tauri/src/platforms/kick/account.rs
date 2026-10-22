//! Kick login (PKCE through the setup API broker or the user's own app), stream key, moderation and stream info.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::auth::{
    auth_code_event, auth_event, broker_error, byok_active, finish_local_logout,
    forget_account_channel, oauth, oauth_wait, own_creds, pct, pkce_challenge, post_form,
    post_setup_json, rand_token, record_broker_failure, refresh_broker_config, setup_url,
    timeout_seconds, AccountChannel, OauthConfig,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::keys;
use crate::platforms::provider::{LoginOptions, StreamKeyGrant};
use crate::AppState;

const KICK_SCOPES: &str =
    "user:read channel:read channel:write chat:write moderation:chat_message:manage";

/// Requested only after someone asks to ban on Kick, so a Kick app without it keeps working for login.
const KICK_BAN_SCOPE: &str = "moderation:ban";

/// Vault marker for a Kick grant that includes the ban scope; it lives and dies with the session.
pub(crate) const KICK_BAN_GRANT: &str = "kick_moderation";

/// Requested only from the key button, for the same reason as the ban scope.
const KICK_KEY_SCOPE: &str = "streamkey:read";

pub(crate) const KICK_KEY_GRANT: &str = "kick_stream_key";

const KICK_PORT: u16 = 7395;

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

pub(crate) fn apply_kick_mode(config: &mut OauthConfig) {
    let own = own_creds("kick_client_id", "kick_client_secret");
    let preference = keys::get_key("kick_oauth_preference");
    resolve_kick_mode(config, own, preference.as_deref());
}

fn forget_kick_session() -> Result<(), String> {
    let _guard = KICK_REFRESH_LOCK
        .lock()
        .map_err(|_| Msg::VaultDeleteFailed.now())?;
    finish_local_logout(
        || {
            keys::clear_keys(&[
                "kick_refresh",
                "kick_oauth",
                "kick_oauth_mode",
                KICK_BAN_GRANT,
                KICK_KEY_GRANT,
            ])
        },
        || {
            KICK_IDS.lock().unwrap().clear();
            forget_account_channel("kick");
        },
        || {},
    )
}

fn kick_mode_changed(app: &AppHandle) {
    apply_kick_mode(&mut app.state::<AppState>().oauth.lock().unwrap());
    auth_event(app, "kick", "loggedout", "", "", "");
}

pub(crate) fn set_kick_oauth(
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
pub(crate) fn kick_use_official(app: AppHandle) -> Result<(), String> {
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

pub(crate) fn kick_use_own_creds(app: AppHandle) -> Result<(), String> {
    if own_creds("kick_client_id", "kick_client_secret").is_none() {
        return Err(Msg::AuthByokNoSavedCreds.now());
    }
    forget_kick_session()?;
    keys::set_key("kick_oauth_preference", "byok")?;
    kick_mode_changed(&app);
    Ok(())
}

pub(crate) fn clear_kick_oauth(app: AppHandle) -> Result<(), String> {
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

pub(crate) static KICK_ACCOUNT_CHANNEL: Mutex<Option<AccountChannel>> = Mutex::new(None);

fn parse_kick_account_channel(v: &Value) -> Option<AccountChannel> {
    let slug = v.pointer("/data/0/slug")?.as_str()?.trim();
    (!slug.is_empty()).then(|| AccountChannel {
        platform: "kick",
        value: slug.to_lowercase(),
        aliases: Vec::new(),
        name: String::new(),
    })
}

pub(crate) fn kick_account_channel(app: &AppHandle) -> Option<AccountChannel> {
    if let Some(channel) = KICK_ACCOUNT_CHANNEL.lock().unwrap().clone() {
        return Some(channel);
    }
    if !keys::has_key("kick_refresh") {
        return None;
    }
    // Without a slug or ID, Kick answers with the authorized user's own channel.
    let body = kick_api(app, "GET", "https://api.kick.com/public/v1/channels", None).ok()?;
    let channel = parse_kick_account_channel(&serde_json::from_str(&body).ok()?)?;
    *KICK_ACCOUNT_CHANNEL.lock().unwrap() = Some(channel.clone());
    Some(channel)
}

/// Kick takes whole minutes, from one minute to a week.
fn kick_timeout_minutes(seconds: Option<u64>) -> u64 {
    timeout_seconds(seconds).div_ceil(60).clamp(1, 10_080)
}

static KICK_IDS: Mutex<BTreeMap<String, i64>> = Mutex::new(BTreeMap::new());

const KICK_ID_CACHE_CAP: usize = 64;

pub(crate) fn kick_login_start(app: AppHandle, options: LoginOptions) {
    // Keep on-demand scopes across re-logins once they were granted.
    let with_ban = options.moderation || keys::has_key(KICK_BAN_GRANT);
    let with_key = options.stream_key || keys::has_key(KICK_KEY_GRANT);
    let scopes = kick_scopes(with_ban, with_key);
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
            pct(&scopes),
            pct(&challenge),
            pct(&state),
        );
        auth_code_event(&app, "kick", "", &url, &url);
        match oauth_wait(&listeners, &state, "Kick") {
            Ok(code) => match kick_exchange(&app, &cfg, &code, &verifier, &redirect) {
                Ok(()) => {
                    for (granted, marker) in
                        [(with_ban, KICK_BAN_GRANT), (with_key, KICK_KEY_GRANT)]
                    {
                        let _ = if granted {
                            keys::set_key(marker, "1")
                        } else {
                            keys::clear_key(marker)
                        };
                    }
                    let login = kick_whoami(&app).unwrap_or_default();
                    auth_event(&app, "kick", "connected", "", "", &login);
                }
                Err(e) => auth_event(&app, "kick", "error", "", "", &e),
            },
            Err(e) => auth_event(&app, "kick", "error", "", "", &e),
        }
    });
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

pub(crate) fn kick_logout(app: &AppHandle) -> Result<(), String> {
    finish_local_logout(
        forget_kick_session,
        || {},
        || auth_event(app, "kick", "loggedout", "", "", ""),
    )
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

pub fn kick_send(
    app: &AppHandle,
    text: &str,
    slug: &str,
    reply_to: Option<&str>,
) -> Result<(), String> {
    let bid = kick_broadcaster_id(app, slug)?;
    let content: String = text.chars().take(500).collect();
    let mut body = json!({ "type": "user", "content": content, "broadcaster_user_id": bid });
    if let Some(id) = reply_to.and_then(crate::chat::reply_id) {
        body["reply_to_message_id"] = json!(id);
    }
    kick_api(
        app,
        "POST",
        "https://api.kick.com/public/v1/chat",
        Some(&body),
    )
    .map(|_| ())
}

fn kick_scopes(with_ban: bool, with_key: bool) -> String {
    let mut scopes = KICK_SCOPES.to_string();
    for (wanted, scope) in [(with_ban, KICK_BAN_SCOPE), (with_key, KICK_KEY_SCOPE)] {
        if wanted {
            scopes.push(' ');
            scopes.push_str(scope);
        }
    }
    scopes
}

/// Only the key and the server URL are read from the channel, and both must look like one.
fn kick_stream_key_from(body: &Value) -> Option<(String, Option<String>)> {
    let stream = body.get("data")?.as_array()?.first()?.get("stream")?;
    let key = stream.get("key")?.as_str()?.trim();
    if key.is_empty() || key.len() > 8 * 1024 || key.chars().any(char::is_whitespace) {
        return None;
    }
    let url = stream
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|url| {
            (url.starts_with("rtmps://") || url.starts_with("rtmp://"))
                && url.len() <= 2048
                && !url.chars().any(|c| c.is_whitespace() || c.is_control())
        })
        .map(String::from);
    Some((key.to_string(), url))
}

pub(crate) fn kick_fetch_stream_key(
    app: &AppHandle,
    target_id: &str,
) -> Result<StreamKeyGrant, String> {
    crate::config::validate_secret_namespace(target_id)?;
    let config = crate::config::load(app);
    if !config
        .targets
        .iter()
        .any(|target| target.id == target_id && target.platform_id == "kick")
    {
        return Err(Msg::KickStreamKeyWrongTarget.now());
    }
    if !keys::has_key("kick_refresh") {
        return Err(Msg::KickStreamKeyNeedsLogin.now());
    }
    if !keys::has_key(KICK_KEY_GRANT) {
        return Err(Msg::KickStreamKeyReconnect.now());
    }
    // Without a slug or ID, Kick answers with the authorized user's own channel.
    let (key, url) = kick_api(app, "GET", "https://api.kick.com/public/v1/channels", None)
        .ok()
        .and_then(|body| serde_json::from_str::<Value>(&body).ok())
        .and_then(|body| kick_stream_key_from(&body))
        .ok_or_else(|| Msg::KickStreamKeyFailed.now())?;
    keys::set_key(target_id, &key)?;
    Ok(StreamKeyGrant {
        login: kick_whoami(app).unwrap_or_default(),
        url,
    })
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

fn kick_ban_body(broadcaster_id: i64, user_id: u64, timeout_minutes: Option<u64>) -> Value {
    let mut body = json!({ "broadcaster_user_id": broadcaster_id, "user_id": user_id });
    if let Some(minutes) = timeout_minutes {
        body["duration"] = json!(minutes);
    }
    body
}

pub(crate) fn kick_moderate(
    app: &AppHandle,
    slug: &str,
    action: &str,
    native_id: Option<String>,
    author_id: Option<String>,
    seconds: Option<u64>,
) -> Result<(), String> {
    match action {
        "delete" => {
            let id = native_id.ok_or_else(|| Msg::ModerateNoMessageId.now())?;
            kick_api(
                app,
                "DELETE",
                &format!("https://api.kick.com/public/v1/chat/{}", pct(&id)),
                None,
            )
            .map(|_| ())
        }
        "timeout" | "ban" => {
            if !keys::has_key(KICK_BAN_GRANT) {
                return Err(Msg::ModerateKickReconnect.now());
            }
            let user_id = author_id
                .and_then(|id| id.trim().parse::<u64>().ok())
                .ok_or_else(|| Msg::ModerateNoAuthorId.now())?;
            let broadcaster_id = kick_broadcaster_id(app, slug)?;
            let timeout = (action == "timeout").then(|| kick_timeout_minutes(seconds));
            kick_api(
                app,
                "POST",
                "https://api.kick.com/public/v1/moderation/bans",
                Some(&kick_ban_body(broadcaster_id, user_id, timeout)),
            )
            .map(|_| ())
        }
        _ => Err(Msg::ModerateInvalidAction.now()),
    }
}

pub(crate) fn kick_set_info(
    app: &AppHandle,
    title: &str,
    category: &str,
) -> Result<Option<String>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::MAX_TIMEOUT_SECONDS;

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
    fn kick_asks_for_extra_scopes_only_when_wanted() {
        assert_eq!(kick_scopes(false, false), KICK_SCOPES);
        assert_eq!(
            kick_scopes(true, true),
            format!("{KICK_SCOPES} moderation:ban streamkey:read")
        );
        assert_eq!(
            kick_scopes(false, true),
            format!("{KICK_SCOPES} streamkey:read")
        );
    }

    #[test]
    fn kick_channel_yields_only_a_plausible_key_and_server() {
        let channel = |stream: Value| {
            kick_stream_key_from(&json!({ "data": [{ "slug": "ana", "stream": stream }] }))
        };
        assert_eq!(
            channel(
                json!({ "key": "placeholder-stream-value", "url": "rtmps://ingest.example/app" })
            ),
            Some((
                "placeholder-stream-value".to_string(),
                Some("rtmps://ingest.example/app".to_string())
            ))
        );
        assert_eq!(
            channel(json!({ "key": "placeholder-stream-value", "url": "https://kick.example/x" })),
            Some(("placeholder-stream-value".to_string(), None)),
            "only RTMP servers are offered"
        );
        assert_eq!(
            channel(json!({ "key": "", "url": "rtmps://ingest.example/app" })),
            None
        );
        assert_eq!(channel(json!({ "key": "two words" })), None);
        assert_eq!(
            channel(json!({ "url": "rtmps://ingest.example/app" })),
            None
        );
        assert_eq!(kick_stream_key_from(&json!({ "data": [] })), None);
    }

    #[test]
    fn official_kick_is_the_default_without_an_explicit_preference() {
        let mut config = OauthConfig {
            kick_official_id: "oficial-kick".into(),
            kick_broker_ready: true,
            ..Default::default()
        };
        resolve_kick_mode(&mut config, None, None);
        assert!(
            config.kick_brokered,
            "New Kick configuration uses the broker"
        );
        assert!(config.kick_client_secret.is_empty());
    }

    #[test]
    fn timeouts_round_up_to_kick_minutes() {
        assert_eq!(kick_timeout_minutes(None), 10);
        assert_eq!(kick_timeout_minutes(Some(61)), 2);
        assert_eq!(kick_timeout_minutes(Some(1)), 1);
        assert_eq!(kick_timeout_minutes(Some(MAX_TIMEOUT_SECONDS)), 10_080);
    }

    #[test]
    fn ban_requests_name_the_channel_and_the_person() {
        assert_eq!(
            kick_ban_body(7, 42, Some(10)),
            json!({ "broadcaster_user_id": 7, "user_id": 42, "duration": 10 })
        );
        assert_eq!(
            kick_ban_body(7, 42, None),
            json!({ "broadcaster_user_id": 7, "user_id": 42 })
        );
    }

    #[test]
    fn account_channel_is_the_lowercase_slug() {
        assert_eq!(
            parse_kick_account_channel(
                &json!({ "data": [{ "slug": "Ana-Live", "broadcaster_user_id": 7 }] })
            ),
            Some(AccountChannel {
                platform: "kick",
                value: "ana-live".into(),
                aliases: Vec::new(),
                name: String::new(),
            })
        );
        assert_eq!(
            parse_kick_account_channel(&json!({ "data": [{ "slug": " " }] })),
            None
        );
        assert_eq!(parse_kick_account_channel(&json!({ "data": [] })), None);
    }
}
