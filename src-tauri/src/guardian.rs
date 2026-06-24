//! Guardião anti-vazamento: amostra os frames de saída, faz OCR local (com bounding
//! boxes), procura segredo na tela e avisa/censura — cobrindo SÓ a região do segredo
//! (tarja) ou a tela toda. Ver docs/FEATURE-ANTI-VAZAMENTO.md.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
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
    let pad = 0.02; // folga generosa pra cobrir o segredo todo
    let fx = (x0 - pad).clamp(0.0, 1.0);
    let fy = (y0 - pad).clamp(0.0, 1.0);
    let fw = ((x1 + pad) - fx).clamp(0.0, 1.0 - fx);
    let fh = ((y1 + pad) - fy).clamp(0.0, 1.0 - fy);
    Some((fx, fy, fw, fh))
}

/// Procura segredos no texto do OCR. Devolve os vazamentos + UMA REGIÃO por segredo
/// (pra cobrir cada um com a sua tarja, lidando com várias aparições).
fn scan(text: &str, words: &[Word], watchlist: &[String]) -> (Vec<Leak>, Vec<Region>) {
    let mut out: Vec<Leak> = vec![];
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut regions: Vec<Region> = vec![];
    for p in patterns() {
        for m in p.re.find_iter(text) {
            let raw = m.as_str();
            if p.kind == "cpf" && !valid_cpf(raw) {
                continue;
            }
            if p.kind == "card" && !valid_luhn(raw) {
                continue;
            }
            // Uma região por OCORRÊNCIA (cobre cada aparição, mesmo o valor repetido — ex.: 2x o e-mail).
            if let Some(r) = union(&boxes_for_range(words, m.start(), m.end())) {
                regions.push(r);
            }
            // O alerta (toast) dedupa por valor pra não spammar.
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
    for term in watchlist {
        let t = term.trim();
        if t.len() < 3 {
            continue;
        }
        // Casa no texto ORIGINAL (offsets batem com as palavras) e pega TODAS as ocorrências.
        if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(t))) {
            let mut found = false;
            for m in re.find_iter(text) {
                if let Some(r) = union(&boxes_for_range(words, m.start(), m.end())) {
                    regions.push(r);
                }
                found = true;
            }
            if found && seen.insert(format!("watch:{t}")) {
                out.push(Leak {
                    kind: "watchlist".into(),
                    label: "Dado pessoal".into(),
                    snippet: mask(t),
                    severity: "high".into(),
                });
            }
        }
    }
    (out, regions)
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

// --------------------- Rastreamento de movimento global ---------------------
// "Detectar + rastrear": o OCR (lento) só ACHA os segredos; entre os OCRs, este
// rastreador segue o conteúdo a cada frame por "integral projection" — barato e
// preciso pra translação (scroll de página/tela), que é o caso comum.

/// Decodifica o JPEG do extrator em escala de cinza. Retorna (pixels, largura, altura).
fn decode_gray(jpeg: &[u8]) -> Option<(Vec<u8>, usize, usize)> {
    let img = image::load_from_memory_with_format(jpeg, image::ImageFormat::Jpeg).ok()?;
    let g = img.to_luma8();
    let (w, h) = (g.width() as usize, g.height() as usize);
    Some((g.into_raw(), w, h))
}

/// Projeções integrais (soma por linha e por coluna) — assinatura 1D do frame.
struct Proj {
    w: usize,
    h: usize,
    rows: Vec<u32>,
    cols: Vec<u32>,
}

fn project(gray: &[u8], w: usize, h: usize) -> Proj {
    let mut rows = vec![0u32; h];
    let mut cols = vec![0u32; w];
    for y in 0..h {
        let base = y * w;
        let mut rs = 0u32;
        for x in 0..w {
            let v = gray[base + x] as u32;
            rs += v;
            cols[x] += v;
        }
        rows[y] = rs;
    }
    Proj { w, h, rows, cols }
}

/// Deslocamento d tal que `cur[i+d] ≈ prev[i]` (SAD normalizada numa janela ±maxd).
/// d=0 é a linha de base; só devolve d≠0 se for CLARAMENTE melhor (gate de confiança) —
/// senão devolve 0 (não inventa movimento em corte de cena / eixo sem deslocamento).
fn best_shift(prev: &[u32], cur: &[u32], maxd: i32) -> i32 {
    let n = prev.len() as i32;
    if n == 0 {
        return 0;
    }
    let sad = |d: i32| -> Option<f64> {
        let lo = 0.max(-d);
        let hi = n.min(n - d);
        if hi - lo < n / 2 {
            return None; // sobreposição insuficiente
        }
        let mut sum = 0f64;
        let mut i = lo;
        while i < hi {
            sum += (prev[i as usize] as f64 - cur[(i + d) as usize] as f64).abs();
            i += 1;
        }
        Some(sum / (hi - lo) as f64)
    };
    let base = sad(0).unwrap_or(f64::MAX); // "não mexer"
    let mut best = base;
    let mut best_d = 0i32;
    for d in -maxd..=maxd {
        if d == 0 {
            continue;
        }
        if let Some(s) = sad(d) {
            if s < best {
                best = s;
                best_d = d;
            }
        }
    }
    // Confiança: o melhor deslocamento precisa ser ≥15% melhor que não mexer.
    if best_d != 0 && best > base * 0.85 {
        return 0;
    }
    best_d
}

/// Movimento global do conteúdo entre dois frames, em FRAÇÕES (dxf, dyf).
/// dyf>0 = conteúdo desceu → as tarjas descem junto. `max_frac` = alcance da busca.
fn global_motion(prev: &Proj, cur: &Proj, max_frac: f32) -> (f32, f32) {
    if prev.w != cur.w || prev.h != cur.h || cur.w == 0 || cur.h == 0 {
        return (0.0, 0.0);
    }
    let maxdy = (((cur.h as f32) * max_frac) as i32).max(1);
    let maxdx = (((cur.w as f32) * max_frac) as i32).max(1);
    let dy = best_shift(&prev.rows, &cur.rows, maxdy);
    let dx = best_shift(&prev.cols, &cur.cols, maxdx);
    (dx as f32 / cur.w as f32, dy as f32 / cur.h as f32)
}

// ------------------------------- Loop -------------------------------

/// Arredonda as frações pra uma grade ~0.5% — ignora o jitter do OCR.
pub(crate) fn round_region(r: Region) -> Region {
    let q = |v: f32| (v.clamp(-1.0, 2.0) * 200.0).round() / 200.0;
    (q(r.0), q(r.1), q(r.2), q(r.3))
}

/// Âncora: detecções do OCR (regiões + modo censurar + geração). Compartilhada OCR→rastreador.
#[derive(Default, Clone)]
pub(crate) struct Anchor {
    pub(crate) gen: u64,
    pub(crate) auto: bool,
    pub(crate) regions: Vec<Region>,
}

/// OCR + regras num frame JPEG (modo "avisar" — lê o frame do extrator).
pub(crate) fn ocr_scan(jpeg: &[u8], watchlist: &[String]) -> (Vec<Leak>, Vec<Region>) {
    match ocr_words(jpeg) {
        Some((text, words)) if !text.trim().is_empty() => scan(&text, &words, watchlist),
        _ => (vec![], vec![]),
    }
}

/// OCR + regras num frame CINZA cru (encoda JPEG e reusa o OCR). Pra o compositor detectar.
pub(crate) fn ocr_scan_gray(
    gray: &[u8],
    w: usize,
    h: usize,
    watchlist: &[String],
) -> (Vec<Leak>, Vec<Region>) {
    let Some(img) = image::GrayImage::from_raw(w as u32, h as u32, gray.to_vec()) else {
        return (vec![], vec![]);
    };
    let mut jpeg = Vec::new();
    if img
        .write_to(&mut std::io::Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
        .is_err()
    {
        return (vec![], vec![]);
    }
    ocr_scan(&jpeg, watchlist)
}

/// Uma região rastreada (frações) ligada a um box do protetor.
struct Track {
    fx: f32,
    fy: f32,
    fw: f32,
    fh: f32,
    box_idx: usize,
    miss: u32,
}

/// Casa as regiões do OCR com os tracks por PROXIMIDADE: os que continuam mantêm a posição
/// RASTREADA (sem pulo, só atualiza o tamanho); os novos viram track; os sumidos saem após carência.
fn associate(tracks: &mut Vec<Track>, anchors: &[Region], n: usize) {
    let mut t_matched = vec![false; tracks.len()];
    let mut a_used = vec![false; anchors.len()];
    for (ai, a) in anchors.iter().enumerate() {
        let (acx, acy) = (a.0 + a.2 / 2.0, a.1 + a.3 / 2.0);
        let mut best = usize::MAX;
        let mut bestd = 0.12f32; // limiar: 12% de distância entre centros
        for (ti, t) in tracks.iter().enumerate() {
            if t_matched[ti] {
                continue;
            }
            let (tcx, tcy) = (t.fx + t.fw / 2.0, t.fy + t.fh / 2.0);
            let d = ((acx - tcx).powi(2) + (acy - tcy).powi(2)).sqrt();
            if d < bestd {
                bestd = d;
                best = ti;
            }
        }
        if best != usize::MAX {
            tracks[best].fw = a.2; // mantém posição, atualiza tamanho
            tracks[best].fh = a.3;
            tracks[best].miss = 0;
            t_matched[best] = true;
            a_used[ai] = true;
        }
    }
    for (ti, t) in tracks.iter_mut().enumerate() {
        if !t_matched[ti] {
            t.miss += 1;
        }
    }
    tracks.retain(|t| t.miss < 2);
    let used: std::collections::HashSet<usize> = tracks.iter().map(|t| t.box_idx).collect();
    let mut free: Vec<usize> = (0..n).filter(|i| !used.contains(i)).collect();
    for (ai, a) in anchors.iter().enumerate() {
        if a_used[ai] {
            continue;
        }
        if let Some(bi) = free.pop() {
            tracks.push(Track { fx: a.0, fy: a.1, fw: a.2, fh: a.3, box_idx: bi, miss: 0 });
        }
    }
}

/// Rastreador: mantém os tracks entre frames (movimento global + re-âncora do OCR). O compositor
/// chama `update` POR FRAME (no plano Y cru do próprio vídeo) → regiões EXATAS pra aquele frame,
/// sem lag de timeline (era a causa da tarja atrasada/torta).
pub(crate) struct Tracker {
    tracks: Vec<Track>,
    prev: Option<Proj>,
    last_gen: u64,
    n: usize,
}

impl Tracker {
    pub(crate) fn new() -> Self {
        Self {
            tracks: vec![],
            prev: None,
            last_gen: 0,
            n: crate::engine::GUARD_BOXES,
        }
    }

    pub(crate) fn reset(&mut self) {
        self.tracks.clear();
        self.prev = None;
    }

    /// Atualiza com o frame CINZA atual + a última âncora do OCR. Devolve as regiões PRA ESTE frame.
    pub(crate) fn update(&mut self, gray: &[u8], w: usize, h: usize, anchor: &Anchor) -> Vec<Region> {
        let cur = project(gray, w, h);
        if let Some(p) = &self.prev {
            let (dx, dy) = global_motion(p, &cur, 0.2);
            if dx != 0.0 || dy != 0.0 {
                for t in &mut self.tracks {
                    t.fx += dx;
                    t.fy += dy;
                }
            }
        }
        self.prev = Some(cur);
        if anchor.gen != self.last_gen {
            self.last_gen = anchor.gen;
            if anchor.auto {
                associate(&mut self.tracks, &anchor.regions, self.n);
            } else {
                self.tracks.clear();
            }
        }
        self.tracks
            .iter()
            .map(|t| round_region((t.fx, t.fy, t.fw, t.fh)))
            .collect()
    }
}

/// Guardião em modo "AVISAR": OCR no frame do extrator + toast no vazamento novo. (No modo
/// "censurar" quem detecta+rastreia+desenha é o COMPOSITOR, nos próprios frames crus.)
pub async fn run_guardian(app: AppHandle, running: Arc<AtomicBool>, has_signal: Arc<AtomicBool>) {
    log::info!("guardião: ligado (avisar)");
    let frame_path = crate::commands::guard_frame_path(&app);
    let mut tick = 0u32;
    let mut watchlist: Vec<String> = vec![];
    let mut had_leak = false;
    loop {
        if !running.load(Ordering::Relaxed) {
            log::info!("guardião: desligado");
            return;
        }
        let _ = tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(200))
        })
        .await;
        if tick % 5 == 0 {
            watchlist = crate::config::load(&app).settings.guardian_watchlist;
        }
        tick = tick.wrapping_add(1);
        if !has_signal.load(Ordering::Relaxed) {
            continue;
        }
        let jpeg = match frame_path.as_ref().and_then(|p| std::fs::read(p).ok()) {
            Some(b) if !b.is_empty() => b,
            _ => continue,
        };
        let wl = watchlist.clone();
        let (leaks, _) =
            match tauri::async_runtime::spawn_blocking(move || ocr_scan(&jpeg, &wl)).await {
                Ok(v) => v,
                _ => continue,
            };
        if !leaks.is_empty() && !had_leak {
            for l in &leaks {
                let _ = app.emit("leak://alert", l.clone());
            }
        }
        had_leak = !leaks.is_empty();
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
    fn rastreia_scroll_vertical() {
        let (w, h) = (64usize, 64usize);
        let mut a = vec![0u8; w * h];
        for y in 0..h {
            for x in 0..w {
                a[y * w + x] = ((y * 7 + x * 3) % 256) as u8;
            }
        }
        // b = a deslocado pra BAIXO por 5 linhas (toroidal → colunas preservadas).
        let dy_true = 5usize;
        let mut b = vec![0u8; w * h];
        for y in 0..h {
            for x in 0..w {
                let sy = (y + h - dy_true) % h;
                b[y * w + x] = a[sy * w + x];
            }
        }
        let (pa, pb) = (project(&a, w, h), project(&b, w, h));
        let (dxf, dyf) = global_motion(&pa, &pb, 0.5);
        assert_eq!((dyf * h as f32).round() as i32, dy_true as i32);
        assert!(dxf.abs() < 0.05, "dx deveria ser ~0, foi {dxf}");
    }

    #[test]
    fn rastreia_em_jpeg_real() {
        // Caminho completo: textura → JPEG → decode_gray → movimento (como o extrator real).
        let (w, h) = (160usize, 120usize);
        let tex = |y: usize, x: usize| (((y * 13) ^ (x * 7)).wrapping_add(x * x) % 256) as u8;
        let dy_true = 8usize;
        let mut a = image::GrayImage::new(w as u32, h as u32);
        let mut b = image::GrayImage::new(w as u32, h as u32);
        for y in 0..h {
            for x in 0..w {
                a.put_pixel(x as u32, y as u32, image::Luma([tex(y, x)]));
                let sy = (y + h - dy_true) % h; // toroidal → colunas preservadas
                b.put_pixel(x as u32, y as u32, image::Luma([tex(sy, x)]));
            }
        }
        let enc = |img: &image::GrayImage| {
            let mut buf = Vec::new();
            img.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg)
                .unwrap();
            buf
        };
        let (ga, wa, ha) = decode_gray(&enc(&a)).expect("decode a");
        let (gb, _, _) = decode_gray(&enc(&b)).expect("decode b");
        let (_dxf, dyf) = global_motion(&project(&ga, wa, ha), &project(&gb, wa, ha), 0.3);
        let dy = (dyf * ha as f32).round() as i32;
        // JPEG é lossy → tolera ±1 px.
        assert!((dy - dy_true as i32).abs() <= 1, "dy recuperado={dy}, esperado≈{dy_true}");
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
