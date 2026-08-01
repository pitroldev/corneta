//! Adaptadores da porta [`Ocr`]: transformam pixels em TEXTO (a watchlist é casada no domínio).
//! Dois motores locais (sem nuvem — privacidade):
//! - **PaddleOCR** (PP-OCRv6 Tiny via ONNX Runtime na CPU) — preciso; a GPU fica pro codec.
//! - **Windows.Media.Ocr** — nativo, leve, sem baixar modelo (fallback / 1ª sessão).
//!
//! Antes do OCR a gente ENCOLHE o quadro (1280w) e limita a detecção (640) — corta custo sem
//! perder o texto que importa. O reconhecimento por linha domina, então o ganho real vem de OCR
//! menos vezes (o diff no pipeline pula quadros iguais).

use super::Ocr;
use crate::http_client as ureq;
use image::{DynamicImage, GrayImage};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::time::Duration;
use tauri::AppHandle;

/// Largura-alvo do OCR = resolução cheia (sem encolher o quadro 1920) → MÁXIMA precisão. Medido:
/// o custo por linha quase não muda com a resolução (o tempo é dominado pelo nº de linhas), então
/// vale ler no detalhe máximo; o delay de 12s absorve.
const OCR_TARGET_W: u32 = 1920;
/// Limite da detecção (lado maior). 1280 lê texto bem menor (nomes em feed denso) com custo baixo.
const DET_LIMIT: u32 = 1280;

/// Encolhe o plano de cinza pra ~`OCR_TARGET_W` de largura (no-op se já for menor).
fn downscale_gray(gray: &[u8], w: usize, h: usize) -> Option<GrayImage> {
    let img = GrayImage::from_raw(w as u32, h as u32, gray.to_vec())?;
    if w as u32 <= OCR_TARGET_W {
        return Some(img);
    }
    let nh = (h as u32 * OCR_TARGET_W / w as u32).max(1);
    Some(image::imageops::resize(
        &img,
        OCR_TARGET_W,
        nh,
        image::imageops::FilterType::Triangle,
    ))
}

// ----------------------------- PaddleOCR (CPU) -----------------------------

pub(super) struct PaddleOcr {
    inner: oar_ocr::oarocr::OAROCR,
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
        let results = match self.inner.predict(vec![rgb]) {
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

const MODELS: [(&str, u64, &str); 3] = [
    (
        "pp-ocrv6_tiny_det.onnx",
        1_780_590,
        "193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8",
    ),
    (
        "pp-ocrv6_tiny_rec.onnx",
        4_462_639,
        "9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6",
    ),
    (
        "ppocrv6_tiny_dict.txt",
        27_156,
        "c5cbe34ef40c29c4df07ed012bf96569cb69a2d2a01a07027e9f13cb832bd9cd",
    ),
];

fn verify_model(path: &std::path::Path, size: u64, expected_sha256: &str) -> bool {
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    if file.metadata().map(|m| m.len()).ok() != Some(size) {
        return false;
    }
    let mut reader = std::io::BufReader::with_capacity(64 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let Ok(read) = reader.read(&mut buffer) else {
            return false;
        };
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
        == expected_sha256
}

fn models_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    Some(app.path().app_config_dir().ok()?.join("ocr-models"))
}

/// Os 3 modelos PP-OCRv6 Tiny já estão baixados? (Paddle agora vs Windows OCR + baixar no fundo).
fn models_cached(app: &AppHandle) -> bool {
    match models_dir(app) {
        Some(dir) => MODELS
            .iter()
            .all(|(n, size, hash)| verify_model(&dir.join(n), *size, hash)),
        None => false,
    }
}

/// Garante os 3 modelos PP-OCRv6 Tiny (baixa do GitHub Releases na 1ª vez). (det, rec, dict).
static DL_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Com timeout por arquivo — uma rede ruim falha rápido (cai pro Windows OCR) em vez de pendurar.
fn ensure_paddle_models(
    app: &AppHandle,
    cache_already_verified: bool,
) -> Option<(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf)> {
    let _guard = DL_GUARD.lock().ok()?;
    let dir = models_dir(app)?;
    std::fs::create_dir_all(&dir).ok()?;
    let base = "https://github.com/GreatV/oar-ocr/releases/download/v0.7.0";
    let mut paths = Vec::new();
    for (n, size, expected_sha256) in MODELS {
        let p = dir.join(n);
        if !cache_already_verified && !verify_model(&p, size, expected_sha256) {
            log::info!("OCR: baixando modelo {n}…");
            let resp = ureq::get(format!("{base}/{n}"))
                .timeout(Duration::from_secs(60))
                .call()
                .ok()?;
            // Baixa e calcula o hash em streaming: o maior modelo não precisa existir duas vezes
            // (buffer HTTP + buffer de escrita) na memória do processo.
            let tmp = p.with_extension("part");
            let mut reader = resp.into_reader().take(size + 1);
            let mut output =
                std::io::BufWriter::with_capacity(64 * 1024, std::fs::File::create(&tmp).ok()?);
            let mut hasher = Sha256::new();
            let mut total = 0u64;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let read = reader.read(&mut buffer).ok()?;
                if read == 0 {
                    break;
                }
                total += read as u64;
                hasher.update(&buffer[..read]);
                output.write_all(&buffer[..read]).ok()?;
            }
            output.flush().ok()?;
            drop(output);
            let actual_sha256 = hasher
                .finalize()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            if total != size || actual_sha256 != expected_sha256 {
                let _ = std::fs::remove_file(&tmp);
                log::error!("OCR: integridade inválida em {n}; download descartado");
                return None;
            }
            // Escreve em .part e troca atômico → um download interrompido NUNCA deixa um arquivo
            // parcial que o `models_cached` trataria como válido.
            let _ = std::fs::remove_file(&p);
            std::fs::rename(&tmp, &p).ok()?;
            log::info!("OCR: {n} ok ({} KB)", total / 1024);
        }
        paths.push(p);
    }
    Some((paths[0].clone(), paths[1].clone(), paths[2].clone()))
}

/// Constrói o pipeline PaddleOCR (uma vez) na CPU, afinado pra latência baixa. None se falhar.
/// CPU (não GPU): o decode/encode já ocupam a GPU (NVDEC/NVENC) e o OCR na GPU disputava o codec,
/// degradando pra 5-15s ao vivo. Intra-threads limitado (sobra core pro encoder/compositor).
fn build_paddle(app: &AppHandle, cache_already_verified: bool) -> Option<PaddleOcr> {
    use oar_ocr::core::config::onnx::{OrtExecutionProvider, OrtSessionConfig};
    use oar_ocr::domain::tasks::TextDetectionConfig;
    let (det, rec, dict) = ensure_paddle_models(app, cache_already_verified)?;
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let intra = (cores / 2).clamp(2, 8);
    let ort_cfg = OrtSessionConfig::new()
        .with_execution_providers(vec![OrtExecutionProvider::CPU])
        .with_intra_threads(intra)
        .with_inter_threads(1);
    let inner = oar_ocr::oarocr::OAROCRBuilder::new(det, rec, dict)
        .ort_session(ort_cfg)
        .text_detection_config(TextDetectionConfig {
            limit_side_len: Some(DET_LIMIT),
            ..Default::default()
        })
        .region_batch_size(8)
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
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg),
                image::ImageFormat::Jpeg,
            )
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
    writer.StoreAsync().ok()?.join().ok()?;
    let _ = writer.FlushAsync().ok()?.join();
    let _ = writer.DetachStream();
    stream.Seek(0).ok()?;
    let decoder = BitmapDecoder::CreateAsync(&stream).ok()?.join().ok()?;
    let bitmap = decoder.GetSoftwareBitmapAsync().ok()?.join().ok()?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok()?;
    let result = engine.RecognizeAsync(&bitmap).ok()?.join().ok()?;
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
        if let Some(p) = build_paddle(app, true) {
            return Box::new(p);
        }
        log::warn!("OCR: modelos em cache mas o PaddleOCR não subiu — fallback");
    } else {
        #[cfg(windows)]
        {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let _ = ensure_paddle_models(&app2, false);
            });
            log::info!("OCR: baixando PaddleOCR no fundo; Windows OCR nesta sessão");
        }
        #[cfg(not(windows))]
        {
            if let Some(p) = build_paddle(app, false) {
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
