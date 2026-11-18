use super::{get_config, OBS_WS_HOST};
use crate::chat;
use crate::i18n::Msg;
use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn chat_start(app: AppHandle) {
    chat::start_chat(&app);
    // Main and popout webviews maintain separate local chat state.
    let _ = app.emit("chat://running", true);
}

#[tauri::command]
pub fn chat_stop(app: AppHandle) {
    chat::stop_chat(&app);
    let _ = app.emit("chat://running", false);
}

/// Initial state for a new webview; chat://running carries subsequent changes.
#[tauri::command]
pub fn chat_running(app: AppHandle) -> bool {
    let st = app.state::<AppState>();
    let running = st.chat.lock().unwrap().running.clone();
    running.load(std::sync::atomic::Ordering::Relaxed)
}

// Provider HTTP requests must not block the event loop.
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    text: String,
    sources: Option<Vec<String>>,
    reply: Option<chat::ReplyTo>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || chat::send_message(&app, &text, sources, reply))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn alerts_start(app: AppHandle) {
    crate::alerts::start_alerts(&app);
}

#[tauri::command]
pub fn alerts_stop(app: AppHandle) {
    crate::alerts::stop_alerts(&app);
}

// Webview creation must be async to avoid waiting on the Windows main thread from itself.
#[tauri::command]
pub async fn open_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "chat", tauri::WebviewUrl::App("chat.html".into()))
        .title(Msg::WindowChatPopoutTitle.now())
        .inner_size(380.0, 600.0)
        .min_inner_size(300.0, 360.0)
        .resizable(true)
        .always_on_top(true)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Probe once without starting the persistent alert connection.
#[tauri::command]
pub async fn alert_test(app: AppHandle, source_id: String) -> Result<String, String> {
    let cfg = get_config(app);
    let src = cfg
        .settings
        .alert_sources
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| Msg::AlertSourceNotFound.now())?;
    let token = crate::keys::get_key(&format!("alert_{}", src.id))
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| Msg::AlertSourcePasteTokenFirst.now())?;
    let kind = src.kind;
    tauri::async_runtime::spawn_blocking(move || crate::alerts::probe_alert(&kind, &token))
        .await
        .map_err(|e| format!("join: {e}"))?
        .map(|_| Msg::AlertSourceTokenOk.now())
}

// Persisted OBS input name; changing it would create a duplicate source.
const OVERLAY_OBS_SOURCE: &str = "Corneta · Alertas";

#[tauri::command]
pub async fn overlay_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::overlay::OverlayInfo, String> {
    let port = get_config(app).settings.overlay_port as u16;
    crate::overlay::start(&state.overlay, port)
        .await
        .map_err(|error| error.message(crate::i18n::locale()))
}

#[tauri::command]
pub fn overlay_stop(state: State<'_, AppState>) {
    crate::overlay::stop(&state.overlay);
}

#[tauri::command]
pub fn overlay_status(state: State<'_, AppState>) -> Option<crate::overlay::OverlayInfo> {
    crate::overlay::info(&state.overlay)
}

// Preview alerts bypass session recording and the main alert panel.
#[tauri::command]
pub fn overlay_test(state: State<'_, AppState>) {
    let demo = chat::Alert {
        id: "overlay-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        kind: "subgift".into(),
        user: "fulano_dtal".into(),
        amount: Some(5.0),
        currency: None,
        tier: None,
        message: Some(Msg::OverlayDemoAlertMessage.now()),
        fragments: Vec::new(),
        ts: 0,
        ..Default::default()
    };
    crate::overlay::push(&state.overlay, &demo);
}

#[tauri::command]
pub fn overlay_chat_test(state: State<'_, AppState>) {
    let demo = chat::ChatMessage {
        id: "overlay-chat-test".into(),
        platform: "twitch".into(),
        source: Msg::OverlayDemoSource.now(),
        author: "fulano_dtal".into(),
        author_id: None,
        native_id: None,
        color: Some("#ffb323".into()),
        text: Msg::OverlayDemoChatText.now(),
        fragments: vec![
            chat::ChatFragment {
                kind: "text".into(),
                text: Some(Msg::OverlayDemoChatTextFragment.now()),
                url: None,
                ..Default::default()
            },
            chat::ChatFragment {
                kind: "emote".into(),
                text: Some("Kappa".into()),
                url: Some("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0".into()),
                ..Default::default()
            },
        ],
        badges: vec![chat::ChatBadge {
            label: "sub".into(),
            kind: "subscriber".into(),
            ..Default::default()
        }],
        ts: 0,
        ..Default::default()
    };
    crate::overlay::push_chat(&state.overlay, &demo);
}

#[tauri::command]
pub async fn overlay_obs_add_source(app: AppHandle, url: String) -> Result<(), String> {
    let password = crate::obs_env::password(&get_config(app).settings.obs_password);
    tauri::async_runtime::spawn_blocking(move || {
        crate::obs::add_or_update_browser_source(
            OBS_WS_HOST,
            crate::obs_env::port(),
            &password,
            OVERLAY_OBS_SOURCE,
            &url,
            1920,
            1080,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}
