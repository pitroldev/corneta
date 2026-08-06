//! Adaptador do VOLUME: espaço livre e validação da pasta escolhida.
//!
//! Só mede e sonda. Todo julgamento ("isso é pouco espaço?", "isso é caminho de rede?")
//! mora em [`super::domain`].

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use super::domain::{DirCheck, DirProblem};
use crate::session;

/// Bytes livres no volume da pasta (não no disco do sistema).
///
/// A checagem tem que olhar o volume ESCOLHIDO: o streamer aponta pro HD de gravação
/// justamente pra não encher o SSD do sistema, e medir o lugar errado tornaria a proteção
/// decorativa.
#[cfg(windows)]
pub fn free_bytes(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free: u64 = 0;
    unsafe {
        GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free), None, None).ok()?;
    }
    Some(free)
}

#[cfg(not(windows))]
pub fn free_bytes(_dir: &Path) -> Option<u64> {
    None
}

/// Valida na hora de ESCOLHER, não na hora de gravar: descobrir que a pasta não presta
/// quando o streamer aperta BORA é tarde demais.
pub fn check_dir(dir: &Path) -> DirCheck {
    if dir.as_os_str().is_empty() || !dir.exists() {
        return DirCheck::problem(DirProblem::Missing);
    }
    if !dir.is_dir() {
        return DirCheck::problem(DirProblem::NotDir);
    }
    // Escrever de verdade e apagar. No Windows a permissão MENTE: atributo somente-leitura,
    // ACL negando, pasta sincronizada por serviço de nuvem — só o teste real responde.
    let probe = dir.join(".corneta-write-test");
    match std::fs::write(&probe, b"corneta") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
        }
        Err(_) => return DirCheck::problem(DirProblem::ReadOnly),
    }
    DirCheck::healthy(&dir.to_string_lossy(), free_bytes(dir))
}

/// Nomes dos arquivos da pasta (sem caminho). Quem filtra o que é gravação é o domínio.
pub fn file_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .flatten()
        .filter_map(|e| e.file_name().to_str().map(str::to_owned))
        .collect()
}

/// Tamanho do arquivo em bytes (0 quando não dá pra ler) — é o que responde "o arquivo
/// está crescendo?" quando o `-progress` não deu as caras.
pub fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Pasta efetiva das gravações: a configurada, ou a de sessões quando vazia.
///
/// O padrão é VAZIO (e não um caminho concreto) porque o config viaja entre perfis e é lido
/// pelos dois lados — um caminho gravado amarraria a configuração a uma máquina.
pub fn resolve_dir(app: &AppHandle, configured: &str) -> Option<PathBuf> {
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let p = PathBuf::from(trimmed);
        if p.is_dir() {
            return Some(p);
        }
        // Pasta configurada sumiu (renomeada, unidade arrancada): NÃO recria no escuro e
        // NÃO cai calado pra outro lugar — quem chama avisa e segue sem gravar.
        log::warn!("gravação: pasta configurada indisponível: {}", p.display());
        return None;
    }
    session::sessions_dir(app)
}
