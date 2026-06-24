//! Adaptadores da porta [`Ocr`]: transformam pixels em texto+caixas e chamam as regras do
//! domínio. Dois motores locais (sem nuvem — privacidade):
//! - **PaddleOCR** (PP-OCRv5 via ONNX Runtime na GPU/DirectML) — mais preciso e tira o OCR da CPU.
//! - **Windows.Media.Ocr** — nativo, leve, sem baixar modelo (fallback / modo "avisar").
//!
//! Antes do OCR a gente ENCOLHE o quadro (as caixas são frações → a posição não muda), o que
//! corta o custo de detecção e de transferência. O reconhecimento por linha domina em tela cheia,
//! então o ganho real de leveza vem de OCR menos vezes (amostragem no pipeline), não da resolução.

use super::domain::{self, Leak, Region, Word};
use super::Ocr;
use image::{DynamicImage, GrayImage};
use std::time::Duration;
use tauri::AppHandle;

/// Largura-alvo do OCR. 1280 ainda lê texto pequeno (chaves/e-mail) com bem menos custo que 1080p.
const OCR_TARGET_W: u32 = 1280;

/// Encolhe o plano de cinza pra ~`OCR_TARGET_W` de largura (no-op se já for menor).
fn downscale_gray(gray: &[u8], w: usize, h: usize) -> Option<GrayImage> {
    let img = GrayImage::from_raw(w as u32, h as u32, gray.to_vec())?;
    if w as u32 <= OCR_TARGET_W {
        return Some(img);
    }
    let nh = (h as u32 * OCR_TARGET_W / w as u32).max(1);
    Some(image::imageops::resize(&img, OCR_TARGET_W, nh, image::imageops::FilterType::Triangle))
}

// ----------------------------- PaddleOCR (GPU) -----------------------------

pub(super) struct PaddleOcr {
    inner: oar_ocr::pipeline::OAROCR,
}

impl Ocr for PaddleOcr {
    fn name(&self) -> &'static str {
        "PaddleOCR (DirectML/GPU)"
    }

    fn scan(&self, gray: &[u8], w: usize, h: usize, watchlist: &[String]) -> (Vec<Leak>, Vec<Region>) {
        let Some(small) = downscale_gray(gray, w, h) else {
            return (vec![], vec![]);
        };
        let (sw, sh) = (small.width() as f32, small.height() as f32);
        let rgb = DynamicImage::ImageLuma8(small).into_rgb8();
        let results = match self.inner.predict(&[rgb]) {
            Ok(r) => r,
            Err(_) => return (vec![], vec![]),
        };
        let Some(res) = results.first() else {
            return (vec![], vec![]);
        };
        let mut full = String::new();
        let mut words: Vec<Word> = Vec::new();
        for region in &res.text_regions {
            let Some(text) = &region.text else { continue };
            if text.trim().is_empty() {
                continue;
            }
            let pts = &region.bounding_box.points;
            let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for p in pts {
                minx = minx.min(p.x);
                miny = miny.min(p.y);
                maxx = maxx.max(p.x);
                maxy = maxy.max(p.y);
            }
            if !full.is_empty() {
                full.push(' ');
            }
            let start = full.len();
            full.push_str(text);
            let end = full.len();
            words.push(Word {
                start,
                end,
                fx: minx / sw,
                fy: miny / sh,
                fw: (maxx - minx) / sw,
                fh: (maxy - miny) / sh,
            });
        }
        if full.trim().is_empty() {
            return (vec![], vec![]);
        }
        domain::scan(&full, &words, watchlist)
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

/// Os 3 modelos PP-OCRv5 já estão baixados? (decide GPU agora vs Windows OCR + baixar no fundo).
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
            // parcial que o `models_cached` trataria como válido (cairia num modelo corrompido).
            let tmp = p.with_extension("part");
            std::fs::write(&tmp, &bytes).ok()?;
            std::fs::rename(&tmp, &p).ok()?;
            log::info!("OCR: {n} ok ({} KB)", bytes.len() / 1024);
        }
        paths.push(p);
    }
    Some((paths[0].clone(), paths[1].clone(), paths[2].clone()))
}

/// Constrói o pipeline PaddleOCR (uma vez) na GPU (DirectML), CPU como fallback. None se falhar.
fn build_paddle(app: &AppHandle) -> Option<PaddleOcr> {
    use oar_ocr::core::config::onnx::{OrtExecutionProvider, OrtSessionConfig};
    let (det, rec, dict) = ensure_paddle_models(app)?;
    let ort_cfg = OrtSessionConfig::new().with_execution_providers(vec![
        OrtExecutionProvider::DirectML { device_id: Some(0) },
        OrtExecutionProvider::CPU,
    ]);
    let inner = oar_ocr::pipeline::OAROCRBuilder::new(
        det.to_string_lossy().to_string(),
        rec.to_string_lossy().to_string(),
        dict.to_string_lossy().to_string(),
    )
    .global_ort_session(ort_cfg)
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

    fn scan(&self, gray: &[u8], w: usize, h: usize, watchlist: &[String]) -> (Vec<Leak>, Vec<Region>) {
        let Some(small) = downscale_gray(gray, w, h) else {
            return (vec![], vec![]);
        };
        let mut jpeg = Vec::new();
        if small
            .write_to(&mut std::io::Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
            .is_err()
        {
            return (vec![], vec![]);
        }
        match ocr_words_jpeg(&jpeg) {
            Some((text, words)) if !text.trim().is_empty() => domain::scan(&text, &words, watchlist),
            _ => (vec![], vec![]),
        }
    }
}

/// OCR via Windows.Media.Ocr (nativo) sobre um JPEG → texto + palavras com bbox em frações.
#[cfg(windows)]
pub(super) fn ocr_words_jpeg(bytes: &[u8]) -> Option<(String, Vec<Word>)> {
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
    let bw = bitmap.PixelWidth().ok()?.max(1) as f32;
    let bh = bitmap.PixelHeight().ok()?.max(1) as f32;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok()?;
    let result = engine.RecognizeAsync(&bitmap).ok()?.get().ok()?;

    let mut full = String::new();
    let mut words = vec![];
    let lines = result.Lines().ok()?;
    for i in 0..lines.Size().ok()? {
        let line = lines.GetAt(i).ok()?;
        let ws = line.Words().ok()?;
        for j in 0..ws.Size().ok()? {
            let word = ws.GetAt(j).ok()?;
            let text = word.Text().ok()?.to_string();
            let r = word.BoundingRect().ok()?;
            let start = full.len();
            full.push_str(&text);
            let end = full.len();
            full.push(' ');
            words.push(Word {
                start,
                end,
                fx: r.X / bw,
                fy: r.Y / bh,
                fw: r.Width / bw,
                fh: r.Height / bh,
            });
        }
        full.push('\n');
    }
    Some((full, words))
}

// -------------------------------- Fallback ---------------------------------

/// OCR que não reconhece nada (degrada com elegância se nenhum motor está disponível).
/// Só usado fora do Windows, onde não há o motor nativo como fallback.
#[cfg(not(windows))]
struct NullOcr;
#[cfg(not(windows))]
impl Ocr for NullOcr {
    fn name(&self) -> &'static str {
        "nenhum (OCR indisponível)"
    }
    fn scan(&self, _g: &[u8], _w: usize, _h: usize, _wl: &[String]) -> (Vec<Leak>, Vec<Region>) {
        (vec![], vec![])
    }
}

/// Escolhe o melhor motor disponível, **sem nunca travar o arranque da live esperando download**.
/// `prefer_gpu` (modo censurar):
/// - Modelos em cache → PaddleOCR na GPU (preciso + libera a CPU).
/// - 1ª vez (sem cache) → baixa o Paddle NO FUNDO (próxima sessão usa GPU) e usa o Windows OCR
///   AGORA, que é instantâneo e cobre a janela do buffer (sem vazar no arranque).
///
/// Chame DENTRO da thread que vai usar o OCR (evita mover sessões ONNX entre threads).
pub(super) fn build_ocr(app: &AppHandle, prefer_gpu: bool) -> Box<dyn Ocr> {
    if prefer_gpu {
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
                // Sem Windows OCR de fallback: precisa baixar agora (com timeout).
                if let Some(p) = build_paddle(app) {
                    return Box::new(p);
                }
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
