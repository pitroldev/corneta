//! Credentials belong in the OS vault, never in config.json.
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use keyring::Entry;

#[cfg(not(corneta_contributor))]
const SERVICE: &str = "br.com.pitroldev.corneta";
#[cfg(corneta_contributor)]
const SERVICE: &str = "br.com.pitroldev.corneta.contributor";

fn entry(target_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, target_id).map_err(|e| format!("keyring: {e}"))
}

pub fn set_key(target_id: &str, key: &str) -> Result<(), String> {
    entry(target_id)?
        .set_password(key)
        .map_err(|e| format!("set_password: {e}"))
}

pub fn get_key(target_id: &str) -> Option<String> {
    entry(target_id).ok()?.get_password().ok()
}

/// Recovery journals must distinguish a missing entry from an unavailable vault.
pub(crate) fn read_key(target_id: &str) -> Result<Option<String>, String> {
    read_key_with(|| Entry::new(SERVICE, target_id)?.get_password())
}

fn read_key_with(read: impl FnOnce() -> keyring::Result<String>) -> Result<Option<String>, String> {
    match read() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(crate::i18n::Msg::VaultReadFailed.now()),
    }
}

pub fn clear_key(target_id: &str) -> Result<(), String> {
    clear_key_with(
        || Entry::new(SERVICE, target_id)?.delete_credential(),
        || forget_present(target_id),
    )
}

fn clear_key_with(
    delete: impl FnOnce() -> keyring::Result<()>,
    forget: impl FnOnce(),
) -> Result<(), String> {
    match delete() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            // Forget presence only after confirmed deletion or absence.
            forget();
            Ok(())
        }
        Err(keyring::Error::NoStorageAccess(_)) => {
            Err(crate::i18n::Msg::VaultDeleteAccessDenied.now())
        }
        // Provider errors can contain credential data.
        Err(_) => Err(crate::i18n::Msg::VaultDeleteFailed.now()),
    }
}

/// Attempt every slot; the OS vault cannot delete a credential set transactionally.
pub(crate) fn clear_keys(target_ids: &[&str]) -> Result<(), String> {
    clear_keys_with(target_ids, clear_key)
}

fn clear_keys_with(
    target_ids: &[&str],
    mut delete: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    let mut failed = 0;
    for id in target_ids {
        if delete(id).is_err() {
            failed += 1;
        }
    }
    if failed == 0 {
        Ok(())
    } else {
        Err(crate::i18n::Msg::VaultDeleteIncomplete {
            failed,
            total: target_ids.len(),
        }
        .now())
    }
}

pub fn has_key(target_id: &str) -> bool {
    get_key(target_id).is_some()
}

// Track presence only in memory; configuration must not become credential truth.
static SEEN_PRESENT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn seen_present() -> &'static Mutex<HashSet<String>> {
    SEEN_PRESENT.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn remember_present<'a>(ids: impl Iterator<Item = &'a str>) {
    if let Ok(mut seen) = seen_present().lock() {
        for id in ids {
            seen.insert(id.to_string());
        }
    }
}

pub fn forget_present(target_id: &str) {
    if let Ok(mut seen) = seen_present().lock() {
        seen.remove(target_id);
    }
}

/// Report each unexpected disappearance once; omit deliberately removed destinations from `current`.
pub fn drain_vanished(current: &[(String, bool)]) -> Vec<String> {
    let Ok(mut seen) = seen_present().lock() else {
        return vec![];
    };
    let vanished = vanished_ids(&seen, current);
    for id in &vanished {
        seen.remove(id);
    }
    vanished
}

fn vanished_ids(seen: &HashSet<String>, current: &[(String, bool)]) -> Vec<String> {
    current
        .iter()
        .filter(|(id, present)| !present && seen.contains(id))
        .map(|(id, _)| id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_read_distinguishes_absence_from_failure_without_echoing_provider_data() {
        assert_eq!(
            read_key_with(|| Ok("fixture".into())),
            Ok(Some("fixture".into()))
        );
        assert_eq!(read_key_with(|| Err(keyring::Error::NoEntry)), Ok(None));
        let error = read_key_with(|| Err(keyring::Error::BadEncoding(b"private-fixture".to_vec())))
            .unwrap_err();
        assert!(!error.contains("private-fixture"));
    }

    #[test]
    fn deletion_only_forgets_confirmed_absence_without_accessing_the_os_store() {
        for result in [Ok(()), Err(keyring::Error::NoEntry)] {
            let mut forgotten = false;
            assert!(clear_key_with(|| result, || forgotten = true).is_ok());
            assert!(forgotten);
        }
        for error in [
            keyring::Error::NoStorageAccess(Box::new(std::io::Error::from(
                std::io::ErrorKind::PermissionDenied,
            ))),
            keyring::Error::PlatformFailure(Box::new(std::io::Error::other("store unavailable"))),
            keyring::Error::NoDefaultStore,
            keyring::Error::BadEncoding(b"sensitive-test-payload".to_vec()),
        ] {
            let mut forgotten = false;
            let error = clear_key_with(|| Err(error), || forgotten = true).unwrap_err();
            assert!(!forgotten);
            assert!(!error.contains("sensitive-test-payload"));
        }
    }

    #[test]
    fn partial_deletion_tries_every_slot_and_never_reports_success() {
        let mut attempted = Vec::new();
        let result = clear_keys_with(&["access", "refresh", "mode"], |id| {
            attempted.push(id.to_string());
            if id == "refresh" {
                Err("unavailable".into())
            } else {
                Ok(())
            }
        });
        assert!(result.is_err());
        assert_eq!(attempted, ["access", "refresh", "mode"]);
        assert!(clear_keys_with(&["access", "refresh"], |_| Ok(())).is_ok());
    }

    fn id_set(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn reports_unexpected_credential_disappearance() {
        let seen = id_set(&["destino-1", "destino-2"]);
        let current = vec![
            ("destino-1".to_string(), true),
            ("destino-2".to_string(), false),
        ];
        assert_eq!(vanished_ids(&seen, &current), vec!["destino-2".to_string()]);
    }

    #[test]
    fn never_present_credentials_are_not_reported_missing() {
        let seen = id_set(&[]);
        let current = vec![("novo".to_string(), false)];
        assert!(vanished_ids(&seen, &current).is_empty());
    }

    #[test]
    fn removed_destinations_are_not_reported_missing() {
        let seen = id_set(&["foi-embora"]);
        let current: Vec<(String, bool)> = vec![];
        assert!(vanished_ids(&seen, &current).is_empty());
    }

    #[test]
    fn intentional_deletion_is_not_reported_missing() {
        remember_present(["apagada-na-mao"].into_iter());
        forget_present("apagada-na-mao");
        assert!(drain_vanished(&[("apagada-na-mao".to_string(), false)]).is_empty());
    }

    #[test]
    fn reports_each_disappearance_once() {
        remember_present(["some-uma-vez"].into_iter());
        let current = vec![("some-uma-vez".to_string(), false)];
        assert_eq!(drain_vanished(&current), vec!["some-uma-vez".to_string()]);
        assert!(drain_vanished(&current).is_empty());
    }
}
