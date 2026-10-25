//! What a paired phone may ask for. Each action calls the same code the desktop uses.

use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::Emitter;

use super::Hub;
use crate::i18n::Msg;
use crate::obs::LinkCmd;

/// Layout ids. The combos run on the phone as a sequence of the atomic actions.
const LAYOUT_ACTIONS: &[&str] = &[
    "mark", "brb", "mic", "scene", "title", "say", "stop", "break", "bye",
];

pub fn is_action(id: &str) -> bool {
    LAYOUT_ACTIONS.contains(&id)
        || id
            .strip_prefix("pause:")
            .is_some_and(crate::platforms::is_destination)
}

fn text_arg(args: &Value, key: &str, max: usize) -> Option<String> {
    let text: String = args.get(key)?.as_str()?.trim().chars().take(max).collect();
    (!text.is_empty()).then_some(text)
}

fn bool_arg(args: &Value, key: &str) -> Result<bool, String> {
    args.get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| Msg::DeckUnknownAction.now())
}

async fn obs(hub: &Arc<Hub>, cmd: LinkCmd) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    hub.obs_requests
        .lock()
        .unwrap()
        .send(crate::obs::LinkRequest { cmd, reply: tx })
        .map_err(|_| Msg::DeckObsUnavailable.now())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(8)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| Msg::DeckObsUnavailable.now())?
}

/// Start and stop also drive OBS and telemetry, so the desktop window runs them.
async fn desktop(hub: &Arc<Hub>, action: &str) -> Result<(), String> {
    let id = super::pairing::random_secret();
    let (tx, rx) = tokio::sync::oneshot::channel();
    hub.desktop_requests.lock().unwrap().insert(id.clone(), tx);
    let _ = hub.app.emit_to(
        "main",
        "deck://request",
        json!({ "id": id, "action": action }),
    );
    let result = tokio::time::timeout(Duration::from_secs(60), rx).await;
    hub.desktop_requests.lock().unwrap().remove(&id);
    match result {
        Ok(Ok(outcome)) => outcome,
        _ => Err(Msg::DeckRequestTimeout.now()),
    }
}

pub async fn run(
    hub: &Arc<Hub>,
    device: &str,
    action: &str,
    args: &Value,
) -> Result<Value, String> {
    let app = hub.app.clone();
    match action {
        "mark" => {
            let marks = crate::commands::mark_moment(app, text_arg(args, "label", 80)).await?;
            Ok(json!({ "marks": marks }))
        }
        "brb" => {
            crate::commands::set_force_brb(app, bool_arg(args, "on")?)?;
            Ok(Value::Null)
        }
        "mic" => {
            obs(hub, LinkCmd::Mute(bool_arg(args, "muted")?)).await?;
            Ok(Value::Null)
        }
        "scene" => {
            let name = text_arg(args, "name", 200).ok_or_else(|| Msg::DeckUnknownAction.now())?;
            obs(hub, LinkCmd::Scene(name)).await?;
            Ok(Value::Null)
        }
        "pause" => {
            let platform = text_arg(args, "platform", 40).unwrap_or_default();
            let paused = bool_arg(args, "paused")?;
            let ids: Vec<String> = hub
                .config()
                .targets
                .iter()
                .filter(|t| t.enabled && t.platform_id == platform)
                .map(|t| t.id.clone())
                .collect();
            if ids.is_empty() {
                return Err(Msg::DeckNoPlatformTarget.now());
            }
            for id in ids {
                crate::commands::set_target_paused(app.clone(), id, paused).await?;
            }
            Ok(Value::Null)
        }
        "say" => {
            let text = text_arg(args, "text", 200).ok_or_else(|| Msg::ChatEmptyMessage.now())?;
            let platform = text_arg(args, "platform", 40);
            let sources = match &platform {
                Some(platform) => {
                    let ids: Vec<String> = hub
                        .config()
                        .settings
                        .chat_sources
                        .iter()
                        .filter(|s| s.enabled && &s.platform == platform)
                        .map(|s| s.id.clone())
                        .collect();
                    if ids.is_empty() {
                        return Err(Msg::DeckNoPlatformTarget.now());
                    }
                    Some(ids)
                }
                None => None,
            };
            tauri::async_runtime::spawn_blocking(move || {
                crate::chat::send_message(&app, &text, sources, None)
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(Value::Null)
        }
        "title" => {
            let title =
                text_arg(args, "title", 140).ok_or_else(|| Msg::StreamInfoEmptyTitle.now())?;
            let game = text_arg(args, "game", 60);
            let saved = title.clone();
            crate::commands::save_native_config(&app, move |cfg| {
                cfg.settings.stream_title = saved;
            })?;
            let results = crate::auth::set_stream_info(app, title, game).await?;
            Ok(results)
        }
        "layout" => {
            let mut seen = std::collections::HashSet::new();
            let keys: Vec<String> = args
                .get("keys")
                .and_then(Value::as_array)
                .ok_or_else(|| Msg::DeckUnknownAction.now())?
                .iter()
                .filter_map(Value::as_str)
                .filter(|id| {
                    super::is_layout_key(id, &hub.config().settings.deck_combos)
                        && seen.insert(id.to_string())
                })
                .take(super::MAX_KEYS)
                .map(str::to_string)
                .collect();
            crate::commands::save_native_config(&app, move |cfg| cfg.settings.deck_layout = keys)?;
            Ok(Value::Null)
        }
        "combos" => {
            let combos: Vec<crate::config::DeckCombo> =
                serde_json::from_value(args.get("combos").cloned().unwrap_or(Value::Null))
                    .map_err(|_| Msg::DeckUnknownAction.now())?;
            crate::commands::save_native_config(&app, move |cfg| {
                cfg.settings.deck_combos = combos
            })?;
            Ok(Value::Null)
        }
        "start" => {
            desktop(hub, "start").await?;
            Ok(Value::Null)
        }
        "stop" => {
            desktop(hub, "stop").await?;
            Ok(Value::Null)
        }
        // The phone forgets itself: same as removing it on the PC.
        "forget" => {
            super::remove_device(&app, device)?;
            Ok(Value::Null)
        }
        _ => Err(Msg::DeckUnknownAction.now()),
    }
}

/// Closes the matching desktop request; unknown ids are ignored.
pub fn desktop_done(app: &tauri::AppHandle, id: &str, outcome: Result<(), String>) {
    let Some(hub) = super::hub(app) else {
        return;
    };
    let tx = hub.desktop_requests.lock().unwrap().remove(id);
    if let Some(tx) = tx {
        let _ = tx.send(outcome);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_ids_are_known_actions_or_a_platform_pause() {
        for id in [
            "mark", "brb", "mic", "scene", "title", "say", "stop", "break", "bye",
        ] {
            assert!(is_action(id), "{id}");
        }
        let platform = crate::platforms::known_destination_id("");
        assert!(is_action(&format!("pause:{platform}")));
        for id in ["", "clip", "pause:", "pause:nope", "start", "layout"] {
            assert!(!is_action(id), "{id}");
        }
    }
}
