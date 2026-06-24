//! Adaptadores da porta [`Ocr`]: transformam pixels em TEXTO (a watchlist é casada no domínio).
//! Dois motores locais (sem nuvem — privacidade):
//! - **PaddleOCR** (PP-OCRv5 via ONNX Runtime na CPU) — mais preciso; a GPU fica pro codec.
//! - **Windows.Media.Ocr** — nativo, leve, sem baixar modelo (fallback / 1ª sessão).
//!
//! Antes do OCR a gente ENCOLHE o quadro (1280w) e limita a detecção (640) — corta custo sem
//! perder o texto que importa. O reconhecimento por linha domina, então o ganho real vem de OCR
//! menos vezes (o diff no pipeline pula quadros iguais).

use super::Ocr;
use image::{DynamicImage, GrayImage};
use std::time::Duration;
use tauri::AppHandle;

/// Largura-alvo do OCR. 1280 ainda lê texto pequeno com bem menos custo que 1080p.
const OCR_TARGET_W: u32 = 1280;
/// Limite da detecção (lado maior). Menor = detecção mais rápida e menos caixas (~17% medido).
const DET_LIMIT: u32 = 640;

/// Encolhe o plano de cinza pra ~`OCR_TARGET_W` de largura (no-op se já for menor).
fn downscale_gray(gray: &[u8], w: usize, h: usize) -> Option<GrayImage> {
    let img = GrayImage::from_raw(w as u32, h as u32, gray.to_vec())?;
    if w as u32 <= OCR_TARGET_W {
        return Some(img);
    }
    let nh = (h as u32 * OCR_TARGET_W / w as u32).max(1);
    Some(image::imageops::resize(&img, OCR_TARGET_W, nh, image::imageops::FilterType::Triangle))
}

// ----------------------------- PaddleOCR (CPU) -----------------------------

pub(super) struct PaddleOcr {
    inner: oar_ocr::pipeline::OAROCR,
}

impl Ocr for PaddleOcr {
    fn name(&self) -> &'static str {
        "PaddleOCR (CPU)"
    }

    fn read_text(&self, gray: &[u8], w: usize, h: usize) -> String {
        let Some(small) = downscale_gray(gray, w, h) else {
            return String::new();
        };
        let rgb = DynamicImage::ImageLuma8(small).into_rgb8();
        let results = match self.inner.predict(&[rgb]) {
            Ok(r) => r,
            Err(_) => return String::new(),
        };
        let Some(res) = results.first() else {
            return String::new();
        };
        let mut full = String::new();
        for region in &res.text_regions {
            if let Some(text) = &region.text {
                if !text.trim().is_empty() {
                    full.push_str(text);
                    full.push(' ');
                }
            }
        }
        full
    }
}

const MODEL_NAMES: [&str; 3] = [
    "pp-ocrv5_mobile_det.onnx",
    "pp-ocrv5_mobile_rec.onnx",
    "ppocrv5_dict.txt",
];

fn models_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    Some(app.path().app_config_dir().ok()?.join("ocr-models"))
}

/// Os 3 modelos PP-OCRv5 já estão baixados? (Paddle agora vs Windows OCR + baixar no fundo).
fn models_cached(app: &AppHandle) -> bool {
    match models_dir(app) {
        Some(dir) => MODEL_NAMES.iter().all(|n| dir.join(n).exists()),
        None => false,
    }
}

/// Garante os 3 modelos PP-OCRv5 (baixa do GitHub Releases na 1ª vez). (det, rec, dict).
/// Com timeout por arquivo — uma rede ruim falha rápido (cai pro Windows OCR) em vez de pendurar.
fn ensure_paddle_models(
    app: &AppHandle,
) -> Option<(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf)> {
    let dir = models_dir(app)?;
    std::fs::create_dir_all(&dir).ok()?;
    let base = "https://github.com/GreatV/oar-ocr/releases/download/v0.3.0";
    let mut paths = Vec::new();
    for n in MODEL_NAMES {
        let p = dir.join(n);
        if !p.exists() {
            log::info!("OCR: baixando modelo {n}…");
            let resp = ureq::get(&format!("{base}/{n}"))
                .timeout(Duration::from_secs(60))
                .call()
                .ok()?;
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut resp.into_reader(), &mut bytes).ok()?;
            // Escreve em .part e troca atômico → um download interrompido NUNCA deixa um arquivo
            // parcial que o `models_cached` trataria como válido.
            let tmp = p.with_extension("part");
            std::fs::write(&tmp, &bytes).ok()?;
            std::fs::rename(&tmp, &p).ok()?;
            log::info!("OCR: {n} ok ({} KB)", bytes.len() / 1024);
        }
        paths.push(p);
    }
    Some((paths[0].clone(), paths[1].clone(), paths[2].clone()))
}

/// Constrói o pipeline PaddleOCR (uma vez) na CPU, afinado pra latência baixa. None se falhar.
/// CPU (não GPU): o decode/encode já ocupam a GPU (NVDEC/NVENC) e o OCR na GPU disputava o codec,
/// degradando pra 5-15s ao vivo. Intra-threads limitado (sobra core pro encoder/compositor).
fn build_paddle(app: &AppHandle) -> Option<PaddleOcr> {
    use oar_ocr::core::config::onnx::{OrtExecutionProvider, OrtSessionConfig};
    let (det, rec, dict) = ensure_paddle_models(app)?;
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let intra = (cores / 2).clamp(2, 8);
    let ort_cfg = OrtSessionConfig::new()
        .with_execution_providers(vec![OrtExecutionProvider::CPU])
        .with_intra_threads(intra)
        .with_inter_threads(1);
    let inner = oar_ocr::pipeline::OAROCRBuilder::new(
        det.to_string_lossy().to_string(),
        rec.to_string_lossy().to_string(),
        dict.to_string_lossy().to_string(),
    )
    .global_ort_session(ort_cfg)
    .text_det_limit_side_len(DET_LIMIT)
    .text_recognition_batch_size(8)
    .build()
    .ok()?;
    Some(PaddleOcr { inner })
}

// --------------------------- Windows.Media.Ocr -----------------------------

#[cfg(windows)]
pub(super) struct WindowsOcr;

#[cfg(windows)]
impl Ocr for WindowsOcr {
    fn name(&self) -> &'static str {
        "Windows.Media.Ocr"
    }

    fn read_text(&self, gray: &[u8], w: usize, h: usize) -> String {
        let Some(small) = downscale_gray(gray, w, h) else {
            return String::new();
        };
        let mut jpeg = Vec::new();
        if small
            .write_to(&mut std::io::Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
            .is_err()
        {
            return String::new();
        }
        ocr_text_jpeg(&jpeg).unwrap_or_default()
    }
}

/// OCR via Windows.Media.Ocr (nativo) sobre um JPEG → texto reconhecido.
#[cfg(windows)]
fn ocr_text_jpeg(bytes: &[u8]) -> Option<String> {
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    let stream = InMemoryRandomAccessStream::new().ok()?;
    let writer = DataWriter::CreateDataWriter(&stream).ok()?;
    writer.WriteBytes(bytes).ok()?;
    writer.StoreAsync().ok()?.get().ok()?;
    let _ = writer.FlushAsync().ok()?.get();
    let _ = writer.DetachStream();
    stream.Seek(0).ok()?;
    let decoder = BitmapDecoder::CreateAsync(&stream).ok()?.get().ok()?;
    let bitmap = decoder.GetSoftwareBitmapAsync().ok()?.get().ok()?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok()?;
    let result = engine.RecognizeAsync(&bitmap).ok()?.get().ok()?;
    Some(result.Text().ok()?.to_string())
}

// -------------------------------- Fallback ---------------------------------

/// OCR que não lê nada (degrada com elegância se nenhum motor está disponível).
/// Só usado fora do Windows, onde não há o motor nativo como fallback.
#[cfg(not(windows))]
struct NullOcr;
#[cfg(not(windows))]
impl Ocr for NullOcr {
    fn name(&self) -> &'static str {
        "nenhum (OCR indisponível)"
    }
    fn read_text(&self, _g: &[u8], _w: usize, _h: usize) -> String {
        String::new()
    }
}

/// Escolhe o melhor motor, **sem nunca travar o arranque da live esperando download**:
/// - Modelos em cache → PaddleOCR na CPU (preciso).
/// - 1ª vez (sem cache) → baixa o Paddle NO FUNDO (próxima sessão usa) e usa o Windows OCR AGORA.
///
/// Chame DENTRO da thread que vai usar o OCR (evita mover sessões ONNX entre threads).
pub(super) fn build_ocr(app: &AppHandle) -> Box<dyn Ocr> {
    if models_cached(app) {
        if let Some(p) = build_paddle(app) {
            return Box::new(p);
        }
        log::warn!("OCR: modelos em cache mas o PaddleOCR não subiu — fallback");
    } else {
        #[cfg(windows)]
        {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let _ = ensure_paddle_models(&app2);
            });
            log::info!("OCR: baixando PaddleOCR no fundo; Windows OCR nesta sessão");
        }
        #[cfg(not(windows))]
        {
            if let Some(p) = build_paddle(app) {
                return Box::new(p);
            }
        }
    }
    #[cfg(windows)]
    {
        Box::new(WindowsOcr)
    }
    #[cfg(not(windows))]
    {
        Box::new(NullOcr)
    }
}
