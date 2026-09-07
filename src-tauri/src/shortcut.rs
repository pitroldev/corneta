//! Atomic-style replacement of the app's global shortcut, with typed IPC errors.
use serde::Serialize;
use std::sync::Mutex;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    Invalid,
    InUse,
    RegisterFailed,
    UnregisterFailed,
    CleanupFailed,
}

#[derive(Debug, Serialize)]
pub struct ShortcutError {
    pub code: ErrorCode,
}

impl From<ErrorCode> for ShortcutError {
    fn from(code: ErrorCode) -> Self {
        Self { code }
    }
}

// Normally one entry. Keep both tracked if rollback also fails, so a retry can recover.
static ACTIVE: Mutex<Vec<Shortcut>> = Mutex::new(Vec::new());

pub fn register(app: &tauri::AppHandle, value: &str) -> Result<(), ShortcutError> {
    let manager = app.global_shortcut();
    let mut active = ACTIVE.lock().map_err(|_| ErrorCode::CleanupFailed)?;
    replace(
        &mut active,
        value,
        |shortcut| {
            manager.register(shortcut).map_err(|error| {
                // Tauri flattens global-hotkey::Error into this string variant.
                // Its known AlreadyRegistered prefix is not translated OS text.
                match error {
                    tauri_plugin_global_shortcut::Error::GlobalHotkey(message)
                        if message.starts_with("HotKey already registered:") =>
                    {
                        ErrorCode::InUse
                    }
                    _ => ErrorCode::RegisterFailed,
                }
            })
        },
        |shortcut| manager.unregister(shortcut).map_err(|_| ()),
    )
    .map_err(Into::into)
}

fn replace(
    active: &mut Vec<Shortcut>,
    value: &str,
    mut register: impl FnMut(Shortcut) -> Result<(), ErrorCode>,
    mut unregister: impl FnMut(Shortcut) -> Result<(), ()>,
) -> Result<(), ErrorCode> {
    let next = if value.trim().is_empty() {
        None
    } else {
        Some(
            value
                .trim()
                .parse::<Shortcut>()
                .map_err(|_| ErrorCode::Invalid)?,
        )
    };
    let added = next.filter(|shortcut| !active.contains(shortcut));
    if let Some(shortcut) = added {
        // Do not remove a working shortcut until the candidate is accepted by the OS.
        register(shortcut)?;
        active.push(shortcut);
    }
    for previous in active.clone() {
        if Some(previous) == next {
            continue;
        }
        if unregister(previous).is_err() {
            if let Some(shortcut) = added {
                if unregister(shortcut).is_err() {
                    return Err(ErrorCode::CleanupFailed);
                }
                active.retain(|entry| *entry != shortcut);
            }
            return Err(ErrorCode::UnregisterFailed);
        }
        active.retain(|entry| *entry != previous);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn old() -> Shortcut {
        "Control+KeyK".parse().unwrap()
    }

    #[test]
    fn canonical_browser_codes_parse_without_accessing_the_os() {
        for value in [
            "Control+Space",
            "Control+Shift+Digit1",
            "Control+Shift+Equal",
            "Alt+NumpadAdd",
            "Super+KeyK",
            "Control+NumpadEnter",
        ] {
            assert!(value.parse::<Shortcut>().is_ok(), "{value}");
        }
    }

    #[test]
    fn invalid_and_occupied_candidates_preserve_the_old_registration() {
        let mut active = vec![old()];
        assert_eq!(
            replace(
                &mut active,
                "Control+ ",
                |_| panic!("invalid registration"),
                |_| panic!("old removed")
            ),
            Err(ErrorCode::Invalid)
        );
        assert_eq!(
            replace(
                &mut active,
                "Control+Space",
                |_| Err(ErrorCode::InUse),
                |_| panic!("old removed")
            ),
            Err(ErrorCode::InUse)
        );
        assert_eq!(active, [old()]);
    }

    #[test]
    fn replacement_registers_first_and_repeating_the_same_key_is_idempotent() {
        let calls = RefCell::new(Vec::new());
        let mut active = vec![old()];
        replace(
            &mut active,
            "Control+Space",
            |_| {
                calls.borrow_mut().push("register");
                Ok(())
            },
            |_| {
                calls.borrow_mut().push("unregister");
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(*calls.borrow(), ["register", "unregister"]);
        replace(
            &mut active,
            "Control+Space",
            |_| panic!("already registered"),
            |_| panic!("same key removed"),
        )
        .unwrap();
        assert_eq!(active.len(), 1);
    }

    #[test]
    fn failed_removal_rolls_back_candidate_without_forgetting_old_key() {
        let mut active = vec![old()];
        let result = replace(
            &mut active,
            "Control+Space",
            |_| Ok(()),
            |key| if key == old() { Err(()) } else { Ok(()) },
        );
        assert_eq!(result, Err(ErrorCode::UnregisterFailed));
        assert_eq!(active, [old()]);
    }

    #[test]
    fn failed_rollback_tracks_both_keys_for_a_later_cleanup() {
        let mut active = vec![old()];
        assert_eq!(
            replace(&mut active, "Control+Space", |_| Ok(()), |_| Err(())),
            Err(ErrorCode::CleanupFailed)
        );
        assert_eq!(active.len(), 2);
        assert_eq!(
            replace(
                &mut active,
                "",
                |_| panic!("clear registered a key"),
                |_| Err(())
            ),
            Err(ErrorCode::UnregisterFailed)
        );
        assert_eq!(active.len(), 2);
        replace(
            &mut active,
            "",
            |_| panic!("clear registered a key"),
            |_| Ok(()),
        )
        .unwrap();
        assert!(active.is_empty());
    }
}
