//! Guardião anti-vazamento — censura preventiva de segredos na tela ao vivo.
//!
//! Arquitetura **hexagonal** (portas & adaptadores):
//!
//! ```text
//!                         ┌───────────────────────────┐
//!     adaptadores  ──────▶│          DOMÍNIO          │◀──────  adaptadores
//!   (ocr.rs, pipeline.rs) │ (domain.rs — 100% puro)   │
//!                         │  regras · geometria ·     │
//!                         │  Coverage (máquina do     │
//!                         │  tempo)                   │
//!                         └───────────────────────────┘
//! ```
//!
//! - **`domain`** — núcleo PURO: detecção de segredo, geometria das tarjas e a política de
//!   cobertura temporal. Sem nenhuma dependência de I/O → testável em isolamento.
//! - **`Ocr`** (porta, aqui embaixo) — a fronteira pra reconhecer texto. Adaptadores: PaddleOCR
//!   (GPU/DirectML) e Windows.Media.Ocr, em `ocr.rs`.
//! - **`pipeline`** — aplicação + adaptadores de I/O: processos FFmpeg (vídeo cru), pintura
//!   yuv420p, eventos Tauri. Orquestra fonte → buffer/domínio → saída.
//!
//! **A ideia central (máquina do tempo):** o vídeo passa por um buffer de N s no nosso processo
//! (delay REAL). A gente faz OCR de cada quadro amostrado e marca o resultado pelo ÍNDICE do
//! quadro. Quando ESSE MESMO quadro vai ao ar (N depois), a gente cobre o segredo usando o OCR
//! DELE — no lugar e na hora exatos. O atraso do OCR (~0,5–1 s) fica todo escondido pelo buffer,
//! então a tarja nunca atrasa nem vaza, e nunca tem deriva (cada quadro usa a própria detecção).

mod domain;
mod ocr;
mod pipeline;

pub use domain::{Leak, Region};
pub use pipeline::{run_protector, run_warn};

/// **Porta de OCR** (a fronteira do hexágono pra reconhecer texto). Recebe um quadro em
/// escala de cinza e devolve os vazamentos + as regiões (frações da tela). Implementada pelos
/// adaptadores em `ocr.rs` (PaddleOCR na GPU, Windows OCR, ou nulo se nada disponível).
pub(crate) trait Ocr: Send {
    fn scan(&self, gray: &[u8], w: usize, h: usize, watchlist: &[String]) -> (Vec<Leak>, Vec<Region>);
    fn name(&self) -> &'static str;
}
