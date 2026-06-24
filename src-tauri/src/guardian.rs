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

/// Manda UM comando pro filtro (REQ exige send→recv). false se a conexão caiu.
async fn zmq_send(sock: &mut zeromq::ReqSocket, cmd: &str) -> bool {
    use zeromq::{SocketRecv, SocketSend};
    if sock.send(cmd.into()).await.is_err() {
        return false;
    }
    sock.recv().await.is_ok()
}

/// Arredonda as frações pra uma grade ~0.5% — ignora o jitter do OCR (evita comando à toa).
fn round_region(r: Region) -> Region {
    let q = |v: f32| (v.clamp(-1.0, 2.0) * 200.0).round() / 200.0;
    (q(r.0), q(r.1), q(r.2), q(r.3))
}

/// Mostra a tarja do zero: w, h, y, x (x por ÚLTIMO → não pisca em lugar errado). 4 comandos.
async fn show_box(sock: &mut zeromq::ReqSocket, i: usize, r: Region) -> bool {
    zmq_send(sock, &format!("drawbox@b{i} w iw*{:.4}", r.2)).await
        && zmq_send(sock, &format!("drawbox@b{i} h ih*{:.4}", r.3)).await
        && zmq_send(sock, &format!("drawbox@b{i} y ih*{:.4}", r.1)).await
        && zmq_send(sock, &format!("drawbox@b{i} x iw*{:.4}", r.0)).await
}

/// Move a tarja mandando SÓ os params que mudaram (scroll = só y → 1 comando ~30ms).
/// O filtro zmq processa ~1 comando/frame, então cada comando a menos = ~30ms a menos de atraso.
async fn move_box(sock: &mut zeromq::ReqSocket, i: usize, old: Region, new: Region) -> bool {
    let mut ok = true;
    if old.2 != new.2 {
        ok &= zmq_send(sock, &format!("drawbox@b{i} w iw*{:.4}", new.2)).await;
    }
    if ok && old.3 != new.3 {
        ok &= zmq_send(sock, &format!("drawbox@b{i} h ih*{:.4}", new.3)).await;
    }
    if ok && old.1 != new.1 {
        ok &= zmq_send(sock, &format!("drawbox@b{i} y ih*{:.4}", new.1)).await;
    }
    if ok && old.0 != new.0 {
        ok &= zmq_send(sock, &format!("drawbox@b{i} x iw*{:.4}", new.0)).await;
    }
    ok
}

/// Esconde: joga pra FORA da tela. (NÃO usar w=0 — no drawbox isso vira TELA INTEIRA!)
async fn hide_box(sock: &mut zeromq::ReqSocket, i: usize) -> bool {
    zmq_send(sock, &format!("drawbox@b{i} x -99999")).await
}

/// Detecção (OCR): o lado LENTO, isolado em background pra não travar o rastreamento.
/// Publica as regiões achadas + se está em modo "censurar".
#[derive(Default, Clone)]
struct Anchor {
    gen: u64,
    auto: bool,
    regions: Vec<Region>,
}

async fn ocr_loop(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    anchor: Arc<Mutex<Anchor>>,
    frame_path: Option<std::path::PathBuf>,
) {
    let mut tick = 0u32;
    let mut auto = false;
    let mut watchlist: Vec<String> = vec![];
    let mut had_leak = false;
    loop {
        if !running.load(Ordering::Relaxed) {
            return;
        }
        let _ = tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(30))
        })
        .await;
        if tick % 20 == 0 {
            let cfg = crate::config::load(&app).settings;
            auto = cfg.guardian_action == "censor";
            watchlist = cfg.guardian_watchlist;
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
        let (leaks, regions) = match tauri::async_runtime::spawn_blocking(move || {
            ocr_words(&jpeg).map(|(text, words)| {
                if text.trim().is_empty() {
                    (vec![], vec![])
                } else {
                    scan(&text, &words, &wl)
                }
            })
        })
        .await
        {
            Ok(Some(v)) => v,
            _ => continue,
        };
        if !leaks.is_empty() && !had_leak {
            for l in &leaks {
                let _ = app.emit("leak://alert", l.clone());
            }
        }
        had_leak = !leaks.is_empty();
        if let Ok(mut a) = anchor.lock() {
            a.gen = a.gen.wrapping_add(1);
            a.auto = auto;
            a.regions = regions.iter().map(|r| round_region(*r)).collect();
        }
    }
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

/// Guardião: DETECTA (OCR em background) + RASTREIA (movimento global, por frame) e comanda as
/// tarjas via zmq — segue o conteúdo quase em tempo real, sem reiniciar nada.
pub async fn run_guardian(app: AppHandle, running: Arc<AtomicBool>, has_signal: Arc<AtomicBool>) {
    use zeromq::Socket;
    log::info!("guardião: ligado");
    let endpoint = format!("tcp://127.0.0.1:{}", crate::engine::GUARD_ZMQ_PORT);
    let n = crate::engine::GUARD_BOXES;
    let frame_path = crate::commands::guard_frame_path(&app);

    // Detecção roda em background; o loop abaixo é o RASTREAMENTO (rápido).
    let anchor = Arc::new(Mutex::new(Anchor::default()));
    {
        let (a, r, s, an, fp) = (
            app.clone(),
            running.clone(),
            has_signal.clone(),
            anchor.clone(),
            frame_path.clone(),
        );
        tauri::async_runtime::spawn(async move { ocr_loop(a, r, s, an, fp).await });
    }

    let mut sock: Option<zeromq::ReqSocket> = None;
    let mut censoring = false;
    let mut shown: Vec<Option<Region>> = vec![None; n];
    let mut tracks: Vec<Track> = vec![];
    let mut last_gen = 0u64;
    let mut prev: Option<Proj> = None;

    loop {
        if !running.load(Ordering::Relaxed) {
            log::info!("guardião: desligado");
            return;
        }
        // ~16Hz: o rastreamento é barato, então segue o conteúdo de pertinho.
        let _ = tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(Duration::from_millis(55))
        })
        .await;

        if !has_signal.load(Ordering::Relaxed) {
            prev = None;
            continue;
        }
        if sock.is_none() {
            let mut s = zeromq::ReqSocket::new();
            match tokio::time::timeout(Duration::from_secs(3), s.connect(&endpoint)).await {
                Ok(Ok(())) => {
                    log::info!("guardião: zmq conectado no protetor");
                    sock = Some(s);
                    censoring = false;
                    shown = vec![None; n];
                    tracks.clear();
                    prev = None;
                }
                _ => continue,
            }
        }

        // Frame atual → cinza → assinatura de projeção.
        let jpeg = match frame_path.as_ref().and_then(|p| std::fs::read(p).ok()) {
            Some(b) if !b.is_empty() => b,
            _ => continue,
        };
        let cur = match decode_gray(&jpeg) {
            Some((g, w, h)) => project(&g, w, h),
            None => continue,
        };

        // RASTREIA: movimento global desde o frame anterior → empurra TODOS os tracks.
        if let Some(p) = &prev {
            let (dxf, dyf) = global_motion(p, &cur, 0.2);
            if dxf != 0.0 || dyf != 0.0 {
                for t in &mut tracks {
                    t.fx += dxf;
                    t.fy += dyf;
                }
            }
        }
        prev = Some(cur);

        // RE-ANCORA quando o OCR trouxe uma detecção nova.
        let (gen, auto, anchors) = {
            let a = anchor.lock().unwrap();
            (a.gen, a.auto, a.regions.clone())
        };
        if gen != last_gen {
            last_gen = gen;
            if auto {
                associate(&mut tracks, &anchors, n);
            } else {
                tracks.clear();
            }
        }

        // Estado desejado por box.
        let mut desired: Vec<Option<Region>> = vec![None; n];
        for t in &tracks {
            if t.box_idx < n {
                desired[t.box_idx] = Some(round_region((t.fx, t.fy, t.fw, t.fh)));
            }
        }

        // DELTA: manda só o que mudou.
        let mut dead = false;
        {
            let socket = sock.as_mut().unwrap();
            for i in 0..n {
                if dead {
                    break;
                }
                let ok = match (shown[i], desired[i]) {
                    (a, b) if a == b => true,
                    (_, None) => hide_box(socket, i).await,
                    (None, Some(r)) => show_box(socket, i, r).await,
                    (Some(o), Some(r)) => move_box(socket, i, o, r).await,
                };
                if ok {
                    shown[i] = desired[i];
                } else {
                    dead = true;
                }
            }
        }
        if dead {
            log::warn!("guardião: zmq caiu — reconectando");
            sock = None;
            continue;
        }

        let now = shown.iter().any(|s| s.is_some());
        if now != censoring {
            censoring = now;
            let _ = app.emit("leak://censor", now);
            if now {
                log::warn!("guardião: CENSURA (tarja) — {} região(ões)", tracks.len());
            } else {
                log::info!("guardião: censura liberada (segredo saiu)");
            }
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
