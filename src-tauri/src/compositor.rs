//! Compositor do **feed de programa** — a peça que torna o "JÁ VOLTO" sem quedas.
//!
//! O vídeo do OBS passa CRU (yuv420p) por uma bomba no nosso processo, e a saída — um único
//! encoder FFmpeg publicando `_program` no MediaMTX — **nunca para**. Os destinos leem o
//! `_program`, então a conexão com as plataformas fica de pé o tempo todo:
//!
//! ```text
//!   OBS → MediaMTX(live) → decoder V ┐
//!                          decoder A ┤→ bomba (Rust) → encoder → MediaMTX(_program) → destinos
//!   sinal caiu?  slate "JÁ VOLTO" ───┘   (auto-cadenciada:      (nunca morre)
//!   (imagem estática OU vídeo em loop)    1 quadro + N bytes de áudio por tick)
//! ```
//!
//! - **Queda do OBS**: os decoders morrem (EOF); a bomba segue emitindo — congela o último
//!   quadro por ~0,5 s (ponte pra micro-engasgos) e depois injeta o slate + silêncio (ou o
//!   áudio do slate-vídeo). Timestamps contínuos → a plataforma nem percebe.
//! - **Sinal voltou**: os decoders respawnam e os quadros reais voltam a fluir. Invisível.
//! - **Guardião**: mesmo pipeline com `delay_frames > 0` (máquina do tempo) + OCR/censura.
//!   Na queda, o buffer de 12 s ainda vai ao ar (é conteúdo real) antes do slate.
//!
//! A/V sync por construção: cada tick emite 1 quadro + `audio_bytes_per_frame` de PCM; os
//! dois backlogs crescem e drenam JUNTOS (áudio só é consumido ao emitir quadro REAL), então
//! não há `adelay` nem deriva acumulada.
//!
//! Usa `std::process` (não o tauri shell) porque o fluxo é BINÁRIO — o shell quebraria em
//! linhas. O áudio entra no encoder por TCP loopback (a bomba é o servidor); o connect do
//! FFmpeg entra na backlog do listener, então não há deadlock com o `accept`.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::engine::{self, ProgramSpec};
use crate::guardian;

/// Quanto tempo congelar o último quadro antes de cortar pro slate (ponte pra engasgos).
const HOLD_MS: u64 = 500;
/// Sem quadro novo há tanto → drena o buffer (máquina do tempo vai ao ar até esvaziar).
const DRAIN_MS: u64 = 250;
/// Intervalo mínimo entre tentativas de respawn dos decoders.
const RESPAWN_MS: u64 = 1500;

/// A tela do "JÁ VOLTO" que a bomba injeta quando o sinal cai (e na censura do guardião).
pub enum Slate {
    /// Um quadro yuv420p pronto (imagem do usuário ou a tela gerada, rasterizada 1x).
    Still(Vec<u8>),
    /// Vídeo do usuário em loop (decoder FFmpeg dedicado, com o áudio do próprio vídeo).
    Video { path: String, has_audio: bool },
}

pub struct CompositorOpts {
    pub spec: ProgramSpec,
    /// Delay da máquina do tempo (0 = JÁ VOLTO puro; GUARD_DELAY_SEC com o guardião).
    pub delay_sec: u32,
    pub hw_codec: Option<String>,
    /// Termos do guardião (vazia = sem OCR/censura).
    pub watchlist: Vec<String>,
    pub slate: Slate,
    /// "JÁ VOLTO agora": o streamer força o slate no ar (pausa manual — banheiro/água),
    /// com o áudio do programa MUDO (o mic dele não vaza). Ligada/desligada por comando.
    pub force_slate: Arc<AtomicBool>,
}

enum GenExit {
    Stop,
    EncoderDied,
    SetupFailed,
}

// ------------------------------ helpers de processo ------------------------------

/// Caminho do sidecar ffmpeg. O Tauri copia o externalBin pro lado do exe SEM o sufixo do
/// triple (vira `ffmpeg.exe`), tanto em dev (target/debug) quanto no bundle de produção.
fn ffmpeg_path() -> Option<std::path::PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let p = dir.join(name);
    p.exists().then_some(p)
}

/// `tag`: com Some, o stderr do FFmpeg vai pro log com esse prefixo — é o ÚNICO jeito de
/// diagnosticar um processo do pipeline que não sobe (deixar mudo já nos custou caro).
fn spawn_ff(
    ffmpeg: &std::path::Path,
    args: &[String],
    pipe_out: bool,
    tag: Option<&'static str>,
) -> std::io::Result<Child> {
    let mut cmd = Command::new(ffmpeg);
    cmd.args(args);
    if pipe_out {
        cmd.stdout(Stdio::piped()).stdin(Stdio::null());
    } else {
        cmd.stdin(Stdio::piped()).stdout(Stdio::null());
    }
    if tag.is_some() {
        cmd.stderr(Stdio::piped());
    } else {
        cmd.stderr(Stdio::null());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()?;
    if let (Some(tag), Some(err)) = (tag, child.stderr.take()) {
        std::thread::spawn(move || {
            use std::io::BufRead;
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                let t = line.trim();
                if !t.is_empty() {
                    log::warn!("compositor/{tag}: {t}");
                }
            }
        });
    }
    Ok(child)
}

fn kill(child: &mut Child) {
    let pid = child.id();
    let _ = child.kill();
    let _ = child.wait();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

// ------------------------------ fontes (decoders) ------------------------------

/// Decoder + thread leitora despejando no canal. `rx` desconectado = processo morreu (EOF).
struct FrameSource {
    rx: Receiver<Vec<u8>>,
    child: Child,
}

struct ByteSource {
    rx: Receiver<Vec<u8>>,
    child: Child,
}

fn spawn_frame_source(
    ffmpeg: &std::path::Path,
    args: &[String],
    fsize: usize,
    tag: Option<&'static str>,
) -> std::io::Result<FrameSource> {
    let mut child = spawn_ff(ffmpeg, args, true, tag)?;
    let mut out = std::io::BufReader::with_capacity(fsize * 2, child.stdout.take().unwrap());
    let (tx, rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) = std::sync::mpsc::sync_channel(4);
    std::thread::spawn(move || loop {
        let mut frame = vec![0u8; fsize];
        if out.read_exact(&mut frame).is_err() {
            return; // EOF/erro → dropa o tx → rx desconecta
        }
        if tx.send(frame).is_err() {
            return; // bomba foi embora
        }
    });
    Ok(FrameSource { rx, child })
}

fn spawn_byte_source(ffmpeg: &std::path::Path, args: &[String]) -> std::io::Result<ByteSource> {
    let mut child = spawn_ff(ffmpeg, args, true, None)?;
    let mut out = child.stdout.take().unwrap();
    let (tx, rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) = std::sync::mpsc::sync_channel(64);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match out.read(&mut buf) {
                Ok(0) | Err(_) => return,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        return;
                    }
                }
            }
        }
    });
    Ok(ByteSource { rx, child })
}

/// Drena o canal de quadros: devolve quantos chegaram e se a fonte morreu (desconectou).
fn drain_frames(src: &mut Option<FrameSource>, mut on_frame: impl FnMut(Vec<u8>)) -> (usize, bool) {
    let Some(s) = src.as_mut() else {
        return (0, false);
    };
    let mut got = 0usize;
    let mut dead = false;
    loop {
        match s.rx.try_recv() {
            Ok(f) => {
                got += 1;
                on_frame(f);
            }
            Err(TryRecvError::Empty) => break,
            Err(TryRecvError::Disconnected) => {
                dead = true;
                break;
            }
        }
    }
    if dead {
        if let Some(mut s) = src.take() {
            kill(&mut s.child);
        }
    }
    (got, dead)
}

/// Drena o canal de áudio pro FIFO (com teto — derruba o mais ANTIGO no estouro).
fn drain_audio(src: &mut Option<ByteSource>, fifo: &mut VecDeque<u8>, cap: usize) -> bool {
    let Some(s) = src.as_mut() else {
        return false;
    };
    let mut dead = false;
    loop {
        match s.rx.try_recv() {
            Ok(chunk) => fifo.extend(chunk),
            Err(TryRecvError::Empty) => break,
            Err(TryRecvError::Disconnected) => {
                dead = true;
                break;
            }
        }
    }
    while fifo.len() > cap {
        fifo.pop_front();
    }
    if dead {
        if let Some(mut s) = src.take() {
            kill(&mut s.child);
        }
    }
    dead
}

/// Tira exatamente `n` bytes do FIFO (completa com silêncio se faltar).
fn take_audio(fifo: &mut VecDeque<u8>, n: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(n);
    let avail = fifo.len().min(n);
    for _ in 0..avail {
        out.push(fifo.pop_front().unwrap_or(0));
    }
    out.resize(n, 0);
    out
}

/// Re-pareia o FIFO de áudio com o buffer de quadros (invariante: bytes == quadros × abpf).
/// Chamado a cada respawn de decoder — corta excesso (áudio de quadros que não existem) ou
/// completa com silêncio (quadros cujo áudio se perdeu).
fn repair_pairing(afifo: &mut VecDeque<u8>, want: usize) {
    if afifo.len() > want {
        afifo.truncate(want);
    } else {
        afifo.resize(want, 0);
    }
}

// ------------------------------ slate ------------------------------

/// Quadro preto (Y=16, U=V=128).
fn black_frame(spec: &ProgramSpec) -> Vec<u8> {
    let ysize = (spec.w as usize) * (spec.h as usize);
    let mut f = vec![128u8; spec.frame_size()];
    for p in f.iter_mut().take(ysize) {
        *p = 16;
    }
    f
}

/// Converte uma RGB → yuv420p (BT.601 limited). Usado UMA vez pra rasterizar o slate.
fn rgb_to_yuv420(rgb: &image::RgbImage) -> Vec<u8> {
    let (w, h) = (rgb.width() as usize, rgb.height() as usize);
    let mut out = vec![0u8; w * h * 3 / 2];
    let (cw, ch) = (w / 2, h / 2);
    let y_size = w * h;
    let c_size = cw * ch;
    for y in 0..h {
        for x in 0..w {
            let p = rgb.get_pixel(x as u32, y as u32);
            let (r, g, b) = (p[0] as f32, p[1] as f32, p[2] as f32);
            out[y * w + x] = (0.257 * r + 0.504 * g + 0.098 * b + 16.0).clamp(16.0, 235.0) as u8;
        }
    }
    for cy in 0..ch {
        for cx in 0..cw {
            let (mut rs, mut gs, mut bs) = (0f32, 0f32, 0f32);
            for dy in 0..2 {
                for dx in 0..2 {
                    let p = rgb.get_pixel((cx * 2 + dx) as u32, (cy * 2 + dy) as u32);
                    rs += p[0] as f32;
                    gs += p[1] as f32;
                    bs += p[2] as f32;
                }
            }
            let (r, g, b) = (rs / 4.0, gs / 4.0, bs / 4.0);
            let u = (-0.148 * r - 0.291 * g + 0.439 * b + 128.0).clamp(16.0, 240.0) as u8;
            let v = (0.439 * r - 0.368 * g - 0.071 * b + 128.0).clamp(16.0, 240.0) as u8;
            out[y_size + cy * cw + cx] = u;
            out[y_size + c_size + cy * cw + cx] = v;
        }
    }
    out
}

/// Rasteriza a IMAGEM do slate (arquivo do usuário ou o brb-slate.png gerado) num quadro
/// yuv420p do tamanho do programa. Sem arquivo/inválido → cor sólida da marca.
pub fn load_slate_still(
    app: &AppHandle,
    spec: &ProgramSpec,
    path: Option<&std::path::Path>,
) -> Vec<u8> {
    let candidate = path.map(|p| p.to_path_buf()).or_else(|| {
        app.path()
            .app_config_dir()
            .ok()
            .map(|d| d.join("brb-slate.png"))
    });
    if let Some(p) = candidate {
        if let Ok(img) = image::open(&p) {
            let rgb = img
                .resize_to_fill(spec.w, spec.h, image::imageops::FilterType::Triangle)
                .to_rgb8();
            return rgb_to_yuv420(&rgb);
        }
    }
    log::warn!("compositor: slate ausente/inválido — usando cor sólida");
    let solid = image::RgbImage::from_pixel(spec.w, spec.h, image::Rgb([20, 16, 10]));
    rgb_to_yuv420(&solid)
}

// ------------------------------ compositor ------------------------------

/// Roda o compositor enquanto a transmissão estiver no ar. Só começa a publicar depois do
/// PRIMEIRO sinal do OBS (a live não nasce mostrando "JÁ VOLTO"); dali em diante a saída é
/// contínua até o stop. `slate_on` reflete "JÁ VOLTO no ar" pra UI (estado dos destinos).
pub async fn run(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    slate_on: Arc<AtomicBool>,
    opts: CompositorOpts,
) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        let Some(ffmpeg) = ffmpeg_path() else {
            log::error!("compositor: sidecar ffmpeg não encontrado");
            return;
        };
        let cfg = crate::config::load(&app);
        let spec = opts.spec;
        let delay_frames = (opts.delay_sec as usize) * (spec.fps as usize);
        // O slate "segura" uma detecção por quase o buffer todo — ver guardian/pipeline.rs.
        let max_gap = (delay_frames as u64).saturating_sub(spec.fps as u64);
        log::info!(
            "compositor: {}x{}@{} {}kbps delay={}s hw={:?} termos={} slate={}",
            spec.w,
            spec.h,
            spec.fps,
            spec.video_kbps,
            opts.delay_sec,
            opts.hw_codec,
            opts.watchlist.len(),
            match &opts.slate {
                Slate::Still(_) => "imagem",
                Slate::Video { .. } => "vídeo",
            },
        );

        // OCR do guardião (só com watchlist).
        let shared = if opts.watchlist.is_empty() {
            None
        } else {
            let sh = Arc::new(guardian::Shared::new());
            guardian::spawn_ocr(
                app.clone(),
                running.clone(),
                sh.clone(),
                opts.watchlist.clone(),
                spec.w as usize,
                spec.h as usize,
            );
            Some(sh)
        };

        let still = match &opts.slate {
            Slate::Still(f) => f.clone(),
            // Slate-vídeo: até o decoder do loop cuspir o 1º quadro, cor sólida da marca.
            Slate::Video { .. } => {
                let solid = image::RgbImage::from_pixel(spec.w, spec.h, image::Rgb([20, 16, 10]));
                rgb_to_yuv420(&solid)
            }
        };

        let mut head: u64 = 0; // índice monotônico — NÃO zera nos respawns (Timeline coerente)
        let mut censoring = false;
        while running.load(Ordering::Relaxed) {
            let exit = generation(
                &app,
                &ffmpeg,
                &cfg,
                &spec,
                delay_frames,
                max_gap,
                &opts,
                &still,
                shared.as_deref(),
                &running,
                &has_signal,
                &slate_on,
                &mut head,
                &mut censoring,
            );
            match exit {
                GenExit::Stop => break,
                GenExit::EncoderDied => {
                    log::warn!("compositor: encoder do programa caiu — resubindo");
                    std::thread::sleep(Duration::from_millis(500));
                }
                GenExit::SetupFailed => std::thread::sleep(Duration::from_secs(2)),
            }
        }
        if censoring {
            let _ = app.emit("leak://censor", false);
        }
        slate_on.store(false, Ordering::Relaxed);
        log::info!("compositor: encerrado");
    })
    .await;
}

/// Uma "geração" do pipeline: espera sinal → decoders → encoder → bomba até o encoder morrer
/// ou o stop. Os DECODERS morrem e renascem livremente aqui dentro; o encoder, não.
#[allow(clippy::too_many_arguments)]
fn generation(
    app: &AppHandle,
    ffmpeg: &std::path::Path,
    cfg: &crate::config::AppConfig,
    spec: &ProgramSpec,
    delay_frames: usize,
    max_gap: u64,
    opts: &CompositorOpts,
    still: &[u8],
    shared: Option<&guardian::Shared>,
    running: &Arc<AtomicBool>,
    has_signal: &AtomicBool,
    slate_on: &AtomicBool,
    head: &mut u64,
    censoring: &mut bool,
) -> GenExit {
    let fsize = spec.frame_size();
    let abpf = spec.audio_bytes_per_frame();
    let ysize = (spec.w as usize) * (spec.h as usize);
    // Teto do FIFO de áudio: o backlog do delay do guardião + folga de 3 s.
    let audio_cap = (opts.delay_sec as usize + 3) * (abpf * spec.fps as usize);

    // 1) Espera o OBS publicar (na 1ª geração; nas seguintes o sinal em geral já existe).
    while !has_signal.load(Ordering::Relaxed) {
        if !running.load(Ordering::Relaxed) {
            return GenExit::Stop;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    // 2) Decoders + primeiro quadro (não publica antes de ter conteúdo real).
    let mut vsrc = match spawn_frame_source(
        ffmpeg,
        &engine::ffmpeg_args_for_decoder(cfg, spec),
        fsize,
        Some("decoder"),
    ) {
        Ok(s) => Some(s),
        Err(e) => {
            log::warn!("compositor: decoder de vídeo não subiu: {e}");
            return GenExit::SetupFailed;
        }
    };
    let mut asrc = spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_audio_decoder(cfg)).ok();
    let mut a_spawned_at = Instant::now();
    let mut a_fast_deaths = 0u32;

    let first = {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if !running.load(Ordering::Relaxed) {
                if let Some(mut s) = vsrc.take() {
                    kill(&mut s.child);
                }
                if let Some(mut s) = asrc.take() {
                    kill(&mut s.child);
                }
                return GenExit::Stop;
            }
            match vsrc
                .as_ref()
                .map(|s| s.rx.recv_timeout(Duration::from_millis(150)))
            {
                Some(Ok(f)) => break f,
                Some(Err(std::sync::mpsc::RecvTimeoutError::Timeout)) => {
                    if Instant::now() > deadline {
                        log::warn!("compositor: decoder não entregou o 1º quadro em 10s — tentando de novo");
                        if let Some(mut s) = vsrc.take() {
                            kill(&mut s.child);
                        }
                        if let Some(mut s) = asrc.take() {
                            kill(&mut s.child);
                        }
                        return GenExit::SetupFailed;
                    }
                }
                _ => {
                    log::warn!("compositor: decoder morreu antes do 1º quadro (sinal instável?) — tentando de novo");
                    if let Some(mut s) = vsrc.take() {
                        kill(&mut s.child);
                    }
                    if let Some(mut s) = asrc.take() {
                        kill(&mut s.child);
                    }
                    return GenExit::SetupFailed;
                }
            }
        }
    };
    log::info!("compositor: 1º quadro do OBS recebido — subindo o encoder do programa");

    // 3) Encoder (stdin = vídeo; TCP loopback = áudio).
    let listener = match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            log::error!("compositor: listener de áudio: {e}");
            if let Some(mut s) = vsrc.take() {
                kill(&mut s.child);
            }
            if let Some(mut s) = asrc.take() {
                kill(&mut s.child);
            }
            return GenExit::SetupFailed;
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let enc_args = engine::ffmpeg_args_for_encoder(cfg, spec, opts.hw_codec.as_deref(), port);
    let mut enc = match spawn_ff(ffmpeg, &enc_args, false, Some("encoder")) {
        Ok(c) => c,
        Err(e) => {
            log::error!("compositor: encoder não subiu: {e}");
            if let Some(mut s) = vsrc.take() {
                kill(&mut s.child);
            }
            if let Some(mut s) = asrc.take() {
                kill(&mut s.child);
            }
            return GenExit::SetupFailed;
        }
    };
    // A bomba NUNCA escreve I/O diretamente: vídeo e áudio ganham THREADS escritoras com
    // fila. Motivo (aprendido na dor): o find_stream_info do FFmpeg abre as entradas em
    // sequência e exige uma RAJADA de áudio antes de ler mais vídeo — uma bomba de thread
    // única parava no write do quadro e estrangulava o áudio: deadlock circular, mudo.
    // Com filas, o áudio continua fluindo em tempo real enquanto o vídeo espera a vez.
    let mut ein = enc.stdin.take().unwrap();
    let (vtx, vrx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) = std::sync::mpsc::sync_channel(8);
    std::thread::spawn(move || {
        for f in vrx {
            if ein.write_all(&f).is_err() {
                return;
            }
        }
    });
    // Vigia do stop: um write bloqueado no stdin não vê o `running` — se o encoder travar
    // ANTES de publicar, nem a morte do MediaMTX o derruba, e esta thread ficaria presa pra
    // sempre. Quando o running cai, o vigia mata o encoder → o pipe quebra → a bomba sai.
    // `gen_done` evita matar um PID reciclado depois que a geração já se encerrou sozinha.
    let gen_done = Arc::new(AtomicBool::new(false));
    {
        let (run_w, done_w, enc_pid) = (running.clone(), gen_done.clone(), enc.id());
        std::thread::spawn(move || {
            while run_w.load(Ordering::Relaxed) && !done_w.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(200));
            }
            std::thread::sleep(Duration::from_millis(1200)); // chance do teardown normal
            if !done_w.load(Ordering::Relaxed) {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill")
                        .args(["/PID", &enc_pid.to_string(), "/T", "/F"])
                        .creation_flags(0x0800_0000)
                        .output();
                }
                #[cfg(not(windows))]
                {
                    let _ = enc_pid;
                }
            }
        });
    }
    // ATENÇÃO à ordem de abertura: o FFmpeg abre as entradas EM SEQUÊNCIA — ele só conecta
    // no TCP do áudio (entrada 1) DEPOIS de abrir o vídeo no stdin (entrada 0). O accept não
    // pode bloquear antes de escrevermos vídeo; e o áudio ganha uma THREAD própria, pra um
    // write de vídeo bloqueado nunca estrangular o áudio (era o deadlock circular do
    // find_stream_info). O catch-up de silêncio pareia o pts 0 do áudio com o do vídeo.
    let _ = listener.set_nonblocking(true);
    let mut audio_tx: Option<SyncSender<Vec<u8>>> = None;
    let mut audio_backlog_frames: u64 = 0; // quadros emitidos antes do áudio conectar
    let accept_deadline = Instant::now() + Duration::from_secs(15);

    // 4) Estado da bomba.
    let tick_ns: u64 = 1_000_000_000 / (spec.fps as u64);
    let mut delay_buf: VecDeque<(u64, Vec<u8>)> = VecDeque::with_capacity(delay_frames + 8);
    let mut afifo: VecDeque<u8> = VecDeque::new();
    let mut slate_afifo: VecDeque<u8> = VecDeque::new();
    let mut slate_vsrc: Option<FrameSource> = None;
    let mut slate_asrc: Option<ByteSource> = None;
    let mut slate_frame: Vec<u8> = still.to_vec();
    let mut last_out: Vec<u8> = black_frame(spec);
    let mut last_arrival = Instant::now();
    let mut last_respawn = Instant::now();
    let mut last_slate_spawn: Option<Instant> = None;
    let mut brb_active = false;
    let mut drift_logged = false;

    // O 1º quadro entra antes do relógio partir.
    *head += 1;
    offer_scan(shared, *head, &first, ysize);
    delay_buf.push_back((*head, first));
    afifo.resize(delay_buf.len() * abpf, 0); // pareia A/V do zero

    let clock = Instant::now();
    let mut emitted: u64 = 0;

    // 5) Bomba.
    let exit = loop {
        if !running.load(Ordering::Relaxed) {
            break GenExit::Stop;
        }

        // Áudio do encoder ainda não conectou: tenta aceitar (sem bloquear). Ao conectar,
        // sobe a thread escritora e manda o silêncio de catch-up dos quadros já emitidos.
        if audio_tx.is_none() {
            match listener.accept() {
                Ok((s, _)) => {
                    // No Windows o socket aceito HERDA o non-blocking do listener — sem
                    // reverter, o write_all do áudio falharia com WouldBlock sob carga.
                    let _ = s.set_nonblocking(false);
                    let _ = s.set_nodelay(true);
                    let mut sock = s;
                    // Fila de ~10 s: absorve qualquer engasgo do encoder; se ENCHER, o
                    // encoder está morto de verdade (try_send falha → geração reinicia).
                    let (tx, rx): (SyncSender<Vec<u8>>, Receiver<Vec<u8>>) =
                        std::sync::mpsc::sync_channel(10 * spec.fps as usize);
                    std::thread::spawn(move || {
                        for chunk in rx {
                            if sock.write_all(&chunk).is_err() {
                                return;
                            }
                        }
                    });
                    let silence = vec![0u8; (audio_backlog_frames as usize) * abpf];
                    if !silence.is_empty() {
                        let _ = tx.send(silence);
                    }
                    audio_tx = Some(tx);
                    log::info!("compositor: encoder conectado — programa no ar");
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() > accept_deadline {
                        log::error!("compositor: encoder não conectou no áudio (15s)");
                        break GenExit::EncoderDied;
                    }
                }
                Err(e) => {
                    log::error!("compositor: accept do áudio falhou: {e}");
                    break GenExit::EncoderDied;
                }
            }
        }

        // Entradas: drena vídeo/áudio dos decoders (sem bloquear).
        let (got, v_dead) = drain_frames(&mut vsrc, |f| {
            *head += 1;
            offer_scan(shared, *head, &f, ysize);
            delay_buf.push_back((*head, f));
        });
        if got > 0 {
            last_arrival = Instant::now();
        }
        let a_dead = drain_audio(&mut asrc, &mut afifo, audio_cap);
        // Deriva OBS×relógio: buffer estourou a folga → derruba o mais antigo (e o áudio par).
        while delay_buf.len() > delay_frames + spec.fps as usize {
            delay_buf.pop_front();
            for _ in 0..abpf {
                afifo.pop_front();
            }
            if !drift_logged {
                drift_logged = true;
                log::info!("compositor: aparando deriva do relógio (inofensivo)");
            }
        }

        // Decoders: respawn INDEPENDENTE quando morrem com sinal presente. O re-pareamento
        // do FIFO (invariante bytes == quadros × abpf) vale nos dois casos. O áudio ganha
        // backoff nas mortes instantâneas — uma fonte SEM trilha de áudio derruba o decoder
        // de áudio na hora, e sem o backoff ele viraria um respawn a cada 1,5 s pra sempre.
        if a_dead {
            if a_spawned_at.elapsed() < Duration::from_secs(2) {
                a_fast_deaths = a_fast_deaths.saturating_add(1);
            } else {
                a_fast_deaths = 0;
            }
        }
        let sig_now = has_signal.load(Ordering::Relaxed);
        if vsrc.is_none() && sig_now && last_respawn.elapsed() >= Duration::from_millis(RESPAWN_MS)
        {
            last_respawn = Instant::now();
            vsrc = spawn_frame_source(
                ffmpeg,
                &engine::ffmpeg_args_for_decoder(cfg, spec),
                fsize,
                Some("decoder"),
            )
            .ok();
            repair_pairing(&mut afifo, delay_buf.len() * abpf);
        }
        let a_wait = if a_fast_deaths >= 2 {
            Duration::from_secs(30) // fonte provavelmente sem áudio — não fica martelando
        } else {
            Duration::from_millis(RESPAWN_MS)
        };
        if asrc.is_none() && sig_now && a_spawned_at.elapsed() >= a_wait {
            a_spawned_at = Instant::now();
            asrc = spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_audio_decoder(cfg)).ok();
            repair_pairing(&mut afifo, delay_buf.len() * abpf);
        }
        let _ = v_dead;

        // Slate-vídeo: decoder em loop só enquanto o slate está no ar.
        let forced = opts.force_slate.load(Ordering::Relaxed);
        let want_slate_media = brb_active || *censoring || forced;
        if let Slate::Video { path, has_audio } = &opts.slate {
            if want_slate_media
                && slate_vsrc.is_none()
                && !last_slate_spawn.is_some_and(|t| t.elapsed() < Duration::from_secs(2))
            {
                last_slate_spawn = Some(Instant::now());
                slate_vsrc = spawn_frame_source(
                    ffmpeg,
                    &engine::ffmpeg_args_for_slate_video(path, spec),
                    fsize,
                    Some("slate"),
                )
                .ok();
                if *has_audio {
                    slate_asrc =
                        spawn_byte_source(ffmpeg, &engine::ffmpeg_args_for_slate_audio(path)).ok();
                }
                slate_afifo.clear();
            }
            if !want_slate_media && slate_vsrc.is_some() {
                if let Some(mut s) = slate_vsrc.take() {
                    kill(&mut s.child);
                }
                if let Some(mut s) = slate_asrc.take() {
                    kill(&mut s.child);
                }
                slate_afifo.clear();
            }
            let _ = drain_frames(&mut slate_vsrc, |f| slate_frame = f);
            let _ = drain_audio(&mut slate_asrc, &mut slate_afifo, abpf * spec.fps as usize);
        }

        // Emissão: quantos quadros o relógio deve ao encoder?
        let due = (clock.elapsed().as_nanos() as u64) / tick_ns;
        if due.saturating_sub(emitted) > spec.fps as u64 {
            // Ficou >1 s pra trás (suspend? travada geral) — pula em vez de rajada gigante.
            log::warn!("compositor: atraso de emissão — pulando pra frente");
            emitted = due;
        }
        let mut io_err = false;
        while emitted < due {
            emitted += 1;
            let gap = last_arrival.elapsed();
            // Máquina do tempo: com atraso cheio, sai 1 por tick; sem quadros novos há
            // DRAIN_MS, drena o buffer (o conteúdo real bufferizado ainda vai ao ar).
            let popped = if !delay_buf.is_empty()
                && (delay_buf.len() > delay_frames || gap.as_millis() as u64 > DRAIN_MS)
            {
                delay_buf.pop_front()
            } else {
                None
            };

            let (frame_out, audio_out, brb_now): (Vec<u8>, Vec<u8>, bool) = match &popped {
                Some((idx, f)) => {
                    // Censura do guardião (só com watchlist): troca o QUADRO, áudio segue.
                    let censor_now = shared
                        .map(|sh| {
                            let mut tl = sh.timeline.lock().unwrap();
                            let s = tl.should_censor(*idx, max_gap);
                            tl.prune(idx.saturating_sub(max_gap + 2));
                            s
                        })
                        .unwrap_or(false);
                    if censor_now != *censoring {
                        *censoring = censor_now;
                        let _ = app.emit("leak://censor", censor_now);
                    }
                    let audio = take_audio(&mut afifo, abpf);
                    if censor_now {
                        (slate_frame.clone(), audio, false)
                    } else if forced {
                        // "JÁ VOLTO agora" manual: slate no ar, áudio real DESCARTADO (consumido
                        // acima pra manter o pareamento) e trocado pelo do slate/silêncio — o mic
                        // do streamer não vaza na pausa. Os pops continuam: ao voltar, o conteúdo
                        // é o ATUAL, não um replay da pausa.
                        let slate_audio = if matches!(
                            &opts.slate,
                            Slate::Video {
                                has_audio: true,
                                ..
                            }
                        ) {
                            take_audio(&mut slate_afifo, abpf)
                        } else {
                            vec![0u8; abpf]
                        };
                        (slate_frame.clone(), slate_audio, true)
                    } else {
                        (f.clone(), audio, false)
                    }
                }
                // JÁ VOLTO — GRUDENTO: uma vez no slate, fica nele até conteúdo REAL voltar a
                // sair (pop). Sem isso, no guardião o re-encher do buffer (12 s) cairia no ramo
                // de congelamento e mostraria o último quadro de ANTES da queda, parado.
                None if forced
                    || brb_active
                    || (delay_buf.is_empty() && gap.as_millis() as u64 >= HOLD_MS) =>
                {
                    // Slate + áudio do slate-vídeo (ou silêncio).
                    let audio = if matches!(
                        &opts.slate,
                        Slate::Video {
                            has_audio: true,
                            ..
                        }
                    ) {
                        take_audio(&mut slate_afifo, abpf)
                    } else {
                        vec![0u8; abpf]
                    };
                    (slate_frame.clone(), audio, true)
                }
                None => {
                    // Ponte curta (buffer enchendo / micro-engasgo): congela o último quadro.
                    (last_out.clone(), vec![0u8; abpf], false)
                }
            };

            if brb_now != brb_active {
                brb_active = brb_now;
                slate_on.store(brb_active || *censoring, Ordering::Relaxed);
                let _ = app.emit("brb://active", brb_active);
                log::info!(
                    "compositor: JÁ VOLTO {}",
                    if brb_active {
                        "NO AR (sem derrubar as plataformas)"
                    } else {
                        "saiu — sinal de volta"
                    }
                );
            } else {
                slate_on.store(brb_active || *censoring, Ordering::Relaxed);
            }

            // Envio PAREADO via filas, sem nunca bloquear a bomba. Fila de vídeo cheia é
            // NORMAL durante as sondagens do encoder → pula o PAR inteiro (vídeo E áudio,
            // preservando o pareamento). Fila de áudio cheia (10 s!) = encoder morto de
            // verdade → reinicia a geração.
            match vtx.try_send(frame_out) {
                Ok(()) => {
                    let aud_ok = match audio_tx.as_ref() {
                        Some(tx) => tx.try_send(audio_out).is_ok(),
                        // Áudio ainda conectando: conta pro catch-up de silêncio.
                        None => {
                            audio_backlog_frames += 1;
                            true
                        }
                    };
                    if !aud_ok {
                        log::error!("compositor: fila de áudio estourou (encoder travado)");
                        io_err = true;
                        break;
                    }
                }
                Err(TrySendError::Full(_)) => { /* encoder digerindo — pula o par, sem drama */ }
                Err(TrySendError::Disconnected(_)) => {
                    io_err = true;
                    break;
                }
            }
            // Guarda o quadro emitido pra ponte de congelamento (sem clone: move do pop).
            if let Some((_, f)) = popped {
                last_out = f;
            }
        }
        if io_err {
            break GenExit::EncoderDied;
        }

        std::thread::sleep(Duration::from_millis(3));
    };

    // Teardown da geração.
    gen_done.store(true, Ordering::Relaxed); // desarma o vigia (não matar PID reciclado)
    kill(&mut enc);
    if let Some(mut s) = vsrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = asrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = slate_vsrc.take() {
        kill(&mut s.child);
    }
    if let Some(mut s) = slate_asrc.take() {
        kill(&mut s.child);
    }
    slate_on.store(false, Ordering::Relaxed);
    exit
}

/// Oferece o plano Y do quadro pro OCR do guardião (se ligado e o slot estiver livre).
fn offer_scan(shared: Option<&guardian::Shared>, idx: u64, frame: &[u8], ysize: usize) {
    if let Some(sh) = shared {
        if let Ok(mut slot) = sh.scan_slot.lock() {
            if slot.is_none() {
                *slot = Some((idx, frame[..ysize].to_vec()));
            }
        }
    }
}
