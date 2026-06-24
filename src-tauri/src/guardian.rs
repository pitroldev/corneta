//! Guardião anti-vazamento: amostra os frames de saída, faz OCR local e procura
//! segredo na tela (email, chave de API, CPF, cartão, JWT, watchlist). Avisa e,
//! se configurado, aciona a censura. Ver docs/FEATURE-ANTI-VAZAMENTO.md.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Leak {
    pub kind: String,
    pub label: String,
    pub snippet: String,
    pub severity: String, // "high" (pode censurar) | "med" (só avisa)
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

/// Procura segredos no texto (do OCR). Dedup por padrão+valor.
pub fn scan_text(text: &str, watchlist: &[String]) -> Vec<Leak> {
    let mut out: Vec<Leak> = vec![];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for p in patterns() {
        for m in p.re.find_iter(text) {
            let raw = m.as_str();
            if p.kind == "cpf" && !valid_cpf(raw) {
                continue;
            }
            if p.kind == "card" && !valid_luhn(raw) {
                continue;
            }
            if seen.insert(format!("{}:{raw}", p.kind)) {
                out.push(Leak {
                    kind: p.kind.into(),
                    label: p.label.into(),
                    snippet: mask(raw),
                    severity: p.severity.into(),
                });
            }
        }
    }
    let lower = text.to_lowercase();
    for term in watchlist {
        let t = term.trim();
        if t.len() >= 3 && lower.contains(&t.to_lowercase()) && seen.insert(format!("watch:{t}")) {
            out.push(Leak {
                kind: "watchlist".into(),
                label: "Dado pessoal".into(),
                snippet: mask(t),
                severity: "high".into(),
            });
        }
    }
    out
}

// ------------------------------- OCR (local) -------------------------------

/// OCR via Windows.Media.Ocr (nativo do Windows — sem binário extra, sem nuvem).
#[cfg(windows)]
fn ocr_jpeg(bytes: &[u8]) -> Option<String> {
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

#[cfg(not(windows))]
fn ocr_jpeg(_bytes: &[u8]) -> Option<String> {
    None
}

// ------------------------------- Loop -------------------------------

/// Roda enquanto a transmissão está no ar (e o guardião está ligado).
pub async fn run_guardian(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    censor: Arc<AtomicBool>,
) {
    let s = crate::config::load(&app).settings;
    let watchlist = s.guardian_watchlist.clone();
    let auto = s.guardian_action == "censor";
    log::info!("guardião: ligado (ação={})", s.guardian_action);

    loop {
        // Intervalo ~1.5s (7×200ms), abortando cedo se a transmissão parar.
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
        // Sem sinal, ou já censurado → não analisa.
        if !has_signal.load(Ordering::Relaxed) || censor.load(Ordering::Relaxed) {
            continue;
        }
        let jpeg = match crate::commands::grab_frame_named(&app, "guard.jpg").await {
            Ok(b) => b,
            Err(_) => continue,
        };
        let text = match tauri::async_runtime::spawn_blocking(move || ocr_jpeg(&jpeg)).await {
            Ok(Some(t)) => t,
            _ => continue,
        };
        if text.trim().is_empty() {
            continue;
        }
        let leaks = scan_text(&text, &watchlist);
        if leaks.is_empty() {
            continue;
        }
        let high = leaks.iter().any(|l| l.severity == "high");
        log::warn!(
            "guardião: possível vazamento {:?}",
            leaks.iter().map(|l| l.kind.clone()).collect::<Vec<_>>()
        );
        for l in &leaks {
            let _ = app.emit("leak://alert", l.clone());
        }
        if auto && high {
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
        let leaks = scan_text(t, &[]);
        assert!(leaks.iter().any(|l| l.kind == "apikey" && l.severity == "high"));
        assert!(leaks.iter().any(|l| l.kind == "email"));
    }

    #[test]
    fn cpf_invalido_nao_conta() {
        // sequência com formato de CPF mas dígito verificador errado
        assert!(scan_text("CPF 123.456.789-00", &[]).iter().all(|l| l.kind != "cpf"));
    }

    #[test]
    fn watchlist_casa() {
        let leaks = scan_text("moro na Rua das Flores 42", &["Rua das Flores".into()]);
        assert!(leaks.iter().any(|l| l.kind == "watchlist"));
    }
}
