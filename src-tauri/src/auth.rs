//! OAuth (device flow) pra ENVIAR e MODERAR pelo chat.
//!
//! Twitch e Google usam o "device authorization grant": o app pede um código, o usuário
//! digita no navegador (sem redirect/servidor local) e o app faz polling até autorizar.
//! Os client_ids vêm do `.env` (frontend → `set_oauth_config`). Tokens ficam no keyring
//! (`twitch_oauth`/`twitch_refresh`/`youtube_oauth`/`youtube_refresh`) com refresh automático.
//! A UI acompanha por `auth://twitch` e `auth://youtube`.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::keys;
use crate::AppState;

const TWITCH_SCOPES: &str =
    "chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users";
const GOOGLE_SCOPE: &str = "https://www.googleapis.com/auth/youtube.force-ssl";
const GRANT_DEVICE: &str = "urn:ietf:params:oauth:grant-type:device_code";
// Kick: API oficial (OAuth 2.1 + PKCE, sem device flow). Redirect loopback numa porta fixa.
const KICK_SCOPES: &str = "user:read channel:read chat:write moderation:chat_message:manage";
const KICK_PORT: u16 = 7395;

/// Client ids/secrets vindos do `.env` (definidos pelo frontend no boot).
#[derive(Default, Clone)]
pub struct OauthConfig {
    pub twitch_client_id: String,
    pub twitch_client_secret: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub kick_client_id: String,
    pub kick_client_secret: String,
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

/// POST application/x-www-form-urlencoded → JSON (Ok) ou (status, JSON) no erro.
fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, (u16, Value)> {
    let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap_or(Value::Null);
    match ureq::post(url).timeout(Duration::from_secs(12)).send_form(form) {
        Ok(r) => Ok(parse(r.into_string().unwrap_or_default())),
        Err(ureq::Error::Status(code, r)) => Err((code, parse(r.into_string().unwrap_or_default()))),
        Err(_) => Err((0, Value::Null)),
    }
}

fn auth_event(app: &AppHandle, who: &str, state: &str, user_code: &str, verify: &str, login: &str) {
    let _ = app.emit(
        &format!("auth://{who}"),
        json!({ "state": state, "userCode": user_code, "verifyUri": verify, "login": login }),
    );
}

/// Evento de "code" com a URL completa (já com o código embutido, quando a plataforma manda)
/// pra abrir o navegador direto na tela de autorização.
fn auth_code_event(app: &AppHandle, who: &str, user_code: &str, verify: &str, verify_complete: &str) {
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

// ----------------------------- Config (do .env) --------------------

#[tauri::command]
pub fn set_oauth_config(
    app: AppHandle,
    twitch_client_id: String,
    twitch_client_secret: Option<String>,
    google_client_id: String,
    google_client_secret: Option<String>,
    kick_client_id: Option<String>,
    kick_client_secret: Option<String>,
) {
    // BYOK: credenciais do YouTube que o usuário colou NO APP (cofre) vencem as do .env (build),
    // pra cada um usar a própria conta do Google — própria cota, sem verificação compartilhada.
    let g_id = keys::get_key("youtube_client_id").unwrap_or_else(|| google_client_id.trim().to_string());
    let g_secret = keys::get_key("youtube_client_secret")
        .unwrap_or_else(|| google_client_secret.unwrap_or_default().trim().to_string());
    let st = app.state::<AppState>();
    *st.oauth.lock().unwrap() = OauthConfig {
        twitch_client_id: twitch_client_id.trim().to_string(),
        twitch_client_secret: twitch_client_secret.unwrap_or_default().trim().to_string(),
        google_client_id: g_id.trim().to_string(),
        google_client_secret: g_secret.trim().to_string(),
        kick_client_id: kick_client_id.unwrap_or_default().trim().to_string(),
        kick_client_secret: kick_client_secret.unwrap_or_default().trim().to_string(),
    };
}

/// Credenciais do Google coladas pelo usuário (BYOK) — vão pro cofre e valem na hora.
#[tauri::command]
pub fn set_youtube_oauth(app: AppHandle, client_id: String, client_secret: String) -> Result<(), String> {
    let id = client_id.trim();
    let secret = client_secret.trim();
    if id.is_empty() || secret.is_empty() {
        return Err("preencha o Client ID e o Client Secret".into());
    }
    keys::set_key("youtube_client_id", id)?;
    keys::set_key("youtube_client_secret", secret)?;
    let st = app.state::<AppState>();
    let mut o = st.oauth.lock().unwrap();
    o.google_client_id = id.to_string();
    o.google_client_secret = secret.to_string();
    Ok(())
}

/// Esquece as credenciais do Google e desloga (pra trocar de conta/projeto).
#[tauri::command]
pub fn clear_youtube_oauth(app: AppHandle) {
    for k in ["youtube_client_id", "youtube_client_secret", "youtube_oauth", "youtube_refresh"] {
        let _ = keys::clear_key(k);
    }
    *YT_TOKEN.lock().unwrap() = None;
    *YT_CHAT.lock().unwrap() = None;
    let st = app.state::<AppState>();
    let mut o = st.oauth.lock().unwrap();
    o.google_client_id.clear();
    o.google_client_secret.clear();
    auth_event(&app, "youtube", "loggedout", "", "", "");
}

/// Estado de login pras duas plataformas (pro frontend semear no boot). Renova se preciso.
/// ASYNC: valida/renova via HTTP — síncrono travaria o boot na thread principal.
#[tauri::command]
pub async fn auth_status(app: AppHandle) -> Value {
    tauri::async_runtime::spawn_blocking(move || {
        let twitch = twitch_token(&app).and_then(|t| twitch_validate(&t)).map(|i| i.login);
        let youtube = keys::has_key("youtube_refresh");
        let youtube_configured = !app.state::<AppState>().oauth.lock().unwrap().google_client_id.is_empty();
        let kick = keys::has_key("kick_refresh");
        json!({ "twitchLogin": twitch, "youtube": youtube, "youtubeConfigured": youtube_configured, "kick": kick })
    })
    .await
    .unwrap_or_else(|_| json!({ "twitchLogin": null, "youtube": false, "youtubeConfigured": false, "kick": false }))
}

// ----------------------------- Twitch ------------------------------

pub struct TwitchInfo {
    pub user_id: String,
    pub login: String,
}

/// Valida um token Twitch → user_id + login (e existência implica token vivo).
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
        auth_event(&app, "twitch", "error", "", "", "Falta VITE_TWITCH_CLIENT_ID no .env");
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let dev = match post_form(
            "https://id.twitch.tv/oauth2/device",
            &[("client_id", &cfg.twitch_client_id), ("scopes", TWITCH_SCOPES)],
        ) {
            Ok(v) => v,
            Err(_) => return auth_event(&app, "twitch", "error", "", "", "Não consegui iniciar o login"),
        };
        let device_code = dev.get("device_code").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let user_code = dev.get("user_code").and_then(|x| x.as_str()).unwrap_or("").to_string();
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
        let interval = dev.get("interval").and_then(|x| x.as_u64()).unwrap_or(5).max(1);
        let expires = dev.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(1800);
        if device_code.is_empty() {
            return auth_event(&app, "twitch", "error", "", "", "Resposta inválida da Twitch");
        }
        auth_code_event(&app, "twitch", &user_code, &verify, &verify_complete);

        let deadline = Instant::now() + Duration::from_secs(expires);
        loop {
            std::thread::sleep(Duration::from_secs(interval));
            if Instant::now() > deadline {
                return auth_event(&app, "twitch", "error", "", "", "Código expirou — tente de novo");
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
                    let _ = keys::set_key("twitch_oauth", access);
                    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
                        let _ = keys::set_key("twitch_refresh", r);
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
                        continue; // ainda não autorizou
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
pub fn twitch_logout(app: AppHandle) {
    let _ = keys::clear_key("twitch_oauth");
    let _ = keys::clear_key("twitch_refresh");
    auth_event(&app, "twitch", "loggedout", "", "", "");
}

/// Access token Twitch da conta válido (refresh se preciso). None = não logado.
pub fn twitch_token(app: &AppHandle) -> Option<String> {
    let access = keys::get_key("twitch_oauth")?;
    if twitch_validate(&access).is_some() {
        return Some(access);
    }
    twitch_refresh(app)
}

fn twitch_refresh(app: &AppHandle) -> Option<String> {
    let cfg = oauth(app);
    let refresh = keys::get_key("twitch_refresh")?;
    let mut form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh.as_str()),
        ("client_id", cfg.twitch_client_id.as_str()),
    ];
    if !cfg.twitch_client_secret.is_empty() {
        form.push(("client_secret", cfg.twitch_client_secret.as_str()));
    }
    let v = post_form("https://id.twitch.tv/oauth2/token", &form).ok()?;
    let access = v.get("access_token").and_then(|x| x.as_str())?.to_string();
    let _ = keys::set_key("twitch_oauth", &access);
    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
        let _ = keys::set_key("twitch_refresh", r);
    }
    Some(access)
}

// ----------------------------- YouTube / Google --------------------

#[tauri::command]
pub fn youtube_login_start(app: AppHandle) {
    let cfg = oauth(&app);
    if cfg.google_client_id.is_empty() || cfg.google_client_secret.is_empty() {
        auth_event(&app, "youtube", "error", "", "", "Falta VITE_GOOGLE_CLIENT_ID/SECRET no .env");
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let dev = match post_form(
            "https://oauth2.googleapis.com/device/code",
            &[("client_id", &cfg.google_client_id), ("scope", GOOGLE_SCOPE)],
        ) {
            Ok(v) => v,
            Err(_) => return auth_event(&app, "youtube", "error", "", "", "Não consegui iniciar o login"),
        };
        let device_code = dev.get("device_code").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let user_code = dev.get("user_code").and_then(|x| x.as_str()).unwrap_or("").to_string();
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
        let interval = dev.get("interval").and_then(|x| x.as_u64()).unwrap_or(5).max(1);
        let expires = dev.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(1800);
        if device_code.is_empty() {
            return auth_event(&app, "youtube", "error", "", "", "Resposta inválida do Google");
        }
        auth_code_event(&app, "youtube", &user_code, &verify, &verify_complete);

        let deadline = Instant::now() + Duration::from_secs(expires);
        loop {
            std::thread::sleep(Duration::from_secs(interval));
            if Instant::now() > deadline {
                return auth_event(&app, "youtube", "error", "", "", "Código expirou — tente de novo");
            }
            match post_form(
                "https://oauth2.googleapis.com/token",
                &[
                    ("client_id", &cfg.google_client_id),
                    ("client_secret", &cfg.google_client_secret),
                    ("device_code", &device_code),
                    ("grant_type", GRANT_DEVICE),
                ],
            ) {
                Ok(v) => {
                    let access = v.get("access_token").and_then(|x| x.as_str()).unwrap_or("");
                    if access.is_empty() {
                        continue;
                    }
                    let _ = keys::set_key("youtube_oauth", access);
                    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
                        let _ = keys::set_key("youtube_refresh", r);
                    }
                    return auth_event(&app, "youtube", "connected", "", "", "");
                }
                Err((_, e)) => {
                    let err = e.get("error").and_then(|x| x.as_str()).unwrap_or("");
                    if err == "authorization_pending" || err.is_empty() {
                        continue;
                    }
                    if err == "slow_down" {
                        std::thread::sleep(Duration::from_secs(interval));
                        continue;
                    }
                    return auth_event(&app, "youtube", "error", "", "", err);
                }
            }
        }
    });
}

#[tauri::command]
pub fn youtube_logout(app: AppHandle) {
    let _ = keys::clear_key("youtube_oauth");
    let _ = keys::clear_key("youtube_refresh");
    *YT_TOKEN.lock().unwrap() = None;
    *YT_CHAT.lock().unwrap() = None;
    auth_event(&app, "youtube", "loggedout", "", "", "");
}

// Cache do access token (Google expira em ~1h) e do liveChatId (resolve é quota).
static YT_TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);
static YT_CHAT: Mutex<Option<(String, u64)>> = Mutex::new(None);

/// Access token YouTube válido (refresh quando perto de expirar). None = não logado.
pub fn youtube_token(app: &AppHandle) -> Option<String> {
    let now = now_ms();
    if let Some((t, exp)) = &*YT_TOKEN.lock().unwrap() {
        if *exp > now + 30_000 {
            return Some(t.clone());
        }
    }
    let cfg = oauth(app);
    let refresh = keys::get_key("youtube_refresh")?;
    let v = post_form(
        "https://oauth2.googleapis.com/token",
        &[
            ("client_id", &cfg.google_client_id),
            ("client_secret", &cfg.google_client_secret),
            ("refresh_token", &refresh),
            ("grant_type", "refresh_token"),
        ],
    )
    .ok()?;
    let access = v.get("access_token").and_then(|x| x.as_str())?.to_string();
    let exp = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600);
    *YT_TOKEN.lock().unwrap() = Some((access.clone(), now + exp * 1000));
    let _ = keys::set_key("youtube_oauth", &access);
    Some(access)
}

/// liveChatId da sua transmissão ativa (cacheado por 5 min). None = sem live.
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

/// Manda uma mensagem no chat ao vivo do YouTube (liveChatMessages.insert).
pub fn youtube_send(app: &AppHandle, text: &str) -> Result<(), String> {
    let token = youtube_token(app).ok_or("YouTube não logado")?;
    let chat_id = youtube_live_chat_id(&token).ok_or("Nenhuma live ativa no YouTube agora")?;
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
        *YT_CHAT.lock().unwrap() = None; // live pode ter trocado/encerrado → re-resolve depois
    }
    res.map(|_| ())
}

// ----------------------------- HTTP helpers ------------------------

/// Chamada JSON ao Google (Bearer). Retorna o corpo ou um erro legível.
fn google_json(method: &str, url: &str, token: &str, body: Option<&Value>) -> Result<String, String> {
    let req = match method {
        "POST" => ureq::post(url),
        "DELETE" => ureq::delete(url),
        _ => ureq::get(url),
    }
    .set("Authorization", &format!("Bearer {token}"))
    .timeout(Duration::from_secs(12));
    let res = match body {
        Some(b) => req.set("Content-Type", "application/json").send_string(&b.to_string()),
        None => req.call(),
    };
    match res {
        Ok(r) => Ok(r.into_string().unwrap_or_default()),
        Err(ureq::Error::Status(c, r)) => {
            Err(format!("YouTube {c}: {}", r.into_string().unwrap_or_default()))
        }
        Err(e) => Err(format!("YouTube: {e}")),
    }
}

/// GET Helix (Twitch) → JSON. Helix exige Authorization Bearer + Client-Id (do app).
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
    let v = helix(token, client_id, &format!("https://api.twitch.tv/helix/users?login={login}"))?;
    Some(v.get("data")?.as_array()?.first()?.get("id")?.as_str()?.to_string())
}

// ----------------------------- Moderação ---------------------------

// ASYNC: as chamadas Helix/YouTube bloqueiam (resolução de ids + ação).
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
            .ok_or("fonte não encontrada")?;
        match src.platform.as_str() {
            "twitch" => twitch_moderate(&app, &src.value, &action, native_id, author, author_id, seconds),
            "youtube" => youtube_moderate(&app, &action, native_id),
            "kick" => kick_moderate(&app, &action, native_id),
            _ => Err("essa plataforma não tem moderação".into()),
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
    let token = twitch_token(app).ok_or("entre na Twitch pra moderar")?;
    let client_id = oauth(app).twitch_client_id;
    let info = twitch_validate(&token).ok_or("token da Twitch inválido")?;
    let chan = channel.trim().trim_start_matches('#').to_lowercase();
    let broadcaster = helix_user_id(&token, &client_id, &chan).ok_or("canal não encontrado")?;
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
            Some(b) => req.set("Content-Type", "application/json").send_string(&b.to_string()),
            None => req.call(),
        };
        match res {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(c, r)) => {
                Err(format!("Twitch {c}: {}", r.into_string().unwrap_or_default()))
            }
            Err(e) => Err(format!("Twitch: {e}")),
        }
    };

    match action {
        "delete" => {
            let mid = native_id.ok_or("sem id da mensagem")?;
            run(
                "DELETE",
                format!(
                    "https://api.twitch.tv/helix/moderation/chat?broadcaster_id={broadcaster}&moderator_id={mod_id}&message_id={mid}"
                ),
                None,
            )
        }
        "timeout" | "ban" => {
            // user-id do tag do IRC (confiável); só cai pro lookup por login se faltar.
            let target = match author_id {
                Some(id) if !id.trim().is_empty() => id,
                _ => {
                    let a = author.ok_or("sem usuário")?.to_lowercase();
                    helix_user_id(&token, &client_id, &a).ok_or("usuário não encontrado")?
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
        _ => Err("ação inválida".into()),
    }
}

fn youtube_moderate(app: &AppHandle, action: &str, native_id: Option<String>) -> Result<(), String> {
    let token = youtube_token(app).ok_or("entre no YouTube pra moderar")?;
    match action {
        "delete" => {
            let id = native_id.ok_or("sem id da mensagem")?;
            google_json(
                "DELETE",
                &format!("https://www.googleapis.com/youtube/v3/liveChat/messages?id={id}"),
                &token,
                None,
            )
            .map(|_| ())
        }
        // banir/timeout no YouTube precisa do channelId do autor (liveChatBans), que o feed
        // não carrega hoje → fica como evolução. Apagar já cobre o essencial.
        _ => Err("no YouTube, por enquanto só dá pra apagar a mensagem".into()),
    }
}

// ----------------------------- Kick --------------------------------
// Kick tem API OFICIAL (OAuth 2.1 + PKCE, SEM device flow). Login = Authorization Code com
// redirect loopback (http://localhost:KICK_PORT/callback). Envio: POST /public/v1/chat.
// Leitura continua no Pusher anônimo (run_kick) — não muda.

static KICK_IDS: Mutex<BTreeMap<String, i64>> = Mutex::new(BTreeMap::new());

/// Token aleatório (32 bytes do CSPRNG do SO → base64url, ~43 chars) pro PKCE verifier e o
/// state anti-CSRF (RFC 7636 exige aleatoriedade real, não time/pid).
fn rand_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("OS RNG indisponível");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Percent-encode pra valores de query da URL de autorização.
fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
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
                // decodifica por bytes (não fatia o &str → evita panic em fronteira UTF-8).
                match ((b[i + 1] as char).to_digit(16), (b[i + 2] as char).to_digit(16)) {
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
    let cfg = oauth(&app);
    if cfg.kick_client_id.is_empty() || cfg.kick_client_secret.is_empty() {
        auth_event(&app, "kick", "error", "", "", "Falta VITE_KICK_CLIENT_ID/SECRET no .env");
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let verifier = rand_token();
        let challenge = pkce_challenge(&verifier);
        let state = rand_token();
        let redirect = format!("http://localhost:{KICK_PORT}/callback");
        // Abre a porta ANTES do navegador. Escuta em IPv4 E IPv6 — no Windows "localhost" pode
        // resolver pra ::1 ou 127.0.0.1, então pegamos os dois.
        let mut listeners = Vec::new();
        for ip in [IpAddr::V4(Ipv4Addr::LOCALHOST), IpAddr::V6(Ipv6Addr::LOCALHOST)] {
            if let Ok(l) = TcpListener::bind(SocketAddr::new(ip, KICK_PORT)) {
                let _ = l.set_nonblocking(true);
                listeners.push(l);
            }
        }
        if listeners.is_empty() {
            return auth_event(&app, "kick", "error", "", "", &format!("Porta {KICK_PORT} ocupada"));
        }
        let url = format!(
            "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
            pct(&cfg.kick_client_id),
            pct(&redirect),
            pct(KICK_SCOPES),
            pct(&challenge),
            pct(&state),
        );
        // o front abre o navegador (auth://kick "code" → openExternal). Sem user_code (não é device).
        auth_code_event(&app, "kick", "", &url, &url);
        match kick_wait(&listeners, &state) {
            Ok(code) => match kick_exchange(&cfg, &code, &verifier, &redirect) {
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

/// Servidor loopback (IPv4+IPv6) de uso único: espera o GET /callback?code=...&state=..., confere
/// o state (CSRF), trata negação (`error`) e IGNORA conexões espúrias (preconnect/favicon) em vez
/// de matar o login. Timeout de 5 min.
fn kick_wait(listeners: &[TcpListener], expected_state: &str) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if Instant::now() > deadline {
            return Err("Login do Kick expirou (5 min)".into());
        }
        let mut idle = true;
        for listener in listeners {
            let mut stream = match listener.accept() {
                Ok((s, _)) => s,
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => continue,
                Err(_) => continue,
            };
            idle = false;
            // O socket aceito herda o não-bloqueante do listener (Windows) → força bloqueio com
            // timeout e lê até a request inteira (read único poderia voltar 0 byte e quebrar).
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
            let ok = err.is_empty() && !code.is_empty() && got_state == expected_state;
            let is_callback = !code.is_empty() || !err.is_empty();
            let msg = if ok {
                "Pronto! Pode fechar esta aba e voltar pra Corneta."
            } else if is_callback {
                "Algo deu errado. Volte pra Corneta e tente de novo."
            } else {
                "Corneta — aguardando o login do Kick…"
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
            if !err.is_empty() {
                return Err(format!("Autorização negada no Kick ({err})"));
            }
            if !code.is_empty() {
                return Err("Login do Kick inválido (state não confere)".into());
            }
            // conexão espúria (sem code/erro) → ignora e segue esperando o callback real.
        }
        if idle {
            std::thread::sleep(Duration::from_millis(150));
        }
    }
}

fn kick_exchange(cfg: &OauthConfig, code: &str, verifier: &str, redirect: &str) -> Result<(), String> {
    let v = post_form(
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
    .map_err(|(c, e)| format!("Kick token {c}: {e}"))?;
    let access = v.get("access_token").and_then(|x| x.as_str()).ok_or("Kick: token vazio")?;
    keys::set_key("kick_oauth", access)?;
    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
        let _ = keys::set_key("kick_refresh", r);
    }
    Ok(())
}

#[tauri::command]
pub fn kick_logout(app: AppHandle) {
    let _ = keys::clear_key("kick_oauth");
    let _ = keys::clear_key("kick_refresh");
    KICK_IDS.lock().unwrap().clear();
    auth_event(&app, "kick", "loggedout", "", "", "");
}

fn kick_refresh(app: &AppHandle) -> Option<String> {
    let cfg = oauth(app);
    let refresh = keys::get_key("kick_refresh")?;
    let v = match post_form(
        "https://id.kick.com/oauth/token",
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", cfg.kick_client_id.as_str()),
            ("client_secret", cfg.kick_client_secret.as_str()),
        ],
    ) {
        Ok(v) => v,
        Err((code, e)) => {
            // refresh morto (revogado/expirado) → desloga de vez pra UI refletir. Erro de rede
            // (status 0) ou 5xx → mantém a sessão pra tentar de novo.
            let dead = code == 400 || e.get("error").and_then(|x| x.as_str()) == Some("invalid_grant");
            if dead {
                let _ = keys::clear_key("kick_oauth");
                let _ = keys::clear_key("kick_refresh");
                KICK_IDS.lock().unwrap().clear();
                auth_event(app, "kick", "loggedout", "", "", "");
            }
            return None;
        }
    };
    let access = v.get("access_token").and_then(|x| x.as_str())?.to_string();
    let _ = keys::set_key("kick_oauth", &access);
    if let Some(r) = v.get("refresh_token").and_then(|x| x.as_str()) {
        let _ = keys::set_key("kick_refresh", r);
    }
    Some(access)
}

/// Chamada à API oficial do Kick (Bearer), com refresh automático no 401.
fn kick_api(app: &AppHandle, method: &str, url: &str, body: Option<&Value>) -> Result<String, String> {
    let mut token = keys::get_key("kick_oauth").ok_or("entre no Kick primeiro")?;
    for attempt in 0..2 {
        let req = match method {
            "POST" => ureq::post(url),
            "DELETE" => ureq::delete(url),
            _ => ureq::get(url),
        }
        .set("Authorization", &format!("Bearer {token}"))
        .timeout(Duration::from_secs(12));
        let res = match body {
            Some(b) => req.set("Content-Type", "application/json").send_string(&b.to_string()),
            None => req.call(),
        };
        match res {
            Ok(r) => return Ok(r.into_string().unwrap_or_default()),
            Err(ureq::Error::Status(401, _)) if attempt == 0 => {
                token = kick_refresh(app).ok_or("Kick: sessão expirou, entre de novo")?;
            }
            Err(ureq::Error::Status(c, r)) => {
                return Err(format!("Kick {c}: {}", r.into_string().unwrap_or_default()));
            }
            Err(e) => return Err(format!("Kick: {e}")),
        }
    }
    Err("Kick: falha após renovar a sessão".into())
}

fn kick_broadcaster_id(app: &AppHandle, slug: &str) -> Result<i64, String> {
    let slug = slug.trim().trim_start_matches('@').to_lowercase();
    if slug.is_empty() {
        return Err("Kick: canal sem nome".into());
    }
    if let Some(id) = KICK_IDS.lock().unwrap().get(&slug) {
        return Ok(*id);
    }
    let body = kick_api(
        app,
        "GET",
        &format!("https://api.kick.com/public/v1/channels?slug={}", pct(&slug)),
        None,
    )?;
    let v: Value = serde_json::from_str(&body).map_err(|_| "Kick: resposta inválida".to_string())?;
    let id = v
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("broadcaster_user_id"))
        .and_then(|x| x.as_i64())
        .ok_or("Kick: canal não encontrado")?;
    KICK_IDS.lock().unwrap().insert(slug, id);
    Ok(id)
}

/// Manda mensagem no chat do canal Kick (API oficial: POST /public/v1/chat, type=user).
pub fn kick_send(app: &AppHandle, text: &str, slug: &str) -> Result<(), String> {
    let bid = kick_broadcaster_id(app, slug)?;
    let content: String = text.chars().take(500).collect();
    let body = json!({ "type": "user", "content": content, "broadcaster_user_id": bid });
    kick_api(app, "POST", "https://api.kick.com/public/v1/chat", Some(&body)).map(|_| ())
}

/// Nome da conta logada (pra mostrar "logado como X"). Best-effort.
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
            let id = native_id.ok_or("sem id da mensagem")?;
            kick_api(app, "DELETE", &format!("https://api.kick.com/public/v1/chat/{id}"), None).map(|_| ())
        }
        // banir/timeout precisa do user_id do autor (o feed Pusher só dá username) → evolução.
        _ => Err("no Kick, por enquanto só dá pra apagar a mensagem".into()),
    }
}
