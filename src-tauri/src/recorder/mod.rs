//! Recording failures must not stop streaming. Drop video before chat, reports or the live feed.
//! Fragmented MP4 survives interrupted writes; a final copy-only remux restores efficient seeking.

pub mod disk;
pub mod domain;
pub mod ffmpeg;

pub use disk::{check_dir, free_bytes, resolve_dir};
pub use domain::{DirCheck, DISK_START_FLOOR};
pub use ffmpeg::{run, test_record};

/// Register under this key so every engine shutdown also stops the recorder.
pub const RECORDER_KEY: &str = "__recorder";

#[cfg(test)]
mod tests;
