use std::path::{Path, PathBuf};

use tauri::AppHandle;

use super::domain::{DirCheck, DirProblem};
use crate::session;

/// Free space on the recording folder's volume, which may differ from the system volume.
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

pub fn check_dir(dir: &Path) -> DirCheck {
    if dir.as_os_str().is_empty() || !dir.exists() {
        return DirCheck::problem(DirProblem::Missing);
    }
    if !dir.is_dir() {
        return DirCheck::problem(DirProblem::NotDir);
    }
    // A real write catches ACL and cloud-sync restrictions that permission metadata misses.
    let probe = dir.join(".corneta-write-test");
    match std::fs::write(&probe, b"corneta") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
        }
        Err(_) => return DirCheck::problem(DirProblem::ReadOnly),
    }
    DirCheck::healthy(&dir.to_string_lossy(), free_bytes(dir))
}

pub fn file_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .flatten()
        .filter_map(|e| e.file_name().to_str().map(str::to_owned))
        .collect()
}

/// Returns zero on failure; growth detection also works when FFmpeg progress is absent.
pub fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// An empty setting selects the local session directory, keeping exported profiles portable.
pub fn resolve_dir(app: &AppHandle, configured: &str) -> Option<PathBuf> {
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let p = PathBuf::from(trimmed);
        if p.is_dir() {
            return Some(p);
        }
        // Never silently recreate or substitute a missing user-selected directory.
        log::warn!(
            "recording: configured directory unavailable: {}",
            p.display()
        );
        return None;
    }
    session::sessions_dir(app)
}
