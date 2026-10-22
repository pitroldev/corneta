//! Twitch login (device code), token refresh, stream key, moderation and stream info.

use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::auth::{
    auth_code_event, auth_event, finish_local_logout, oauth, pct, post_form, provider_reason,
    timeout_seconds, GRANT_DEVICE,
};
use crate::http_client as ureq;
use crate::i18n::Msg;
use crate::keys;
use crate::platforms::provider::StreamKeyGrant;

const TWITCH_SCOPES: &str =
    "chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users channel:manage:broadcast channel:read:stream_key moderator:read:followers";
/// Asked at sign-in but never reported as missing: they only add owner events to the chat.
const TWITCH_OPTIONAL_SCOPES: &str =
    "channel:read:redemptions channel:read:polls channel:read:predictions channel:read:hype_train";

pub struct TwitchInfo {
    pub user_id: String,
    pub login: String,
    pub scopes: Vec<String>,
}

/// A grant keeps its scopes; logins from before a scope was added need to reconnect for it.
pub(crate) fn missing_twitch_scopes(granted: &[String]) -> Vec<&'static str> {
    TWITCH_SCOPES
        .split(' ')
        .filter(|scope| !granted.iter().any(|granted| granted == scope))
        .collect()
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
        scopes: v
            .get("scopes")
            .and_then(Value::as_array)
            .map(|scopes| {
                scopes
                    .iter()
                    .filter_map(|scope| scope.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

pub(crate) fn twitch_fetch_stream_key(
    app: &AppHandle,
    target_id: &str,
) -> Result<StreamKeyGrant, String> {
    crate::config::validate_secret_namespace(target_id)?;
    let config = crate::config::load(app);
    if !config
        .targets
        .iter()
        .any(|target| target.id == target_id && target.platform_id == "twitch")
    {
        return Err(Msg::TwitchStreamKeyWrongTarget.now());
    }
    let token = twitch_token(app).ok_or_else(|| Msg::TwitchStreamKeyNeedsLogin.now())?;
    let info = twitch_validate(&token).ok_or_else(|| Msg::TwitchStreamKeyNeedsLogin.now())?;
    if missing_twitch_scopes(&info.scopes).contains(&"channel:read:stream_key") {
        return Err(Msg::TwitchStreamKeyReconnect.now());
    }
    let key = fetch_twitch_stream_key(&token, &oauth(app).twitch_client_id, &info.user_id)?;
    keys::set_key(target_id, &key)?;
    Ok(StreamKeyGrant {
        login: info.login,
        url: None,
    })
}

fn fetch_twitch_stream_key(
    token: &str,
    client_id: &str,
    broadcaster_id: &str,
) -> Result<String, String> {
    // Twitch user IDs are numeric; anything else would be spliced into the query string.
    if broadcaster_id.is_empty() || !broadcaster_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(Msg::TwitchStreamKeyFailed.now());
    }
    let response = ureq::get(format!(
        "https://api.twitch.tv/helix/streams/key?broadcaster_id={broadcaster_id}"
    ))
    .set("Authorization", &format!("Bearer {token}"))
    .set("Client-Id", client_id)
    .timeout(Duration::from_secs(10))
    .call();
    match response {
        Ok(response) => response
            .into_string()
            .ok()
            .and_then(|body| serde_json::from_str::<Value>(&body).ok())
            .and_then(|body| twitch_stream_key_from(&body))
            .ok_or_else(|| Msg::TwitchStreamKeyFailed.now()),
        Err(ureq::Error::Status(401, _)) => Err(Msg::TwitchStreamKeyReconnect.now()),
        // Twitch asks clients to show this message: the account has steps left before streaming.
        Err(ureq::Error::Status(403, response)) => {
            let reason = (*response)
                .into_string()
                .ok()
                .and_then(|body| serde_json::from_str::<Value>(&body).ok())
                .and_then(|body| body.get("message")?.as_str().map(provider_reason));
            Err(match reason {
                Some(reason) if !reason.is_empty() => {
                    Msg::TwitchStreamKeyRefused { reason: &reason }.now()
                }
                _ => Msg::TwitchStreamKeyFailed.now(),
            })
        }
        Err(_) => Err(Msg::TwitchStreamKeyFailed.now()),
    }
}

/// The key is the only field read from the success body, and it must look like one.
fn twitch_stream_key_from(body: &Value) -> Option<String> {
    let key = body
        .get("data")?
        .as_array()?
        .first()?
        .get("stream_key")?
        .as_str()?;
    (!key.is_empty() && key.len() <= 8 * 1024 && !key.chars().any(char::is_whitespace))
        .then(|| key.to_string())
}

pub(crate) fn twitch_login_start(app: AppHandle) {
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
                (
                    "scopes",
                    &format!("{TWITCH_SCOPES} {TWITCH_OPTIONAL_SCOPES}"),
                ),
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

pub(crate) fn twitch_logout(app: &AppHandle) -> Result<(), String> {
    let _guard = TWITCH_REFRESH_LOCK
        .lock()
        .map_err(|_| Msg::VaultDeleteFailed.now())?;
    finish_local_logout(
        || keys::clear_keys(&["twitch_refresh", "twitch_oauth"]),
        || {},
        || auth_event(app, "twitch", "loggedout", "", "", ""),
    )
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

pub(crate) fn twitch_client_id(app: &AppHandle) -> String {
    oauth(app).twitch_client_id
}

/// Resolves channel logins to user IDs in one Helix call; logins Twitch could not issue are skipped.
pub(crate) fn twitch_user_ids(
    token: &str,
    client_id: &str,
    logins: &[String],
) -> std::collections::HashMap<String, String> {
    let query = logins
        .iter()
        .filter(|login| {
            (1..=25).contains(&login.len())
                && login
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        })
        .take(100)
        .map(|login| format!("login={login}"))
        .collect::<Vec<_>>()
        .join("&");
    if query.is_empty() {
        return Default::default();
    }
    helix(
        token,
        client_id,
        &format!("https://api.twitch.tv/helix/users?{query}"),
    )
    .and_then(|body| {
        body.get("data")?.as_array().map(|users| {
            users
                .iter()
                .filter_map(|user| {
                    Some((
                        user.get("login")?.as_str()?.to_lowercase(),
                        user.get("id")?.as_str()?.to_string(),
                    ))
                })
                .collect()
        })
    })
    .unwrap_or_default()
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

pub(crate) fn twitch_moderate(
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
                json!({ "data": { "user_id": target, "duration": timeout_seconds(seconds) } })
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

pub(crate) fn twitch_set_info(
    app: &AppHandle,
    title: &str,
    category: &str,
) -> Result<Option<String>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn older_twitch_grants_report_the_scopes_they_lack() {
        let old: Vec<String> = [
            "chat:read",
            "chat:edit",
            "moderator:manage:chat_messages",
            "moderator:manage:banned_users",
            "channel:manage:broadcast",
        ]
        .map(str::to_string)
        .to_vec();
        assert_eq!(
            missing_twitch_scopes(&old),
            ["channel:read:stream_key", "moderator:read:followers"]
        );
        let full: Vec<String> = TWITCH_SCOPES.split(' ').map(str::to_string).collect();
        assert!(missing_twitch_scopes(&full).is_empty());
    }

    #[test]
    fn only_a_plausible_stream_key_is_read_from_helix() {
        let body = |key: &str| json!({ "data": [{ "stream_key": key }] });
        assert_eq!(
            twitch_stream_key_from(&body("live_123_abc")).as_deref(),
            Some("live_123_abc")
        );
        let oversized = "x".repeat(8 * 1024 + 1);
        for invalid in ["", "live 123", oversized.as_str()] {
            assert_eq!(twitch_stream_key_from(&body(invalid)), None);
        }
        assert_eq!(twitch_stream_key_from(&json!({ "data": [] })), None);
        assert_eq!(
            provider_reason("  Complete\u{7} the steps\n "),
            "Complete the steps"
        );
    }
}
