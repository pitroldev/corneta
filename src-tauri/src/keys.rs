//! Cofre de chaves — usa o keychain nativo do SO via crate `keyring`.
//! As stream keys NUNCA são gravadas no config.json (ver §14.6).
use keyring::Entry;

const SERVICE: &str = "br.com.pitroldev.corneta";

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

pub fn clear_key(target_id: &str) -> Result<(), String> {
    // delete_credential é a API do keyring v3; ignorar erro de "não existe".
    let _ = entry(target_id)?.delete_credential();
    Ok(())
}

pub fn has_key(target_id: &str) -> bool {
    get_key(target_id).is_some()
}
