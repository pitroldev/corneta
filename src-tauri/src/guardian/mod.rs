//! Guardião de privacidade — mostra a tela "JÁ VOLTO" quando um termo que o usuário DEFINIU
//! aparece na transmissão, ANTES de ir ao ar (preventivo, via buffer de delay fixo).
//!
//! Arquitetura **hexagonal** (portas & adaptadores):
//!
//! ```text
//!                         ┌───────────────────────────┐
//!     adaptadores  ──────▶│          DOMÍNIO          │◀──────  adaptadores
//!   (ocr.rs, pipeline.rs) │ (domain.rs — 100% puro)   │
//!                         │  watchlist · diff ·       │
//!                         │  Timeline (máquina do     │
//!                         │  tempo, binária)          │
//!                         └───────────────────────────┘
//! ```
//!
//! - **`domain`** — núcleo PURO: casa a watchlist, decide se a tela mudou (pra pular OCR) e a linha
//!   do tempo binária "tinha segredo no quadro X?". Sem I/O → testável em isolamento.
//! - **`Ocr`** (porta) — a fronteira pra LER o texto da tela. Adaptadores: PaddleOCR (CPU) e
//!   Windows.Media.Ocr, em `ocr.rs`. Devolve só o texto (a posição não importa — slate é a tela toda).
//! - **`pipeline`** — o lado do OCR: worker + `Shared` (scan_slot/Timeline). A bomba de quadros
//!   (buffer de delay, slate, encoder contínuo) mora no `compositor` — o guardião é o feed de
//!   programa com delay + esta detecção pendurada.
//!
//! Só vigia os termos EXPLÍCITOS do
//! usuário (não lê "qualquer segredo"), a censura é binária (slate, sem precisão de posição), e o
//! OCR pula quadros que não mudaram (diff). O atraso do OCR fica escondido pelo buffer fixo.

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

/// **Porta de OCR** (a fronteira do hexágono pra ler o texto da tela). Recebe um quadro em escala
/// de cinza e devolve TODO o texto reconhecido (a watchlist é casada no domínio). Implementada
/// pelos adaptadores em `ocr.rs` (PaddleOCR na CPU, Windows OCR, ou nulo se nada disponível).
pub(crate) trait Ocr: Send {
    fn read_text(&self, gray: &[u8], w: usize, h: usize) -> Result<String, OcrError>;
    fn name(&self) -> &'static str;
}
