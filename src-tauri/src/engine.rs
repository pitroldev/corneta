//! Motor de relay: monta o comando FFmpeg a partir da config (decode-once → encode-N),
//! supervisiona o sidecar e emite status para a UI. Ver PLANEJAMENTO.md §8 e §14.2/§14.3.
use crate::config::{AppConfig, Reframe, Target, VideoPreset};
use serde::Serialize;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Presets de referência (espelham src/lib/platforms.ts)
// ---------------------------------------------------------------------------
pub fn recommended_preset(platform_id: &str) -> VideoPreset {
    let v = |width, height, fps, vb, ab| VideoPreset {
        width,
        height,
        fps,
        video_bitrate_kbps: vb,
        audio_bitrate_kbps: ab,
        keyframe_sec: 2,
    };
    match platform_id {
        "twitch" => v(1920, 1080, 60, 6000, 160),
        "youtube" => v(1920, 1080, 60, 9000, 192),
        "facebook" => v(1280, 720, 30, 4000, 128),
        "kick" => v(1920, 1080, 60, 6000, 160),
        "tiktok" => v(720, 1280, 30, 3000, 128),
        "x" => v(1280, 720, 30, 3000, 128),
        "instagram" => v(720, 1280, 30, 2500, 128),
        _ => v(1920, 1080, 30, 4500, 160),
    }
}

/// Sanitiza um preset vindo da config: import_config aceita qualquer JSON, então os campos
/// não são confiáveis — clampa cada um numa faixa sã pra evitar overflow nos cálculos
/// derivados (`vbr * 2`, `fps * keyframe_sec`) e args absurdos no FFmpeg.
fn sanitize_preset(mut p: VideoPreset) -> VideoPreset {
    p.width = p.width.clamp(16, 7680);
    p.height = p.height.clamp(16, 7680);
    p.fps = p.fps.clamp(1, 240);
    p.video_bitrate_kbps = p.video_bitrate_kbps.clamp(100, 100_000);
    p.audio_bitrate_kbps = p.audio_bitrate_kbps.clamp(32, 512);
    p.keyframe_sec = p.keyframe_sec.clamp(1, 10);
    p
}

/// Preset EFETIVO de um destino: o do usuário (sanitizado) ou o recomendado da plataforma
/// (também sanitizado). Fonte ÚNICA — o encode real e o spec/relatório não podem divergir por
/// derivarem o preset de jeitos diferentes em lugares diferentes.
pub(crate) fn effective_preset(t: &Target) -> VideoPreset {
    sanitize_preset(
        t.encoding
            .preset
            .clone()
            .unwrap_or_else(|| recommended_preset(&t.platform_id)),
    )
}

/// No híbrido sem override: copia plataformas landscape, recodifica as verticais
/// (ex.: TikTok/Instagram), que precisam de formato diferente do stream do OBS.
fn smart_hybrid_action(platform_id: &str) -> &'static str {
    let r = recommended_preset(platform_id);
    if r.height > r.width {
        "transcode"
    } else {
        "copy"
    }
}

/// Ação efetiva considerando o modo global.
pub fn effective_action<'a>(mode: &str, t: &'a Target) -> &'a str {
    match mode {
        "passthrough" => "copy",
        "per-platform" => "transcode",
        // híbrido: override manual, senão decide sozinho.
        _ => match t.encoding.hybrid_override.as_deref() {
            Some(o) if !o.is_empty() => o,
            _ => smart_hybrid_action(&t.platform_id),
        },
    }
}

/// Codec de vídeo do FFmpeg pra escolha do usuário. `auto_codec` = o melhor encoder de
/// HARDWARE que realmente funciona nesta máquina (sondado com um encode de verdade em
/// `detect_hw_encoder` — a listagem `-encoders` mente), na prioridade NVENC > QSV > AMF >
/// VideoToolbox. "Automático" usa ele; sem hardware, x264.
fn ffmpeg_video_codec<'a>(encoder: &str, auto_codec: Option<&'a str>) -> &'a str {
    match encoder {
        "nvenc" => "h264_nvenc",
        "qsv" => "h264_qsv",
        "amf" => "h264_amf",
        "videotoolbox" => "h264_videotoolbox",
        "software" => "libx264",
        _ => auto_codec.unwrap_or("libx264"), // "auto": melhor hardware REAL, senão x264
    }
}

/// URL completa de saída (destino + chave).
///
/// Destinos conhecidos entregam uma base simples (`.../app`), mas servidores RTMP
/// personalizados também aparecem com query string, com a chave já no último segmento ou
/// com um placeholder. Concatenar `/{key}` no fim da string produzia, por exemplo,
/// `.../app?token=x/chave`: o OBS estava na Corneta, mas o FFmpeg nunca conseguia abrir o
/// destino e a tela ficava presa no estado inicial.
fn output_url(t: &Target, key: &str) -> String {
    compose_output_url(&t.ingest_url, key)
}

fn compose_output_url(ingest_url: &str, key: &str) -> String {
    let base = ingest_url.trim();
    let key = key.trim().trim_start_matches('/');

    if key.is_empty() {
        return base.trim_end_matches('/').to_string();
    }

    // Alguns painéis fornecem uma URL-modelo em vez de separar visualmente servidor/chave.
    for placeholder in ["{stream_key}", "{streamKey}", "{key}"] {
        if base.contains(placeholder) {
            return base.replacen(placeholder, key, 1);
        }
    }

    // A query pertence à URL inteira e precisa continuar DEPOIS do caminho/chave.
    let (base_path, base_query) = base.split_once('?').unwrap_or((base, ""));
    let (key_path, key_query) = key.split_once('?').unwrap_or((key, ""));
    let base_path = base_path.trim_end_matches('/');

    // Tolera a URL completa no campo de servidor sem duplicar a chave. A fronteira `/`
    // impede confundir `abc` com o sufixo de `conta-abc`; `ends_with` também cobre chaves
    // hierárquicas (`conta/canal`) usadas por alguns servidores personalizados.
    let key_in_path = base_path
        .strip_suffix(key_path)
        .is_some_and(|prefix| prefix.ends_with('/'));
    let key_in_query = base_query.split('&').any(|part| {
        let value = part.split_once('=').map_or(part, |(_, value)| value);
        value == key_path
    });
    let already_has_key = key_in_path || key_in_query;
    let path = if already_has_key || key_path.is_empty() {
        base_path.to_string()
    } else {
        format!("{base_path}/{key_path}")
    };

    let query = match (base_query.is_empty(), key_query.is_empty()) {
        (true, true) => String::new(),
        (false, true) => format!("?{base_query}"),
        (true, false) => format!("?{key_query}"),
        (false, false) => format!("?{base_query}&{key_query}"),
    };
    format!("{path}{query}")
}

/// Filtro de vídeo pra saída vertical: recorta um 9:16 (posição/zoom do enquadramento)
/// do sinal landscape e escala pra resolução final — sem distorcer. A panorâmica usa o
/// espaço disponível `(iw - crop)`, então o recorte nunca sai da fonte (qualquer aspecto).
fn reframe_filter(reframe: Option<&Reframe>, out_w: u32, out_h: u32) -> String {
    let ar = out_w as f64 / out_h as f64;
    let (x, y, z) = match reframe {
        Some(r) => (
            r.x.clamp(0.0, 1.0),
            r.y.clamp(0.0, 1.0),
            r.zoom.clamp(0.25, 1.0),
        ),
        None => (0.5, 0.5, 1.0), // centralizado, altura cheia
    };
    let cw = format!("min(iw\\,ih*{z:.4}*{ar:.4})");
    let ch = format!("ih*{z:.4}");
    format!("crop={cw}:{ch}:(iw-{cw})*{x:.4}:(ih-{ch})*{y:.4},scale={out_w}:{out_h}")
}

/// Monta os argumentos de UM FFmpeg para UM destino (lê do MediaMTX → 1 saída).
/// Um processo por plataforma → métricas REAIS por destino e reconexão independente.
/// URL de leitura ao vivo (ingestão do OBS).
pub fn ingest_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}",
        config.ingest.protocol,
        config.ingest.host,
        config.ingest.port,
        config.ingest.app,
        config.ingest.key
    )
}
/// URL do **feed de programa** — o sinal contínuo republicado pelo compositor (com ou sem
/// delay do guardião). Os destinos leem DAQUI quando o compositor está ativo: como o encoder
/// do programa nunca para de publicar, a conexão com as plataformas nunca cai.
pub fn program_url(config: &AppConfig) -> String {
    format!(
        "{}://{}:{}/{}/{}_program",
        config.ingest.protocol,
        config.ingest.host,
        config.ingest.port,
        config.ingest.app,
        config.ingest.key
    )
}

/// Nome do path do programa na API do MediaMTX (`<app>/<key>_program`).
pub fn program_path_name(config: &AppConfig) -> String {
    format!("{}/{}_program", config.ingest.app, config.ingest.key)
}

/// Nome do path de ingestão na API do MediaMTX (`<app>/<key>`). Usado pra checar o sinal do
/// OBS SEM confundir com o publisher do próprio compositor (que fica em `_program`).
pub fn ingest_path_name(config: &AppConfig) -> String {
    format!("{}/{}", config.ingest.app, config.ingest.key)
}

pub fn ffmpeg_args_for_target(
    config: &AppConfig,
    t: &Target,
    key: &str,
    br_override: Option<u32>,
    source_url: &str,
    auto_codec: Option<&str>,
) -> Vec<String> {
    let ingest = source_url.to_string();
    let url = output_url(t, key);
    let action = effective_action(&config.mode, t);

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-stats".into(),
        "-i".into(),
        ingest,
    ];

    if action == "copy" {
        // Vídeo sem reencode (lossless).
        args.extend(["-map", "0:v", "-c:v", "copy"].map(String::from));
    } else {
        let p = effective_preset(t);
        let codec = ffmpeg_video_codec(&t.encoding.encoder, auto_codec);
        let fps = p.fps.max(1);
        let gop = (fps * p.keyframe_sec.max(1)).to_string();
        // Saída vertical → recorta/enquadra 9:16; saída landscape → só escala.
        let vf = if p.height > p.width {
            reframe_filter(t.encoding.reframe.as_ref(), p.width.max(2), p.height.max(2))
        } else {
            format!("scale={}:{}", p.width.max(2), p.height.max(2))
        };
        // Bitrate efetivo: o auto-bitrate pode estar empurrando um valor menor. O clamp
        // protege o `vbr * 2` do bufsize (o override parte do preset cru da config).
        let vbr = br_override
            .unwrap_or(p.video_bitrate_kbps)
            .clamp(100, 100_000);

        args.extend(
            [
                "-map",
                "0:v",
                "-vf",
                &vf,
                "-r",
                &fps.to_string(),
                "-c:v",
                codec,
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
            ]
            .map(String::from),
        );
    }

    // Áudio: sempre AAC 48 kHz estéreo (todas as plataformas exigem AAC).
    // `0:a?` torna o mapeamento opcional, para não falhar se a fonte não tiver áudio.
    let audio_kbps = effective_preset(t).audio_bitrate_kbps;
    args.extend(["-map", "0:a?"].map(String::from));
    // Normalization is real processing. Shared renditions apply it once; their
    // egresses use the already-normalized AAC without repeating the filter.
    if config.settings.loudness_normalize {
        args.push("-af".into());
        args.push(format!(
            "loudnorm=I={:.1}:TP=-1.5:LRA=11",
            config.settings.loudness_target_lufs
        ));
    }

    if t.platform_id == "custom" {
        // O OBS usa librtmp e envia a chave separadamente como `playpath`. Alguns ingests
        // privados validam esse handshake e recusam o padrão de publisher do libavformat,
        // embora aceitem exatamente a mesma URL/chave direto no OBS. Restrito ao destino
        // Personalizado para não mudar o contrato já estável dos presets conhecidos.
        args.extend(
            [
                "-rtmp_flashver",
                "WIN 10,0,32,18",
                "-rtmp_playpath",
                key.trim().trim_start_matches('/'),
                "-tcp_nodelay",
                "1",
            ]
            .map(String::from),
        );
    }
    args.extend(
        [
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-b:a",
            &format!("{}k", audio_kbps),
            "-f",
            "flv",
            &url,
        ]
        .map(String::from),
    );

    // Only the raw Guardian program has a proven AAC-LC/48k/stereo/160k
    // contract. Never assume arbitrary OBS or splicer input is compatible.
    let known_audio = config.settings.guardian_enabled
        && config
            .settings
            .guardian_watchlist
            .iter()
            .any(|term| !term.trim().is_empty())
        && source_url == program_url(config)
        && audio_kbps == 160
        && !config.settings.loudness_normalize;
    if known_audio {
        copy_encoded_audio(&mut args);
    }
    args
}

fn copy_encoded_audio(args: &mut Vec<String>) {
    let mut index = 0;
    while index + 1 < args.len() {
        match args[index].as_str() {
            "-ar" | "-ac" | "-b:a" | "-af" => {
                args.drain(index..index + 2);
            }
            "-c:a" => {
                args[index + 1] = "copy".into();
                index += 2;
            }
            _ => index += 1,
        }
    }
}

/// Local rendition output is already encoded with the exact target contract.
/// Retain destination-specific RTMP handshake/reconnect handling at the edge.
pub(crate) fn ffmpeg_args_for_rendition_egress(
    config: &AppConfig,
    target: &Target,
    key: &str,
    source: &str,
) -> Vec<String> {
    let mut config = config.clone();
    config.mode = "passthrough".into();
    config.settings.loudness_normalize = false;
    let mut args = ffmpeg_args_for_target(&config, target, key, None, source, None);
    copy_encoded_audio(&mut args);
    args
}

/// Delay FIXO (s) do guardião de privacidade — não-configurável. É o mínimo que viabiliza a
/// proteção de forma PREVENTIVA mesmo numa tela SATURADA de texto (ex.: Google Search), onde o
/// OCR sobe pra ~6s (medido). A máquina do tempo só funciona se OCR < delay → 12s dá folga pro
/// OCR de tela cheia + pra re-confirmar um termo PARADO (cadência de OCR forçado + scan). A
/// transmissão inteira (e o chat) fica esse tanto atrás do tempo real — o preço da cobertura.
pub const GUARD_DELAY_SEC: u32 = 12;

// --- Compositor (feed de programa): vídeo CRU pelo nosso processo, saída CONTÍNUA ---
// O vídeo passa CRU por uma bomba no nosso processo e a saída (encoder → `_program`) nunca
// para: sinal caiu → a bomba injeta o slate "JÁ VOLTO" + silêncio NO MESMO fluxo, sem trocar
// processo — a conexão com as plataformas não cai. O guardião roda em cima disto (delay+OCR).
// Ver docs/FEATURE-PROTETOR-BUFFER.md.

/// Áudio do programa: sempre s16le 48 kHz estéreo (a bomba alinha vídeo e áudio por tick).
pub const PROG_AUDIO_HZ: u32 = 48_000;
pub const PROG_AUDIO_CH: u32 = 2;

/// Dimensões/taxa/bitrate do feed de programa.
#[derive(Clone, Copy, Debug)]
pub struct ProgramSpec {
    pub w: u32,
    pub h: u32,
    pub fps: u32,
    pub video_kbps: u32,
}

impl ProgramSpec {
    /// Bytes de um quadro yuv420p.
    pub fn frame_size(&self) -> usize {
        (self.w as usize) * (self.h as usize) * 3 / 2
    }
    /// Bytes de áudio (s16le estéreo 48 kHz) por quadro de vídeo — mantém A/V casados por tick.
    pub fn audio_bytes_per_frame(&self) -> usize {
        ((PROG_AUDIO_HZ * PROG_AUDIO_CH * 2) / self.fps.max(1)) as usize
    }
}

/// Resolução do feed de programa. Base **720p**; sobe pra 1080p só quando ALGUM destino
/// ativo precisa — saída vertical (recorta 9:16 da fonte cheia) ou saída acima de 720p.
/// Rodar 1080p com todo mundo em 720p é encode em DOBRO à toa: o compositor reencoda a live
/// inteira e a 1080p isso custa ~2x um 720p, sem ganho nenhum pras plataformas. O guardião
/// fica SEMPRE em 1080p (`guard`): o OCR é calibrado pra 1920 de largura (ver guardian/ocr.rs)
/// e é recurso de segurança — não dá pra degradar a leitura pra poupar CPU. Espelhado em
/// src/components/ObsQualityGuide.tsx (`needsFullHd`) pra o guia mandar o OBS enviar o MESMO.
fn program_resolution(config: &AppConfig, guard: bool) -> (u32, u32) {
    let enabled: Vec<&Target> = config.targets.iter().filter(|t| t.enabled).collect();
    let needs_full_hd = guard
        || enabled.is_empty()
        || enabled.iter().any(|t| {
            let p = effective_preset(t);
            p.height > p.width || p.width.min(p.height) > 720
        });
    if needs_full_hd {
        (1920, 1080)
    } else {
        (1280, 720)
    }
}

/// Deriva o spec do programa dos destinos ativos: fps acompanha o maior preset (cap 60;
/// TRAVADO em 30 com o guardião — o buffer de 12s a 60fps dobraria pra ~2 GB de RAM), o
/// bitrate acompanha o maior destino (os "copy" empurram o encode do programa como está) e
/// a resolução é adaptativa (ver `program_resolution`) — 720p quando dá, poupando o encode.
pub fn program_spec(config: &AppConfig, guard: bool) -> ProgramSpec {
    let mut max_fps = 30u32;
    let mut max_kbps = 4500u32;
    for t in config.targets.iter().filter(|t| t.enabled) {
        let p = effective_preset(t);
        max_fps = max_fps.max(p.fps);
        max_kbps = max_kbps.max(p.video_bitrate_kbps);
    }
    let (w, h) = program_resolution(config, guard);
    ProgramSpec {
        w,
        h,
        fps: if guard { 30 } else { max_fps.clamp(30, 60) },
        video_kbps: max_kbps.clamp(2500, 12_000),
    }
}

/// **Decoder de vídeo**: lê o `live` e cospe vídeo CRU (yuv420p, tamanho/fps do spec) no
/// stdout, que a bomba lê. Sem áudio aqui (o áudio tem decoder próprio).
pub fn ffmpeg_args_for_decoder(config: &AppConfig, spec: &ProgramSpec) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // Decodifica no HARDWARE (NVDEC na NVIDIA) — tira o custo da CPU. `auto` cai pra software
        // se não houver GPU, sem quebrar. O scale/fps seguem na CPU (leve).
        "-hwaccel".into(),
        "auto".into(),
        "-i".into(),
        ingest_url(config),
        "-map".into(),
        "0:v".into(),
        "-vf".into(),
        format!("scale={}:{},fps={}", spec.w, spec.h, spec.fps),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-".into(),
    ]
}

/// **Decoder de áudio**: lê o `live` e cospe PCM cru (s16le 48 kHz estéreo) no stdout.
/// Se a fonte não tiver áudio, o FFmpeg sai na hora (sem stream de saída) e a bomba
/// preenche com silêncio — mesma resiliência da queda de sinal.
pub fn ffmpeg_args_for_audio_decoder(config: &AppConfig) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        ingest_url(config),
        "-vn".into(),
        "-map".into(),
        "0:a".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-".into(),
    ]
}

/// **Decoder do slate-vídeo**: loop INFINITO do arquivo escolhido pelo usuário → vídeo CRU
/// no ritmo real (`-re`), pro slate animado entrar no MESMO fluxo do programa.
pub fn ffmpeg_args_for_slate_video(path: &str, spec: &ProgramSpec) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-stream_loop".into(),
        "-1".into(),
        "-re".into(),
        "-i".into(),
        path.into(),
        "-map".into(),
        "0:v".into(),
        "-vf".into(),
        format!("scale={}:{},fps={}", spec.w, spec.h, spec.fps),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-".into(),
    ]
}

/// **Decoder do áudio do slate-vídeo**: loop infinito da trilha do arquivo → PCM cru.
pub fn ffmpeg_args_for_slate_audio(path: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-stream_loop".into(),
        "-1".into(),
        "-re".into(),
        "-i".into(),
        path.into(),
        "-vn".into(),
        "-map".into(),
        "0:a".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-".into(),
    ]
}

/// **Encoder do programa**: lê o vídeo CRU da bomba (stdin) + o áudio CRU da bomba (TCP
/// loopback — a bomba é o servidor) e publica CONTINUAMENTE em `_program`. Como as duas
/// entradas vêm da bomba (que nunca para), este processo sobrevive à queda do OBS — e é
/// isso que mantém a conexão das plataformas de pé. A/V já chegam alinhados (a bomba emite
/// 1 quadro + N bytes de áudio por tick), então não há `adelay`.
pub fn ffmpeg_args_for_encoder(
    config: &AppConfig,
    spec: &ProgramSpec,
    hw_codec: Option<&str>,
    audio_port: u16,
) -> Vec<String> {
    let gop = (spec.fps * 2).to_string(); // keyframe 2s
    let vbr = spec.video_kbps;
    // CRÍTICO: `-analyzeduration 0 -probesize 32` nas DUAS entradas cruas. Os formatos são
    // 100% forçados por flag (rawvideo/s16le + tamanho/taxa), então a sondagem do
    // find_stream_info é inútil — e o padrão dela (~5 s de dados!) criava um deadlock:
    // o FFmpeg segurava o stdin do vídeo enquanto esperava áudio suficiente pra análise,
    // a bomba travava no write do quadro e o áudio parava de chegar. Círculo perfeito.
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        // Entrada 0: vídeo cru da bomba (stdin).
        "-analyzeduration".into(),
        "0".into(),
        "-probesize".into(),
        "32".into(),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-s".into(),
        format!("{}x{}", spec.w, spec.h),
        "-r".into(),
        spec.fps.to_string(),
        "-i".into(),
        "-".into(),
        // Entrada 1: áudio cru da bomba (TCP local — o connect entra na backlog do listener,
        // então não há deadlock com o accept).
        "-analyzeduration".into(),
        "0".into(),
        "-probesize".into(),
        "32".into(),
        "-f".into(),
        "s16le".into(),
        "-ar".into(),
        PROG_AUDIO_HZ.to_string(),
        "-ac".into(),
        PROG_AUDIO_CH.to_string(),
        "-i".into(),
        format!("tcp://127.0.0.1:{audio_port}"),
        "-map".into(),
        "0:v".into(),
        "-map".into(),
        "1:a".into(),
    ];
    match hw_codec {
        Some(codec) => args.extend(
            [
                "-c:v",
                codec,
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
            ]
            .map(String::from),
        ),
        None => args.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-b:v",
                &format!("{vbr}k"),
                "-maxrate",
                &format!("{vbr}k"),
                "-bufsize",
                &format!("{}k", vbr * 2),
                "-g",
                &gop,
                "-keyint_min",
                &gop,
                "-sc_threshold",
                "0",
                "-pix_fmt",
                "yuv420p",
            ]
            .map(String::from),
        ),
    }
    args.extend(
        [
            "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-f", "flv",
        ]
        .map(String::from),
    );
    args.push(program_url(config));
    args
}

/// Gera um mediamtx.yml mínimo: só o servidor RTMP de ingestão, na porta configurada.
/// RTSP/HLS/WebRTC/SRT ficam desligados. A API de diagnóstico fica ativa somente
/// em 127.0.0.1:9997 para consultar os paths e detectar o sinal recebido do OBS.
pub fn mediamtx_config(config: &AppConfig) -> String {
    format!(
        concat!(
            "logLevel: info\n",
            "logDestinations: [stdout]\n",
            // Folga de buffer + timeouts generosos: evita derrubar leitor/publisher que atrase um pouco.
            "writeQueueSize: 4096\n",
            "readTimeout: 20s\n",
            "writeTimeout: 20s\n",
            "rtmp: yes\n",
            "rtmpAddress: {host}:{port}\n",
            "rtsp: no\n",
            "hls: no\n",
            "webrtc: no\n",
            "srt: no\n",
            "api: yes\n",
            "apiAddress: 127.0.0.1:9997\n",
            "metrics: no\n",
            "pprof: no\n",
            "playback: no\n",
            "paths:\n",
            "  all_others:\n",
        ),
        host = config.ingest.host,
        port = config.ingest.port
    )
}

// ---------------------------------------------------------------------------
// Estado de execução (espelha EngineSnapshot do TS)
// ---------------------------------------------------------------------------
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub target_id: String,
    pub name: String,
    pub state: String, // idle | connecting | live | reconnecting | error | paused | waiting | signal-lost | brb
    pub bitrate_kbps: u32,
    pub fps: u32,
    pub dropped_frames: u32,
    pub uptime_sec: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineSnapshot {
    pub state: String, // stopped | starting | live | error
    pub started_at: Option<u128>,
    /// O MediaMTX está recebendo quadros do OBS, mesmo que nenhum destino tenha aceitado
    /// a saída ainda. Separa falha da entrada de falha num destino personalizado.
    pub ingest_live: bool,
    /// Correlação opaca desta tentativa/live; seguro para detalhes copiáveis.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    /// Presente apenas em falha nativa já registrada/redigida.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
    pub targets: HashMap<String, TargetStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Uso real de CPU/GPU (%) enquanto transmite.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_pct: Option<f64>,
    /// Estatísticas do OBS (render/encode lag, congestionamento), se conectado.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obs: Option<ObsStats>,
    /// "JÁ VOLTO agora" acionado pelo streamer (slate manual, sem queda de sinal).
    pub forced_brb: bool,
}

/// Estatísticas do OBS via obs-websocket `GetStats`/`GetStreamStatus`.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsStats {
    pub active_fps: f64,
    pub avg_render_ms: f64,
    pub render_skipped: u32,
    pub output_skipped: u32,
    /// Congestionamento de saída (0..1) — alto = rede sofrendo.
    pub congestion: f64,
}

impl EngineSnapshot {
    pub fn stopped() -> Self {
        EngineSnapshot {
            state: "stopped".into(),
            started_at: None,
            ingest_live: false,
            operation_id: None,
            error_id: None,
            targets: HashMap::new(),
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
        }
    }

    /// Estado inicial: FFmpeg ouvindo, aguardando o OBS publicar.
    pub fn starting(config: &AppConfig, started_at: u128) -> Self {
        let mut s = Self::live(config, started_at);
        s.state = "starting".into();
        s
    }

    pub fn live(config: &AppConfig, started_at: u128) -> Self {
        let mut targets = HashMap::new();
        for t in config.targets.iter().filter(|t| t.enabled) {
            targets.insert(
                t.id.clone(),
                TargetStatus {
                    target_id: t.id.clone(),
                    name: t.name.clone(),
                    state: "connecting".into(),
                    // Zero até a PRIMEIRA medição real do FFmpeg — semear com o preset fazia
                    // um destino travado exibir "6.0 Mbps / 60 FPS" como se estivesse saudável.
                    bitrate_kbps: 0,
                    fps: 0,
                    dropped_frames: 0,
                    uptime_sec: 0.0,
                    message: None,
                },
            );
        }
        EngineSnapshot {
            state: "live".into(),
            started_at: Some(started_at),
            ingest_live: false,
            operation_id: None,
            error_id: None,
            targets,
            message: None,
            cpu: None,
            gpu: None,
            memory_pct: None,
            obs: None,
            forced_brb: false,
        }
    }
}

/// O que o auto-bitrate decidiu a partir de uma leitura de `speed=` do FFmpeg.
pub enum BitrateAction {
    /// Segura o bitrate atual.
    Hold,
    /// Aperto de internet: baixou pra X kbps (respawna o FFmpeg com esse valor).
    Down(u32),
    /// Recuperou: subiu pra X kbps.
    Up(u32),
}

/// Auto-bitrate PURO e testável de UM destino (transcode). A cada `speed=` do FFmpeg (≈1/s),
/// decide baixar/subir o bitrate dentro de `[floor, base]` — AIMD com reação proporcional:
///
/// - **BAIXA rápido e proporcional ao aperto:** `speed<0.6` (severo) age em 3 amostras cortando
///   40%; `speed<0.9` (leve) age em 8 cortando 20%. Aperto sério some da tela em ~3s, não ~8s.
/// - **SOBE aditivo** (passos de ~⅛ do base), só após estabilidade sustentada — sem o ×1.2 antigo
///   que estourava acima e voltava a apertar (a gangorra de reconexões).
/// - **COOLDOWN** após cada mudança: cada troca de bitrate reinicia o FFmpeg (reconecta a
///   plataforma), então espera algumas amostras antes de reagir de novo — evita thrash de restart.
///
/// Só decide; o supervisor em `commands.rs` é quem respawna o FFmpeg com o novo valor.
pub struct AutoBitrate {
    base: u32,     // teto: o bitrate configurado do destino
    floor: u32,    // piso: nunca abaixo disso (imagem mínima aceitável)
    current: u32,  // bitrate ativo
    slow: u32,     // leituras lentas consecutivas
    fast: u32,     // leituras boas consecutivas
    cooldown: u32, // amostras a ignorar após uma mudança
}

impl AutoBitrate {
    const SLOW: f64 = 0.9; // abaixo disso o FFmpeg não segura o tempo real
    const SEVERE: f64 = 0.6; // aperto sério → reage mais rápido e corta mais
    const COOLDOWN: u32 = 5; // ~5s de carência após cada mudança (anti-thrash)
    const RECOVER: u32 = 45; // ~45s de estabilidade antes de tentar subir
    const NEED_MILD: u32 = 8; // amostras lentas leves antes de baixar
    const NEED_SEVERE: u32 = 3; // amostras lentas severas antes de baixar

    pub fn new(base: u32, floor: u32) -> Self {
        let floor = floor.min(base);
        Self {
            base,
            floor,
            current: base,
            slow: 0,
            fast: 0,
            cooldown: 0,
        }
    }

    pub fn current(&self) -> u32 {
        self.current
    }

    /// Nova conexão (respawn do FFmpeg): zera os contadores por-instância; MANTÉM bitrate e
    /// cooldown (a carência da última mudança não pode ser apagada pelo respawn que ela causou).
    pub fn on_reconnect(&mut self) {
        self.slow = 0;
        self.fast = 0;
    }

    /// Uma leitura de `speed=` → decisão. `Down`/`Up` já atualizam `current`.
    pub fn on_speed(&mut self, speed: f64) -> BitrateAction {
        if self.cooldown > 0 {
            self.cooldown -= 1;
        }
        if speed < Self::SLOW {
            self.fast = 0;
            self.slow += 1;
            if self.cooldown == 0 && self.current > self.floor {
                let severe = speed < Self::SEVERE;
                let need = if severe {
                    Self::NEED_SEVERE
                } else {
                    Self::NEED_MILD
                };
                if self.slow >= need {
                    let cut = if severe { 0.6 } else { 0.8 };
                    let next = ((self.current as f64 * cut) as u32).max(self.floor);
                    if next < self.current {
                        self.current = next;
                        self.slow = 0;
                        self.cooldown = Self::COOLDOWN;
                        return BitrateAction::Down(next);
                    }
                }
            }
        } else {
            self.slow = 0;
            self.fast += 1;
            if self.cooldown == 0 && self.fast >= Self::RECOVER && self.current < self.base {
                // Aditivo (não ×fator): sobe um passo fixo, sem estourar acima do base.
                let step = (self.base / 8).max(300);
                let next = (self.current + step).min(self.base);
                self.current = next;
                self.fast = 0;
                self.cooldown = Self::COOLDOWN;
                return BitrateAction::Up(next);
            }
        }
        BitrateAction::Hold
    }
}

/// Os parâmetros com que o gravador subiu — o suficiente pra subir de novo igualzinho.
#[derive(Clone)]
pub struct RecorderLaunch {
    /// A MESMA URL que os destinos leem (`_program` com compositor, `live` sem ele).
    pub source: String,
    pub dir: std::path::PathBuf,
    pub session_path: std::path::PathBuf,
    pub id: String,
}

/// Runtime guardado no state do Tauri (handles dos sidecars + último snapshot).
#[derive(Default)]
pub struct EngineRuntime {
    /// Um FFmpeg por destino (target_id -> processo).
    pub ffmpegs: std::collections::HashMap<String, tauri_plugin_shell::process::CommandChild>,
    pub mediamtx: Option<tauri_plugin_shell::process::CommandChild>,
    /// Trava de sessão: `true` enquanto UM start_engine está no ar (ou subindo). É reivindicada
    /// ATOMICAMENTE sob o lock no topo do start (antes de qualquer trabalho lento) e solta por
    /// kill_engine/erro fatal — impede TOCTOU (dois cliques em BORA subindo dois motores).
    pub live: bool,
    /// Liga/desliga os supervisores de respawn (reconexão).
    pub running: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub snapshot: Option<EngineSnapshot>,
    pub started_ms: u128,
    /// Última qualidade refletida no ícone da bandeja (evita redesenhar à toa).
    pub tray_quality: String,
    /// Último título aplicado na janela principal (evita set_title repetido a cada emit).
    pub win_title: String,
    /// Arquivo NDJSON da sessão em gravação (relatório pós-live).
    pub session_path: Option<std::path::PathBuf>,
    /// Como o gravador foi lançado nesta live. Guardado pra que o "tentar de novo" reuse
    /// EXATAMENTE a mesma fonte que os destinos estão lendo, em vez de recalcular a
    /// decisão do compositor e correr o risco de apontar pro lugar errado.
    pub recorder_launch: Option<RecorderLaunch>,
    /// Flag de pausa por destino (controle ao vivo): true = supervisor não sobe FFmpeg.
    pub paused: std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Erro TERMINAL por destino (ex.: chave recusada): true = supervisor parqueia sem
    /// respawn até o "Tentar de novo" (retry_target) limpar a flag.
    pub auth_error:
        std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// "JÁ VOLTO agora" manual — só existe quando o compositor está no ar.
    pub force_brb: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    /// Geração da sessão: bump a cada claim do start_engine. O setup (cheio de awaits)
    /// revalida `live && start_gen == minha_gen` antes de instalar/spawnar — um Cortar
    /// (ou um segundo BORA) no meio do setup invalida a geração antiga.
    pub start_gen: u64,
    /// Último emit pra UI (ms) — throttle das atualizações de métrica (mantém transições).
    pub last_emit_ms: u128,
    /// UUID opaco criado no clique de BORA e propagado por todo o ciclo da live.
    /// Nunca deriva do ID/nome de destino.
    pub operation_id: Option<String>,
    /// Mapa interno target_id -> plataforma enumerada. O target_id não sai em
    /// telemetria; serve apenas para traduzir transições ao catálogo seguro.
    pub target_platforms: std::collections::HashMap<String, String>,
    /// Encoder consolidado para o evento único de entrada ao vivo.
    pub telemetry_encoder_kind: String,
    /// Reconexões consolidadas fora do hot path, emitidas apenas no fim.
    pub telemetry_reconnect_count: u32,
    /// Instante do clique de início (Unix ms), separado de `started_ms`, que é
    /// resetado quando o primeiro pacote realmente entra ao vivo.
    pub telemetry_start_requested_ms: u128,
    /// Último ID capturado durante o setup, para que o erro retornado ao
    /// frontend possa referenciar o issue sem duplicar a exceção.
    pub telemetry_last_error_id: Option<String>,
    /// Operação à qual `telemetry_last_error_id` pertence. Impede que um erro
    /// antigo (por exemplo, um check do OBS) seja anexado a um novo BORA.
    pub telemetry_last_error_operation_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{IngestConfig, Settings, TargetEncoding};

    fn preset(w: u32, h: u32, fps: u32, vb: u32) -> VideoPreset {
        VideoPreset {
            width: w,
            height: h,
            fps,
            video_bitrate_kbps: vb,
            audio_bitrate_kbps: 160,
            keyframe_sec: 2,
        }
    }
    fn tgt(platform: &str, preset: Option<VideoPreset>) -> Target {
        Target {
            id: "t".into(),
            platform_id: platform.into(),
            name: platform.into(),
            enabled: true,
            protocol: "rtmp".into(),
            ingest_url: "rtmp://x/app".into(),
            has_key: true,
            encoding: TargetEncoding {
                action: "transcode".into(),
                preset,
                encoder: "auto".into(),
                hybrid_override: None,
                reframe: None,
            },
        }
    }
    fn cfg(mode: &str, targets: Vec<Target>) -> AppConfig {
        AppConfig {
            schema_version: crate::config::CURRENT_SCHEMA_VERSION,
            revision: 0,
            ingest: IngestConfig {
                protocol: "rtmp".into(),
                host: "127.0.0.1".into(),
                port: 1935,
                app: "live".into(),
                key: "obs".into(),
            },
            mode: mode.into(),
            targets,
            settings: Settings::default(),
            profiles: vec![],
            active_profile_id: String::new(),
        }
    }

    #[test]
    fn audio_copy_requires_a_proven_program_contract() {
        let target = tgt("twitch", Some(preset(1280, 720, 30, 4000)));
        let mut config = cfg("per-platform", vec![target.clone()]);
        config.settings.guardian_enabled = true;
        config.settings.guardian_watchlist = vec!["private".into()];
        let audio = |config: &AppConfig, target: &Target, source: &str| {
            let args = ffmpeg_args_for_target(config, target, "key", None, source, None);
            args.windows(2).find(|pair| pair[0] == "-c:a").unwrap()[1].clone()
        };
        assert_eq!(audio(&config, &target, &program_url(&config)), "copy");
        assert_eq!(audio(&config, &target, "rtmp://127.0.0.1/live/obs"), "aac");
        let mut different = target.clone();
        different
            .encoding
            .preset
            .as_mut()
            .unwrap()
            .audio_bitrate_kbps = 128;
        assert_eq!(audio(&config, &different, &program_url(&config)), "aac");
        config.settings.loudness_normalize = true;
        assert_eq!(audio(&config, &target, &program_url(&config)), "aac");
        config.settings.loudness_normalize = false;
        config.settings.guardian_watchlist.clear();
        assert_eq!(audio(&config, &target, &program_url(&config)), "aac");
    }

    #[test]
    fn rendition_egress_copies_both_tracks_but_preserves_custom_handshake() {
        let target = tgt("custom", None);
        let mut config = cfg("per-platform", vec![target.clone()]);
        config.settings.loudness_normalize = true;
        let args = ffmpeg_args_for_rendition_egress(
            &config,
            &target,
            "secret-key",
            "rtmp://127.0.0.1/live/rendition",
        );
        for flag in ["-c:v", "-c:a"] {
            assert!(args.windows(2).any(|pair| pair == [flag, "copy"]));
        }
        assert!(!args
            .iter()
            .any(|arg| ["-vf", "-af", "-b:v", "-b:a"].contains(&arg.as_str())));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["-rtmp_playpath", "secret-key"]));
        assert_eq!(args.last().unwrap(), "rtmp://x/app/secret-key");
    }

    #[test]
    fn rendition_groups_compare_the_complete_effective_encoding() {
        let first = tgt("twitch", Some(preset(1280, 720, 30, 4000)));
        let mut second = first.clone();
        second.id = "b".into();
        second.platform_id = "custom".into();
        second.ingest_url = "rtmp://another/app".into();
        let grouped = |second: Target| {
            crate::renditions::plan(
                &cfg("per-platform", vec![first.clone(), second]),
                "source",
                Some("h264_nvenc"),
            )
        };
        assert_eq!(grouped(second.clone())[0].targets, ["t", "b"]);
        for field in [
            "audio", "bitrate", "fps", "gop", "width", "encoder", "disabled",
        ] {
            let mut different = second.clone();
            let p = different.encoding.preset.as_mut().unwrap();
            match field {
                "audio" => p.audio_bitrate_kbps = 128,
                "bitrate" => p.video_bitrate_kbps = 3500,
                "fps" => p.fps = 60,
                "gop" => p.keyframe_sec = 1,
                "width" => p.width = 1920,
                "encoder" => different.encoding.encoder = "software".into(),
                "disabled" => different.enabled = false,
                _ => unreachable!(),
            }
            assert!(grouped(different).is_empty(), "must not group {field}");
        }
        assert!(
            crate::renditions::plan(&cfg("passthrough", vec![first, second]), "source", None)
                .is_empty()
        );
    }

    #[test]
    fn effective_action_by_mode() {
        assert_eq!(
            effective_action("passthrough", &tgt("twitch", None)),
            "copy"
        );
        assert_eq!(
            effective_action("per-platform", &tgt("twitch", None)),
            "transcode"
        );
        // híbrido "esperto": landscape copia, vertical (TikTok) recodifica.
        assert_eq!(effective_action("hybrid", &tgt("twitch", None)), "copy");
        assert_eq!(
            effective_action("hybrid", &tgt("tiktok", None)),
            "transcode"
        );
    }

    #[test]
    fn effective_action_respects_override() {
        let mut t = tgt("twitch", None);
        t.encoding.hybrid_override = Some("transcode".into());
        assert_eq!(effective_action("hybrid", &t), "transcode");
    }

    #[test]
    fn video_codec_mapping() {
        assert_eq!(ffmpeg_video_codec("nvenc", None), "h264_nvenc");
        assert_eq!(ffmpeg_video_codec("software", None), "libx264");
        assert_eq!(ffmpeg_video_codec("auto", Some("h264_qsv")), "h264_qsv");
        assert_eq!(ffmpeg_video_codec("auto", None), "libx264");
    }

    #[test]
    fn sanitize_clamps_absurd_values() {
        let p = sanitize_preset(preset(999_999, 0, 999, 5));
        assert_eq!(p.width, 7680);
        assert_eq!(p.height, 16);
        assert_eq!(p.fps, 240);
        assert_eq!(p.video_bitrate_kbps, 100);
    }

    #[test]
    fn effective_preset_is_single_source() {
        // sem preset → cai no recomendado (sanitizado) da plataforma.
        let t = tgt("twitch", None);
        assert_eq!(
            effective_preset(&t),
            sanitize_preset(recommended_preset("twitch"))
        );
        // com preset absurdo → sanitizado.
        let t2 = tgt("twitch", Some(preset(999_999, 1080, 60, 6000)));
        assert_eq!(effective_preset(&t2).width, 7680);
    }

    #[test]
    fn program_resolution_adapts() {
        // tudo 720p landscape → programa em 720p (não desperdiça encode em 1080p).
        let c = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 4000)))],
        );
        assert_eq!(program_resolution(&c, false), (1280, 720));
        // algum destino 1080p → 1080p.
        let c2 = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_resolution(&c2, false), (1920, 1080));
        // vertical (recorte 9:16) precisa da fonte cheia → 1080p.
        let c3 = cfg(
            "hybrid",
            vec![tgt("tiktok", Some(preset(720, 1280, 30, 3000)))],
        );
        assert_eq!(program_resolution(&c3, false), (1920, 1080));
        // guardião sempre 1080p.
        assert_eq!(program_resolution(&c, true), (1920, 1080));
    }

    #[test]
    fn program_spec_fps_and_bitrate() {
        // fps acompanha o maior preset (cap 60); guardião trava em 30.
        let c = cfg(
            "hybrid",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        assert_eq!(program_spec(&c, false).fps, 60);
        assert_eq!(program_spec(&c, true).fps, 30);
        // bitrate do programa acompanha o maior destino, com piso de 2500.
        let low = cfg(
            "hybrid",
            vec![tgt("facebook", Some(preset(1280, 720, 30, 1000)))],
        );
        assert!(program_spec(&low, false).video_kbps >= 2500);
    }

    #[test]
    fn reframe_filter_crops_and_scales() {
        let vf = reframe_filter(None, 720, 1280);
        assert!(vf.contains("crop="));
        assert!(vf.contains("scale=720:1280"));
    }

    #[test]
    fn ffmpeg_args_copy_path() {
        let c = cfg("passthrough", vec![tgt("twitch", None)]);
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "streamkey",
            None,
            "rtmp://127.0.0.1:1935/live/obs",
            None,
        );
        let s = args.join(" ");
        assert!(s.contains("-c:v copy"), "cópia lossless de vídeo: {s}");
        assert!(s.contains("-c:a aac"), "áudio sempre AAC");
        assert!(s.contains("-f flv"));
        assert!(s.ends_with("streamkey"), "saída termina com a chave: {s}");
        assert!(!s.contains("-b:v"), "cópia NÃO seta bitrate de vídeo: {s}");
    }

    #[test]
    fn custom_output_url_places_key_before_query() {
        assert_eq!(
            compose_output_url("rtmps://ingest.example.test/live?token=abc", "stream-1"),
            "rtmps://ingest.example.test/live/stream-1?token=abc"
        );
        assert_eq!(
            compose_output_url(
                "rtmp://ingest.example.test/app?token=abc",
                "stream-1?bandwidthtest=true"
            ),
            "rtmp://ingest.example.test/app/stream-1?token=abc&bandwidthtest=true"
        );
    }

    #[test]
    fn custom_output_url_does_not_duplicate_embedded_key() {
        assert_eq!(
            compose_output_url("rtmp://ingest.example.test/app/stream-1", "stream-1"),
            "rtmp://ingest.example.test/app/stream-1"
        );
        assert_eq!(
            compose_output_url("rtmps://ingest.example.test/app/{stream_key}", "/stream-1"),
            "rtmps://ingest.example.test/app/stream-1"
        );
        assert_eq!(
            compose_output_url(
                "rtmp://ingest.example.test/app/account/stream-1",
                "account/stream-1"
            ),
            "rtmp://ingest.example.test/app/account/stream-1"
        );
        assert_eq!(
            compose_output_url(
                "rtmps://ingest.example.test/live?stream_key=stream-1",
                "stream-1"
            ),
            "rtmps://ingest.example.test/live?stream_key=stream-1"
        );
    }

    #[test]
    fn custom_target_uses_obs_compatible_rtmp_handshake() {
        let c = cfg("passthrough", vec![tgt("custom", None)]);
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "/stream-1?token=abc",
            None,
            "rtmp://127.0.0.1:1935/live/obs",
            None,
        );
        let s = args.join(" ");
        assert!(s.contains("-rtmp_flashver WIN 10,0,32,18"), "{s}");
        assert!(s.contains("-rtmp_playpath stream-1?token=abc"), "{s}");
        assert!(s.contains("-tcp_nodelay 1"), "{s}");
    }

    #[test]
    fn ffmpeg_args_transcode_path() {
        let c = cfg(
            "per-platform",
            vec![tgt("twitch", Some(preset(1920, 1080, 60, 6000)))],
        );
        let args = ffmpeg_args_for_target(
            &c,
            &c.targets[0],
            "sk",
            Some(4500),
            "rtmp://x/live/obs",
            Some("h264_nvenc"),
        );
        let s = args.join(" ");
        assert!(s.contains("-c:v h264_nvenc"), "encoder auto→nvenc: {s}");
        assert!(s.contains("-b:v 4500k"), "br_override aplicado: {s}");
        assert!(s.contains("-maxrate 4500k"));
        assert!(s.contains("-bufsize 9000k"), "bufsize = vbr*2");
        assert!(s.contains("-vf scale=1920:1080"), "escala landscape: {s}");
        assert!(s.contains("-g 120"), "gop = fps*keyframe_sec (60*2): {s}");
        // sem normalização por padrão → nada de loudnorm.
        assert!(!s.contains("loudnorm"));
    }

    #[test]
    fn ffmpeg_args_loudnorm_when_enabled() {
        let mut c = cfg("passthrough", vec![tgt("twitch", None)]);
        // desligado → sem loudnorm (mesmo alvo definido).
        c.settings.loudness_target_lufs = -16.0;
        assert!(
            !ffmpeg_args_for_target(&c, &c.targets[0], "k", None, "rtmp://x/live/obs", None)
                .join(" ")
                .contains("loudnorm")
        );
        // ligado → injeta loudnorm no alvo, com TP travado; e NÃO reencoda o vídeo (segue em cópia).
        c.settings.loudness_normalize = true;
        let s = ffmpeg_args_for_target(&c, &c.targets[0], "k", None, "rtmp://x/live/obs", None)
            .join(" ");
        assert!(s.contains("-af loudnorm=I=-16.0:TP=-1.5:LRA=11"), "{s}");
        assert!(
            s.contains("-c:v copy"),
            "áudio normaliza, vídeo segue em cópia: {s}"
        );
        assert!(s.contains("-c:a aac"));
    }

    // ---- auto-bitrate (AIMD) ----

    fn feed_down(abr: &mut AutoBitrate, speed: f64, n: u32) -> Option<u32> {
        let mut last = None;
        for _ in 0..n {
            if let BitrateAction::Down(k) = abr.on_speed(speed) {
                last = Some(k);
            }
        }
        last
    }

    #[test]
    fn abr_starts_at_base() {
        assert_eq!(AutoBitrate::new(6000, 2400).current(), 6000);
    }

    #[test]
    fn abr_mild_congestion_cuts_20pct_after_8() {
        let mut a = AutoBitrate::new(6000, 2400);
        // 7 amostras leves não bastam; a 8ª corta 20% → 4800.
        assert_eq!(feed_down(&mut a, 0.85, 7), None);
        assert_eq!(feed_down(&mut a, 0.85, 1), Some(4800));
        assert_eq!(a.current(), 4800);
    }

    #[test]
    fn abr_severe_congestion_cuts_40pct_fast() {
        let mut a = AutoBitrate::new(6000, 2400);
        // aperto severo (speed<0.6) age em 3 amostras cortando 40% → 3600 (vs 8 no leve).
        assert_eq!(feed_down(&mut a, 0.5, 3), Some(3600));
        assert_eq!(a.current(), 3600);
    }

    #[test]
    fn abr_never_below_floor() {
        let mut a = AutoBitrate::new(6000, 2400);
        for _ in 0..200 {
            a.on_speed(0.3);
        }
        assert_eq!(a.current(), 2400); // 6000→3600→2400 (piso), nunca abaixo
    }

    #[test]
    fn abr_recovers_additively_capped_at_base() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8); // → 4800
        assert_eq!(a.current(), 4800);
        // muitas amostras boas: sobe em passos aditivos (+base/8=750), sem passar do base.
        let mut ups = vec![];
        for _ in 0..300 {
            if let BitrateAction::Up(k) = a.on_speed(1.0) {
                ups.push(k);
            }
        }
        assert!(
            ups.contains(&5550),
            "primeiro passo aditivo 4800+750: {ups:?}"
        );
        assert_eq!(a.current(), 6000);
        assert!(
            ups.iter().all(|&k| k <= 6000),
            "nunca acima do base: {ups:?}"
        );
    }

    #[test]
    fn abr_cooldown_blocks_immediate_rethrash() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.5, 3); // → 3600, cooldown liga
                                   // durante o cooldown, mesmo com aperto, NÃO muda de novo...
        for _ in 0..4 {
            assert!(matches!(a.on_speed(0.5), BitrateAction::Hold));
        }
        // ...e ao fim do cooldown volta a baixar (o aperto persistiu).
        assert!(matches!(a.on_speed(0.5), BitrateAction::Down(_)));
    }

    #[test]
    fn abr_on_reconnect_keeps_bitrate() {
        let mut a = AutoBitrate::new(6000, 2400);
        feed_down(&mut a, 0.85, 8); // → 4800
        a.on_reconnect();
        assert_eq!(a.current(), 4800); // respawn mantém o bitrate; só zera contadores
    }
}
