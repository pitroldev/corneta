//! Detect explicit watchlist terms before delayed frames air; unavailable OCR stays covered.

pub(crate) mod domain;
mod ocr;
mod pipeline;

pub(crate) use pipeline::{spawn_ocr, Shared};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum OcrError {
    InvalidFrame,
    Unavailable,
    RecognitionFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GuardianStatus {
    Starting,
    Ready,
    Unavailable,
}

/// Failed recognition must remain distinct from successfully reading an empty frame.
pub(crate) trait Ocr: Send {
    fn read_text(&self, gray: &[u8], w: usize, h: usize) -> Result<String, OcrError>;
    fn name(&self) -> &'static str;
}
