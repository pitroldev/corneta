//! Cofre de chaves — usa o keychain nativo do SO via crate `keyring`.
//! Stream keys ficam no cofre, não no config.json.
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
            // Só esquecer após ausência confirmada; falha não é uma exclusão intencional.
            forget();
            Ok(())
        }
        Err(keyring::Error::NoStorageAccess(_)) => {
            Err(crate::i18n::Msg::VaultDeleteAccessDenied.now())
        }
        // Não interpolar detalhes do provider: alguns erros carregam dados da credencial.
        Err(_) => Err(crate::i18n::Msg::VaultDeleteFailed.now()),
    }
}

/// Tenta todos os slots; conjuntos de credenciais não têm transação no cofre do SO.
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

// ---------------------------------------------------------------------------
// Memória de presença — a rede que pega a chave que some sozinha
// ---------------------------------------------------------------------------

/// Ids que já apareceram COM chave nesta execução do app.
///
/// Só memória, de propósito: o `config.json` nunca guarda `has_key: true` (o arquivo não
/// pode ser fonte da verdade sobre credencial), então o disco é incapaz de responder "essa
/// chave existia antes?". Sem alguém guardando essa resposta, a chave que some sozinha —
/// relatada por um beta depois de encerrar a live — some sem deixar rastro nenhum.
static SEEN_PRESENT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn seen_present() -> &'static Mutex<HashSet<String>> {
    SEEN_PRESENT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// O cofre respondeu "tem chave" para estes ids.
pub fn remember_present<'a>(ids: impl Iterator<Item = &'a str>) {
    if let Ok(mut seen) = seen_present().lock() {
        for id in ids {
            seen.insert(id.to_string());
        }
    }
}

/// Esquece um id — some porque mandaram sumir.
pub fn forget_present(target_id: &str) {
    if let Ok(mut seen) = seen_present().lock() {
        seen.remove(target_id);
    }
}

/// Destinos cuja chave SUMIU sozinha, e esquece cada um (o aviso é uma vez por sumiço).
///
/// `current` é `(id, tem_chave_agora)` dos destinos que a configuração AINDA tem: destino
/// apagado não é chave sumida, é destino apagado.
pub fn drain_vanished(current: &[(String, bool)]) -> Vec<String> {
    let Ok(mut seen) = seen_present().lock() else {
        return vec![];
    };
    let sumiram = vanished_ids(&seen, current);
    for id in &sumiram {
        seen.remove(id);
    }
    sumiram
}

/// O núcleo puro da detecção: já teve chave, ainda está na configuração, e agora não tem.
fn vanished_ids(seen: &HashSet<String>, current: &[(String, bool)]) -> Vec<String> {
    current
        .iter()
        .filter(|(id, tem_agora)| !tem_agora && seen.contains(id))
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

    fn conjunto(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn chave_que_sumiu_sozinha_e_denunciada() {
        let seen = conjunto(&["destino-1", "destino-2"]);
        let agora = vec![
            ("destino-1".to_string(), true),
            ("destino-2".to_string(), false),
        ];
        assert_eq!(vanished_ids(&seen, &agora), vec!["destino-2".to_string()]);
    }

    /// Destino que NUNCA teve chave não é sumiço — é destino recém-criado, o caso comum.
    #[test]
    fn destino_sem_chave_desde_sempre_nao_e_sumico() {
        let seen = conjunto(&[]);
        let agora = vec![("novo".to_string(), false)];
        assert!(vanished_ids(&seen, &agora).is_empty());
    }

    /// Destino apagado sai da configuração inteiro. Não pode virar alarme: quem apagou o
    /// destino sabe muito bem que a chave dele foi junto.
    #[test]
    fn destino_apagado_nao_vira_alarme() {
        let seen = conjunto(&["foi-embora"]);
        let agora: Vec<(String, bool)> = vec![];
        assert!(vanished_ids(&seen, &agora).is_empty());
    }

    /// Ausência confirmada após exclusão intencional não é sumiço inesperado.
    #[test]
    fn apagar_na_mao_nao_denuncia() {
        remember_present(["apagada-na-mao"].into_iter());
        forget_present("apagada-na-mao");
        assert!(drain_vanished(&[("apagada-na-mao".to_string(), false)]).is_empty());
    }

    /// O aviso é UMA vez por sumiço: sem isso, cada `get_config` repetiria o mesmo alarme
    /// pra sempre e a telemetria viraria ruído.
    #[test]
    fn o_mesmo_sumico_so_denuncia_uma_vez() {
        remember_present(["some-uma-vez"].into_iter());
        let atual = vec![("some-uma-vez".to_string(), false)];
        assert_eq!(drain_vanished(&atual), vec!["some-uma-vez".to_string()]);
        assert!(drain_vanished(&atual).is_empty());
    }
}
