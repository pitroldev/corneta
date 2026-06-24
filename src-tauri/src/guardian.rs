//! Guardião anti-vazamento: amostra os frames de saída, faz OCR local (com bounding
//! boxes), procura segredo na tela e avisa/censura — cobrindo SÓ a região do segredo
//! (tarja) ou a tela toda. Ver docs/FEATURE-ANTI-VAZAMENTO.md.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Região (frações 0–1 da tela): x, y, largura, altura.
pub type Region = (f32, f32, f32, f32);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Leak {
    pub kind: String,
    pub label: String,
    pub snippet: String,
    pub severity: String, // "high" (pode censurar) | "med" (só avisa)
}

/// Uma palavra do OCR: faixa de bytes no texto reconstruído + bbox em frações.
struct Word {
    start: usize,
    end: usize,
    fx: f32,
    fy: f32,
    fw: f32,
    fh: f32,
}

struct Pat {
    kind: &'static str,
    label: &'static str,
    re: Regex,
    severity: &'static str,
}

fn patterns() -> &'static [Pat] {
    static P: OnceLock<Vec<Pat>> = OnceLock::new();
    P.get_or_init(|| {
        vec![
            Pat { kind: "apikey", label: "Chave de API", severity: "high",
                  re: Regex::new(r"(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_\-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})").unwrap() },
            Pat { kind: "jwt", label: "Token (JWT)", severity: "high",
                  re: Regex::new(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}").unwrap() },
            Pat { kind: "password", label: "Senha exposta", severity: "high",
                  re: Regex::new(r"(?i)(senha|password|passwd|pwd)\s*[:=]\s*\S{4,}").unwrap() },
            Pat { kind: "cpf", label: "CPF", severity: "high",
                  re: Regex::new(r"\d{3}\.?\d{3}\.?\d{3}-?\d{2}").unwrap() },
            Pat { kind: "card", label: "Cartão", severity: "high",
                  re: Regex::new(r"\b(?:\d[ \-]?){13,16}\b").unwrap() },
            Pat { kind: "email", label: "E-mail", severity: "med",
                  re: Regex::new(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}").unwrap() },
            Pat { kind: "phone", label: "Telefone", severity: "med",
                  re: Regex::new(r"(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[\- ]?\d{4}").unwrap() },
        ]
    })
}

fn mask(s: &str) -> String {
    let head: String = s.chars().take(6).collect();
    format!("{head}…")
}

fn digits(s: &str) -> Vec<u32> {
    s.chars().filter_map(|c| c.to_digit(10)).collect()
}

fn valid_cpf(s: &str) -> bool {
    let d = digits(s);
    if d.len() != 11 || d.iter().all(|&x| x == d[0]) {
        return false;
    }
    let dv = |slice: &[u32], start: u32| -> u32 {
        let sum: u32 = slice.iter().enumerate().map(|(i, &x)| x * (start - i as u32)).sum();
        let r = (sum * 10) % 11;
        if r == 10 { 0 } else { r }
    };
    dv(&d[..9], 10) == d[9] && dv(&d[..10], 11) == d[10]
}

fn valid_luhn(s: &str) -> bool {
    let d = digits(s);
    if d.len() < 13 || d.len() > 19 {
        return false;
    }
    let mut sum = 0u32;
    let mut alt = false;
    for &x in d.iter().rev() {
        let mut v = x;
        if alt {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
        alt = !alt;
    }
    sum % 10 == 0
}

/// Palavras cuja faixa de bytes encosta em [ms, me) → seus bboxes.
fn boxes_for_range(words: &[Word], ms: usize, me: usize) -> Vec<Region> {
    words
        .iter()
        .filter(|w| w.start < me && w.end > ms)
        .map(|w| (w.fx, w.fy, w.fw, w.fh))
        .collect()
}

/// Caixa que envolve todos os boxes, com uma folga (padding) — None se vazio.
fn union(boxes: &[Region]) -> Option<Region> {
    if boxes.is_empty() {
        return None;
    }
    let x0 = boxes.iter().map(|b| b.0).fold(f32::MAX, f32::min);
    let y0 = boxes.iter().map(|b| b.1).fold(f32::MAX, f32::min);
    let x1 = boxes.iter().map(|b| b.0 + b.2).fold(f32::MIN, f32::max);
    let y1 = boxes.iter().map(|b| b.1 + b.3).fold(f32::MIN, f32::max);
    let pad = 0.012;
    let fx = (x0 - pad).clamp(0.0, 1.0);
    let fy = (y0 - pad).clamp(0.0, 1.0);
    let fw = ((x1 + pad) - fx).clamp(0.0, 1.0 - fx);
    let fh = ((y1 + pad) - fy).clamp(0.0, 1.0 - fy);
    Some((fx, fy, fw, fh))
}

/// Procura segredos no texto do OCR. Devolve os vazamentos + a REGIÃO (união dos
/// boxes de alta severidade) pra cobrir só onde está o segredo.
fn scan(text: &str, words: &[Word], watchlist: &[String]) -> (Vec<Leak>, Option<Region>) {
    let mut out: Vec<Leak> = vec![];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut hi_boxes: Vec<Region> = vec![];
    for p in patterns() {
        for m in p.re.find_iter(text) {
            let raw = m.as_str();
            if p.kind == "cpf" && !valid_cpf(raw) {
                continue;
            }
            if p.kind == "card" && !valid_luhn(raw) {
                continue;
            }
            if !seen.insert(format!("{}:{raw}", p.kind)) {
                continue;
            }
            if p.severity == "high" {
                hi_boxes.extend(boxes_for_range(words, m.start(), m.end()));
            }
            out.push(Leak {
                kind: p.kind.into(),
                label: p.label.into(),
                snippet: mask(raw),
                severity: p.severity.into(),
            });
        }
    }
    let lower = text.to_lowercase();
    for term in watchlist {
        let t = term.trim();
        if t.len() >= 3 {
            if let Some(pos) = lower.find(&t.to_lowercase()) {
                if seen.insert(format!("watch:{t}")) {
                    hi_boxes.extend(boxes_for_range(words, pos, pos + t.len()));
                    out.push(Leak {
                        kind: "watchlist".into(),
                        label: "Dado pessoal".into(),
                        snippet: mask(t),
                        severity: "high".into(),
                    });
                }
            }
        }
    }
    (out, union(&hi_boxes))
}

// ------------------------------- OCR (local) -------------------------------

/// OCR via Windows.Media.Ocr (nativo, sem binário/nuvem). Devolve o texto + as palavras
/// com bounding box em frações da tela.
#[cfg(windows)]
fn ocr_words(bytes: &[u8]) -> Option<(String, Vec<Word>)> {
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
            let w = ws.GetAt(j).ok()?;
            let text = w.Text().ok()?.to_string();
            let r = w.BoundingRect().ok()?;
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

#[cfg(not(windows))]
fn ocr_words(_bytes: &[u8]) -> Option<(String, Vec<Word>)> {
    None
}

// ------------------------------- Loop -------------------------------

/// Roda enquanto a transmissão está no ar (e o guardião está ligado).
pub async fn run_guardian(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    censor: Arc<AtomicBool>,
    censor_region: Arc<Mutex<Option<Region>>>,
) {
    log::info!("guardião: ligado");

    loop {
        for _ in 0..7 {
            if !running.load(Ordering::Relaxed) {
                log::info!("guardião: desligado");
                return;
            }
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(Duration::from_millis(200))
            })
            .await;
        }
        if !has_signal.load(Ordering::Relaxed) || censor.load(Ordering::Relaxed) {
            continue;
        }
        // Recarrega as settings a cada volta — pega mudanças (ligar "censurar", watchlist)
        // SEM precisar reiniciar a transmissão.
        let s = crate::config::load(&app).settings;
        let auto = s.guardian_action == "censor";
        let watchlist = s.guardian_watchlist;
        let jpeg = match crate::commands::grab_frame_named(&app, "guard.jpg").await {
            Ok(b) => b,
            Err(_) => continue,
        };
        let (text, words) =
            match tauri::async_runtime::spawn_blocking(move || ocr_words(&jpeg)).await {
                Ok(Some(v)) => v,
                _ => continue,
            };
        if text.trim().is_empty() {
            continue;
        }
        let (leaks, region) = scan(&text, &words, &watchlist);
        if leaks.is_empty() {
            continue;
        }
        log::warn!(
            "guardião: possível vazamento {:?} região={:?} (auto={auto})",
            leaks.iter().map(|l| l.kind.clone()).collect::<Vec<_>>(),
            region
        );
        for l in &leaks {
            let _ = app.emit("leak://alert", l.clone());
        }
        // No modo "censurar", censura QUALQUER detecção (não só severidade alta).
        if auto {
            *censor_region.lock().unwrap() = region; // região da tarja (None = tela toda)
            censor.store(true, Ordering::Relaxed);
            let _ = app.emit("leak://censor", true);
            log::warn!("guardião: CENSURA automática ativada");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pega_chave_e_email() {
        let t = "meu token sk-ABCDEFGHIJKLMNOPQRSTUVWX e email joao@teste.com";
        let (leaks, _) = scan(t, &[], &[]);
        assert!(leaks.iter().any(|l| l.kind == "apikey" && l.severity == "high"));
        assert!(leaks.iter().any(|l| l.kind == "email"));
    }

    #[test]
    fn cpf_invalido_nao_conta() {
        let (leaks, _) = scan("CPF 123.456.789-00", &[], &[]);
        assert!(leaks.iter().all(|l| l.kind != "cpf"));
    }

    #[test]
    fn watchlist_casa() {
        let (leaks, _) = scan("moro na Rua das Flores 42", &[], &["Rua das Flores".into()]);
        assert!(leaks.iter().any(|l| l.kind == "watchlist"));
    }

    #[test]
    fn regiao_uniao_com_padding() {
        let r = union(&[(0.2, 0.3, 0.1, 0.05), (0.35, 0.32, 0.1, 0.05)]).unwrap();
        assert!(r.0 < 0.2 && r.1 < 0.3); // padding empurra a borda pra fora
        assert!(r.2 > 0.25); // cobre os dois boxes
    }
}
