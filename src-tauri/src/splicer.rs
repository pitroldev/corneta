//! Splicer do **feed de programa** — o "JÁ VOLTO" SEM re-encode (só quando o guardião está
//! desligado e o slate é imagem). Onde o compositor decodifica tudo e reencoda a live inteira,
//! o splicer só **copia os pacotes** do OBS pro `_program` e, quando o OBS cai (ou o streamer
//! força a pausa), **emenda** um slate pré-encodado no MESMO fluxo — a conexão das plataformas
//! nunca cai porque o FFmpeg de saída (o publisher do `_program`) nunca para.
//!
//! ```text
//!   OBS → MediaMTX(live) → ffmpeg -c copy -f flv (pipe) ┐
//!                                                        ├→ [splice em Rust, 1 relógio] → ffmpeg -c copy → MediaMTX(_program)
//!   sinal caiu? slate H.264 pré-encodado (imagem) ───────┘   (nunca morre até o stop)
//! ```
//!
//! **A sacada** (§ pedido do usuário): reusar o *sequence header* (SPS/PPS) do OBS — o
//! `_program` anuncia o avcC do OBS uma única vez; o slate reafirma o SEU próprio SPS/PPS
//! **in-band** (mesmo id, conteúdo do slate) antes de cada IDR do slate, e na volta a gente
//! reafirma o SPS/PPS do OBS antes do IDR de retorno. Transições são sempre IDR→IDR (reset
//! limpo do decoder). O slate é conformante à resolução/perfil do OBS (encodado uma vez no
//! setup), então nada é "recodificado" durante a live.
//!
//! **Regra de ouro** (do red-team): o ffmpeg de SAÍDA é o publisher do `_program`. Delegar pro
//! compositor no meio da sessão mataria esse publisher = reconexão de TODOS os destinos. Então
//! a delegação só acontece no SETUP (antes do `_program` publicar). Qualquer problema no meio
//! (avcC incompatível, sem IDR) vira "segura no slate" (HoldIncompat) — nunca derruba.
//!
//! Usa `std::process` (não o tauri shell) porque o fluxo é BINÁRIO — o shell quebraria em
//! linhas (mesmo motivo do compositor.rs).

use std::collections::VecDeque;
use std::io::{BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::compositor::{CompositorOpts, Slate};
use crate::engine;

// ----------------------------- constantes -----------------------------

/// FPS do slate (o slate é estático — 30 é folgado e leve).
const SLATE_FPS: u32 = 30;
/// Sem pacote novo do OBS por tanto tempo (modo cópia não tem quadro pra congelar) → corta pro
/// slate. Muito baixo pisca em engasgo benigno; muito alto mostra um congelado mais longo.
const HOLD_MS: u64 = 600;
/// Intervalo mínimo entre respawns do ffmpeg de entrada (queda do OBS).
const RESPAWN_MS: u64 = 1500;
/// Depois que o OBS PUBLICA (has_signal), quanto esperar pelo avcC antes de desistir (setup).
const SETUP_DEADLINE_MS: u64 = 8_000;
/// Máximo de quadros de slate emitidos por iteração do laço (evita rajada se o laço travar).
const SLATE_CATCHUP_CAP: u32 = 3;
/// Teto de duração do slate de VÍDEO cacheado (loop). O vídeo é transcodado UMA vez no setup e
/// os quadros ficam na RAM — capar segura o consumo (30s@1080p30 ≈ ~35 MB) e o tempo de BORA.
const SLATE_VIDEO_MAX_SEC: u64 = 30;

// ----------------------------- FLV wire -----------------------------

/// Um TAG do FLV já com timestamp de 32 bits montado (ts_ext + ts_low).
struct FlvTag {
    tag_type: u8, // 8=áudio, 9=vídeo, 18=script
    ts: u32,      // ms (32 bits, ts_ext<<24 | low24)
    data: Vec<u8>,
}

/// Preâmbulo do FLV: cabeçalho (9) + PrevTagSize0 (4). Emitido UMA vez no começo do `_program`.
fn write_preamble(w: &mut impl Write) -> std::io::Result<()> {
    // "FLV" | v1 | flags(bit0 vídeo + bit2 áudio = 0x05) | headerlen=9 | PrevTagSize0=0
    w.write_all(&[
        0x46, 0x4C, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00,
    ])
}

/// Escreve um tag: [type][datasize:3][ts_low:3][ts_ext][streamID=0:3][data][prevTagSize:4].
fn write_tag(w: &mut impl Write, tag_type: u8, ts: u32, data: &[u8]) -> std::io::Result<()> {
    let n = data.len() as u32;
    let mut hdr = [0u8; 11];
    hdr[0] = tag_type;
    hdr[1] = (n >> 16) as u8;
    hdr[2] = (n >> 8) as u8;
    hdr[3] = n as u8;
    hdr[4] = (ts >> 16) as u8; // ts low 24, bits 16..24
    hdr[5] = (ts >> 8) as u8;
    hdr[6] = ts as u8;
    hdr[7] = (ts >> 24) as u8; // ts_ext (mandatório > ~4.6h)
                               // streamID = 0 (hdr[8..11] já são 0)
    w.write_all(&hdr)?;
    w.write_all(data)?;
    let prev = 11 + n;
    w.write_all(&prev.to_be_bytes())
}

/// Lê o cabeçalho do FLV (9 bytes) + PrevTagSize0 (4). Valida a assinatura "FLV".
fn read_flv_header(r: &mut impl Read) -> std::io::Result<()> {
    let mut h = [0u8; 9];
    r.read_exact(&mut h)?;
    if &h[0..3] != b"FLV" {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "sem assinatura FLV",
        ));
    }
    // DataOffset (h[5..9]) é sempre 9; pula o PrevTagSize0.
    let mut skip = [0u8; 4];
    r.read_exact(&mut skip)
}

/// Lê UM tag do FLV (bloqueante). Ok(None) = EOF limpo.
fn read_tag(r: &mut impl Read) -> std::io::Result<Option<FlvTag>> {
    let mut hdr = [0u8; 11];
    if let Err(e) = r.read_exact(&mut hdr) {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(e);
    }
    let tag_type = hdr[0];
    let datasize = ((hdr[1] as usize) << 16) | ((hdr[2] as usize) << 8) | (hdr[3] as usize);
    let ts = ((hdr[7] as u32) << 24)
        | ((hdr[4] as u32) << 16)
        | ((hdr[5] as u32) << 8)
        | (hdr[6] as u32);
    let mut data = vec![0u8; datasize];
    r.read_exact(&mut data)?;
    let mut prev = [0u8; 4];
    r.read_exact(&mut prev)?; // PrevTagSize (descartado)
    Ok(Some(FlvTag { tag_type, ts, data }))
}

// ----------------------------- H.264 / avcC / SPS -----------------------------

/// Campos do SPS que importam pros portões e pra dimensionar o slate.
#[derive(Clone, Debug, Default, PartialEq)]
struct SpsInfo {
    width: u32,
    height: u32,
    profile_idc: u8,
    level_idc: u8,
    chroma_format_idc: u32,
    frame_mbs_only: u8,
    bit_depth_luma_minus8: u32,
    bit_depth_chroma_minus8: u32,
    // Geometria do slice header (bit-widths de frame_num/POC). Se mudar entre reconexões, os
    // slices do OBS retomado seriam parseados com o SPS antigo (reafirmado in-band) e o
    // Exp-Golomb desincroniza — por isso entram na comparação semântica (→ HoldIncompat).
    log2_max_frame_num: u32,
    pic_order_cnt_type: u32,
    log2_max_pic_order_cnt_lsb: u32,
}

impl SpsInfo {
    /// Compara SÓ o que muda a decodabilidade — VUI/timing variam benignamente por reconexão.
    fn semantically_eq(&self, o: &SpsInfo) -> bool {
        self.width == o.width
            && self.height == o.height
            && self.profile_idc == o.profile_idc
            && self.level_idc == o.level_idc
            && self.chroma_format_idc == o.chroma_format_idc
            && self.frame_mbs_only == o.frame_mbs_only
            && self.log2_max_frame_num == o.log2_max_frame_num
            && self.pic_order_cnt_type == o.pic_order_cnt_type
            && self.log2_max_pic_order_cnt_lsb == o.log2_max_pic_order_cnt_lsb
    }
}

/// AVCDecoderConfigurationRecord decodificado: TODOS os SPS e PPS (alguns encoders têm >1).
#[derive(Clone, Debug)]
struct AvcC {
    sps: Vec<Vec<u8>>,
    pps: Vec<Vec<u8>>,
    length_size: u8, // (lengthSizeMinusOne)+1; todos os casos testados = 4
    info: SpsInfo,
    raw: Vec<u8>, // o avcC ORIGINAL do OBS, verbatim (reemitido no seq header, byte-exato)
}

/// AudioSpecificConfig do AAC.
#[derive(Clone, Debug)]
struct Asc {
    bytes: Vec<u8>, // corpo do tag (0xAF 0x00 ...), reemitido verbatim
    sample_rate: u32,
    channels: u8,
    object_type: u8,
}

impl Asc {
    fn semantically_eq(&self, o: &Asc) -> bool {
        self.sample_rate == o.sample_rate
            && self.channels == o.channels
            && self.object_type == o.object_type
    }
}

/// Leitor de bits big-endian pra Exp-Golomb (SPS/ASC).
struct BitReader<'a> {
    data: &'a [u8],
    byte: usize,
    bit: u8,
}
impl<'a> BitReader<'a> {
    fn new(data: &'a [u8]) -> Self {
        BitReader {
            data,
            byte: 0,
            bit: 0,
        }
    }
    fn bit(&mut self) -> Option<u32> {
        let b = *self.data.get(self.byte)?;
        let v = ((b >> (7 - self.bit)) & 1) as u32;
        self.bit += 1;
        if self.bit == 8 {
            self.bit = 0;
            self.byte += 1;
        }
        Some(v)
    }
    fn bits(&mut self, n: u32) -> Option<u32> {
        let mut v = 0u32;
        for _ in 0..n {
            v = (v << 1) | self.bit()?;
        }
        Some(v)
    }
    /// ue(v) — Exp-Golomb sem sinal (limitado a 32 leading zeros pra nunca travar).
    fn ue(&mut self) -> Option<u32> {
        let mut zeros = 0u32;
        while self.bit()? == 0 {
            zeros += 1;
            if zeros > 32 {
                return None;
            }
        }
        if zeros == 0 {
            return Some(0);
        }
        let rest = self.bits(zeros)?;
        Some((1u32 << zeros) - 1 + rest)
    }
    /// se(v) — Exp-Golomb com sinal (só consumido; não precisamos do valor).
    fn se(&mut self) -> Option<i32> {
        let k = self.ue()?;
        let sign = if k & 1 == 1 { 1 } else { -1 };
        Some(sign * ((k as i64 + 1) / 2) as i32)
    }
}

/// Remove a emulation-prevention (00 00 03 → 00 00) de um NAL RBSP.
fn strip_emulation(nal: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(nal.len());
    let mut zeros = 0;
    let mut i = 0;
    while i < nal.len() {
        let b = nal[i];
        if zeros >= 2 && b == 0x03 && i + 1 < nal.len() && nal[i + 1] <= 0x03 {
            zeros = 0;
            i += 1;
            continue;
        }
        if b == 0 {
            zeros += 1;
        } else {
            zeros = 0;
        }
        out.push(b);
        i += 1;
    }
    out
}

/// Pula uma scaling list (só consome os se(v); não guardamos os valores).
fn skip_scaling_list(br: &mut BitReader, size: u32) -> Option<()> {
    let mut last = 8i32;
    let mut next = 8i32;
    for _ in 0..size {
        if next != 0 {
            let delta = br.se()?;
            next = (last + delta + 256) % 256;
        }
        if next != 0 {
            last = next;
        }
    }
    Some(())
}

/// Parseia o SPS (após o byte de cabeçalho do NAL). Bounded — nunca faz pânico; None em erro.
fn parse_sps(nal: &[u8]) -> Option<SpsInfo> {
    if nal.len() < 4 {
        return None;
    }
    let rbsp = strip_emulation(&nal[1..]); // pula o header do NAL
    let mut br = BitReader::new(&rbsp);
    let profile_idc = br.bits(8)? as u8;
    let _constraint = br.bits(8)?;
    let level_idc = br.bits(8)? as u8;
    let _sps_id = br.ue()?;
    let mut chroma_format_idc = 1u32;
    let mut bit_depth_luma_minus8 = 0u32;
    let mut bit_depth_chroma_minus8 = 0u32;
    let high = matches!(
        profile_idc,
        100 | 110 | 122 | 244 | 44 | 83 | 86 | 118 | 128 | 138 | 139 | 134 | 135
    );
    if high {
        chroma_format_idc = br.ue()?;
        if chroma_format_idc == 3 {
            let _separate_colour_plane = br.bit()?;
        }
        bit_depth_luma_minus8 = br.ue()?;
        bit_depth_chroma_minus8 = br.ue()?;
        let _qpprime = br.bit()?;
        let seq_scaling_matrix = br.bit()?;
        if seq_scaling_matrix == 1 {
            let n = if chroma_format_idc == 3 { 12 } else { 8 };
            for i in 0..n {
                let present = br.bit()?;
                if present == 1 {
                    let size = if i < 6 { 16 } else { 64 };
                    skip_scaling_list(&mut br, size)?;
                }
            }
        }
    }
    let log2_max_frame_num = br.ue()?;
    let poc_type = br.ue()?;
    let mut log2_max_poc = 0u32;
    if poc_type == 0 {
        log2_max_poc = br.ue()?;
    } else if poc_type == 1 {
        let _delta_pic_order_always_zero = br.bit()?;
        let _offset_non_ref = br.se()?;
        let _offset_top_bottom = br.se()?;
        let num = br.ue()?;
        for _ in 0..num.min(256) {
            let _ = br.se()?;
        }
    }
    let _max_num_ref = br.ue()?;
    let _gaps = br.bit()?;
    let pic_width_in_mbs_minus1 = br.ue()?;
    let pic_height_in_map_units_minus1 = br.ue()?;
    let frame_mbs_only = br.bit()? as u8;
    if frame_mbs_only == 0 {
        let _mb_adaptive = br.bit()?;
    }
    let _direct_8x8 = br.bit()?;
    let (mut crop_l, mut crop_r, mut crop_t, mut crop_b) = (0u32, 0u32, 0u32, 0u32);
    let cropping = br.bit()?;
    if cropping == 1 {
        crop_l = br.ue()?;
        crop_r = br.ue()?;
        crop_t = br.ue()?;
        crop_b = br.ue()?;
    }
    // yuv420 (chroma=1): unidade de crop = 2 horizontal, 2*(2-frame_mbs_only) vertical.
    let sub_w = if chroma_format_idc == 1 || chroma_format_idc == 2 {
        2
    } else {
        1
    };
    let sub_h = if chroma_format_idc == 1 { 2 } else { 1 };
    let crop_unit_x = sub_w;
    let crop_unit_y = sub_h * (2 - frame_mbs_only as u32);
    let width = (pic_width_in_mbs_minus1 + 1) * 16 - (crop_l + crop_r) * crop_unit_x;
    let height = (2 - frame_mbs_only as u32) * (pic_height_in_map_units_minus1 + 1) * 16
        - (crop_t + crop_b) * crop_unit_y;
    Some(SpsInfo {
        width,
        height,
        profile_idc,
        level_idc,
        chroma_format_idc,
        frame_mbs_only,
        bit_depth_luma_minus8,
        bit_depth_chroma_minus8,
        log2_max_frame_num,
        pic_order_cnt_type: poc_type,
        log2_max_pic_order_cnt_lsb: log2_max_poc,
    })
}

/// Parseia o avcC (corpo do tag de vídeo AVCPacketType==0, ou seja `data[5..]`).
fn parse_avcc(cfg: &[u8]) -> Option<AvcC> {
    if cfg.len() < 6 || cfg[0] != 1 {
        return None;
    }
    let length_size = (cfg[4] & 0x03) + 1;
    let num_sps = (cfg[5] & 0x1F) as usize;
    let mut i = 6;
    let mut sps = Vec::new();
    for _ in 0..num_sps {
        if i + 2 > cfg.len() {
            return None;
        }
        let len = ((cfg[i] as usize) << 8) | cfg[i + 1] as usize;
        i += 2;
        if i + len > cfg.len() {
            return None;
        }
        sps.push(cfg[i..i + len].to_vec());
        i += len;
    }
    if i >= cfg.len() {
        return None;
    }
    let num_pps = cfg[i] as usize;
    i += 1;
    let mut pps = Vec::new();
    for _ in 0..num_pps {
        if i + 2 > cfg.len() {
            return None;
        }
        let len = ((cfg[i] as usize) << 8) | cfg[i + 1] as usize;
        i += 2;
        if i + len > cfg.len() {
            return None;
        }
        pps.push(cfg[i..i + len].to_vec());
        i += len;
    }
    let info = parse_sps(sps.first()?)?;
    Some(AvcC {
        sps,
        pps,
        length_size,
        info,
        raw: cfg.to_vec(),
    })
}

/// Parseia o ASC (corpo do tag de áudio AACPacketType==0). data = tag inteiro (0xAF 0x00 ...).
fn parse_asc(data: &[u8]) -> Option<Asc> {
    if data.len() < 4 {
        return None;
    }
    let asc = &data[2..]; // pula 0xAF 0x00
    let mut br = BitReader::new(asc);
    let object_type = br.bits(5)? as u8;
    let freq_idx = br.bits(4)?;
    let sr = match freq_idx {
        0 => 96000,
        1 => 88200,
        2 => 64000,
        3 => 48000,
        4 => 44100,
        5 => 32000,
        6 => 24000,
        7 => 22050,
        8 => 16000,
        9 => 12000,
        10 => 11025,
        11 => 8000,
        12 => 7350,
        _ => return None,
    };
    let channels = br.bits(4)? as u8;
    Some(Asc {
        bytes: data.to_vec(),
        sample_rate: sr,
        channels,
        object_type,
    })
}

/// Itera os NALUs length-prefixed de um payload AVCC (após os 5 bytes de cabeçalho AVC do tag),
/// com checagem de limites. `length_size` vem do avcC.
fn each_nalu(payload: &[u8], length_size: u8) -> Vec<&[u8]> {
    let ls = length_size as usize;
    let mut out = Vec::new();
    let mut i = 0;
    while i + ls <= payload.len() {
        let mut len = 0usize;
        for k in 0..ls {
            len = (len << 8) | payload[i + k] as usize;
        }
        i += ls;
        if len == 0 || i + len > payload.len() {
            break; // prefixo maior que o tag → para (não indexa fora)
        }
        out.push(&payload[i..i + len]);
        i += len;
    }
    out
}

/// O tag de vídeo tem um NAL tipo 5 (IDR)? (não confia só na flag de keyframe do FLV.)
fn tag_is_idr(data: &[u8], length_size: u8) -> bool {
    if data.len() < 5 || (data[0] & 0x0F) != 7 || data[1] != 1 {
        return false;
    }
    each_nalu(&data[5..], length_size)
        .iter()
        .any(|n| !n.is_empty() && (n[0] & 0x1F) == 5)
}

/// É o sequence header (avcC) de vídeo? (codecID==7 && AVCPacketType==0)
fn tag_is_video_seqhdr(data: &[u8]) -> bool {
    data.len() >= 5 && (data[0] & 0x0F) == 7 && data[1] == 0
}
/// É o ASC de áudio? (soundFormat AAC==10 && AACPacketType==0)
fn tag_is_audio_seqhdr(data: &[u8]) -> bool {
    data.len() >= 2 && (data[0] >> 4) == 10 && data[1] == 0
}

/// Monta os NALUs length-prefixed (SPS + PPS) pra reafirmar in-band antes de um IDR.
fn prefix_param_sets(sps: &[Vec<u8>], pps: &[Vec<u8>], length_size: u8) -> Vec<u8> {
    let ls = length_size as usize;
    let mut out = Vec::new();
    for set in sps.iter().chain(pps.iter()) {
        let len = set.len() as u32;
        out.extend_from_slice(&len.to_be_bytes()[4 - ls..]); // últimos ls bytes = big-endian
        out.extend_from_slice(set);
    }
    out
}

// ----------------------------- processo ffmpeg -----------------------------

/// Caminho do sidecar ffmpeg (ao lado do exe, sem sufixo do triple — dev e bundle).
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

fn base_cmd(ffmpeg: &std::path::Path) -> Command {
    let mut cmd = Command::new(ffmpeg);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Mata um processo (kill + wait + taskkill /T /F no Windows pra levar netos junto).
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

/// Sobe o ffmpeg de ENTRADA: lê o `live` do OBS e cospe FLV (-c copy) no stdout.
fn spawn_input(ffmpeg: &std::path::Path, ingest: &str) -> std::io::Result<Child> {
    base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-fflags",
            "+genpts",
            "-i",
            ingest,
            "-c",
            "copy",
            "-f",
            "flv",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

/// Sobe o ffmpeg de SAÍDA: recebe FLV no stdin (-c copy) e publica no `_program`. NUNCA morre
/// até running==false (é ele que segura a conexão das plataformas).
fn spawn_output(ffmpeg: &std::path::Path, program_url: &str) -> std::io::Result<Child> {
    base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "flv",
            "-i",
            "pipe:0",
            "-c",
            "copy",
            "-f",
            "flv",
            program_url,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

/// Thread leitora do ffmpeg de entrada: parseia tags e despeja no canal com a GERAÇÃO atual.
/// Canal desconectado = ffmpeg morreu (queda do OBS). Retorna o handle da thread pra dar join.
fn spawn_reader(
    child: &mut Child,
    gen: u64,
) -> (Receiver<(u64, FlvTag)>, std::thread::JoinHandle<()>) {
    let stdout = child.stdout.take().expect("input ffmpeg sem stdout");
    let (tx, rx) = std::sync::mpsc::sync_channel::<(u64, FlvTag)>(256);
    let handle = std::thread::spawn(move || {
        let mut r = BufReader::with_capacity(1 << 16, stdout);
        if read_flv_header(&mut r).is_err() {
            return;
        }
        loop {
            match read_tag(&mut r) {
                Ok(Some(tag)) => {
                    if tx.send((gen, tag)).is_err() {
                        return; // pump foi embora
                    }
                }
                Ok(None) | Err(_) => return, // EOF/erro → canal desconecta
            }
        }
    });
    (rx, handle)
}

/// Junta a thread leitora SEM travar. O `in_child` já foi morto, mas a leitora pode estar PARADA
/// num send() com o canal cheio (backpressure da saída) — matar o filho não a acorda. Drena o
/// canal (libera o send), a leitora então lê EOF e sai. Teto de ~2s pra nunca travar o teardown.
fn drain_and_join(rx: &Receiver<(u64, FlvTag)>, reader: Option<std::thread::JoinHandle<()>>) {
    let Some(r) = reader else { return };
    let mut spins = 0u32;
    loop {
        match rx.try_recv() {
            Ok(_) => {}
            Err(TryRecvError::Disconnected) => break,
            Err(TryRecvError::Empty) => {
                spins += 1;
                if spins > 2000 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(1));
            }
        }
    }
    let _ = r.join();
}

// ----------------------------- slate + silêncio -----------------------------

/// Um quadro pré-encodado do slate, pronto pra emitir (keyframes já trazem SPS/PPS in-band).
struct SlateFrame {
    keyframe: bool,
    data: Vec<u8>, // corpo do tag de vídeo (0x17/0x27, 0x01, CTS=0, NALUs)
}

struct SlateMediaSpec {
    width: u32,
    height: u32,
    sample_rate: u32,
    channels: u8,
}

fn map_profile(profile_idc: u8) -> Option<&'static str> {
    match profile_idc {
        66 => Some("baseline"),
        77 => Some("main"),
        100 => Some("high"),
        _ => None,
    }
}

/// Prepara o slate (imagem OU vídeo) UMA vez no setup: transcoda conformado ao SPS/PPS do OBS e
/// devolve (quadros de vídeo prontos, quadros de áudio). Áudio vazio → o laço usa silêncio.
/// A live saudável segue em cópia pura — este custo é só no setup, não em runtime.
fn build_slate_media(
    app: &AppHandle,
    ffmpeg: &std::path::Path,
    slate: &Slate,
    obs: &SpsInfo,
    spec: &SlateMediaSpec,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    match slate {
        Slate::Still(still) => {
            let frames = build_slate_still(app, ffmpeg, still, spec.width, spec.height, obs)?;
            Some((frames, Vec::new())) // imagem = sem áudio → silêncio no laço
        }
        Slate::Video { path, has_audio } => build_slate_video(
            app,
            ffmpeg,
            path,
            *has_audio,
            obs,
            spec.sample_rate,
            spec.channels,
        ),
    }
}

/// Encoda a IMAGEM do slate, na resolução/perfil do OBS (SPS/PPS reafirmado in-band em cada IDR).
fn build_slate_still(
    app: &AppHandle,
    ffmpeg: &std::path::Path,
    still: &[u8],
    spec_w: u32,
    spec_h: u32,
    obs: &SpsInfo,
) -> Option<Vec<SlateFrame>> {
    let profile = map_profile(obs.profile_idc)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let src = dir.join("slate_src.yuv");
    let out = dir.join("slate.flv");
    std::fs::write(&src, still).ok()?;
    let gop = (SLATE_FPS * 2).to_string();
    let status = base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "yuv420p",
            "-s",
            &format!("{spec_w}x{spec_h}"),
            "-framerate",
            &SLATE_FPS.to_string(),
            "-stream_loop",
            "-1",
            "-i",
            &src.to_string_lossy(),
            "-t",
            "2",
            "-vf",
            &format!("scale={}:{}", obs.width, obs.height),
            "-c:v",
            "libx264",
            "-profile:v",
            profile,
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-x264-params",
            &format!("keyint={gop}:min-keyint={gop}:scenecut=0"),
            "-bf",
            "0",
            "-an",
            "-f",
            "flv",
            &out.to_string_lossy(),
        ])
        .stdin(Stdio::null()) // sem `-y` + stdin herdado, um arquivo temporário residual faria
        .stdout(Stdio::null()) // o ffmpeg pedir "Overwrite? [y/N]" e travar/falhar o setup.
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let flv = std::fs::read(&out).ok()?;
    let (frames, _audio) = extract_slate_media(&flv)?;
    let _ = std::fs::remove_file(&src);
    let _ = std::fs::remove_file(&out);
    Some(frames)
}

/// Transcoda o VÍDEO do slate (capado em `SLATE_VIDEO_MAX_SEC`) pro perfil/resolução do OBS e o
/// áudio pro ASC do OBS (AAC-LC, mesma taxa/canais). Devolve os quadros de vídeo (IDR com SPS/PPS
/// in-band) + os quadros de áudio, prontos pra dar loop. `-bf 0` mantém CTS=0 (loop limpo).
fn build_slate_video(
    app: &AppHandle,
    ffmpeg: &std::path::Path,
    path: &str,
    has_audio: bool,
    obs: &SpsInfo,
    sr: u32,
    ch: u8,
) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let profile = map_profile(obs.profile_idc)?;
    let dir = app.path().app_config_dir().ok()?.join("splice-tmp");
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join("slate_vid.flv");
    let gop = (SLATE_FPS * 2).to_string();
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-i".into(),
        path.into(),
        "-t".into(),
        SLATE_VIDEO_MAX_SEC.to_string(),
        "-vf".into(),
        format!("scale={}:{},fps={}", obs.width, obs.height, SLATE_FPS),
        "-c:v".into(),
        "libx264".into(),
        "-profile:v".into(),
        profile.into(),
        "-preset".into(),
        "veryfast".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-x264-params".into(),
        format!("keyint={gop}:min-keyint={gop}:scenecut=0"),
        "-bf".into(),
        "0".into(),
    ];
    if has_audio {
        // conforma a trilha ao ASC do OBS (mesma taxa/canais, AAC-LC) — decodifica sob o ASC out-of-band.
        args.extend(
            [
                "-c:a",
                "aac",
                "-ar",
                &sr.to_string(),
                "-ac",
                &ch.to_string(),
                "-b:a",
                "160k",
            ]
            .map(String::from),
        );
    } else {
        args.push("-an".into());
    }
    args.extend(["-f".into(), "flv".into(), out.to_string_lossy().to_string()]);
    let status = base_cmd(ffmpeg)
        .args(&args)
        .stdin(Stdio::null()) // ver build_slate_still: sem isto, temp residual trava o setup
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let flv = std::fs::read(&out).ok()?;
    let media = extract_slate_media(&flv)?;
    let _ = std::fs::remove_file(&out);
    Some(media)
}

/// Extrai do FLV do slate os quadros de VÍDEO (IDR com SPS/PPS in-band — reafirmação mesmo-id) e
/// os quadros de ÁUDIO (AAC cru, sem o seq header). Áudio vazio = slate sem trilha.
fn extract_slate_media(flv: &[u8]) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let mut r = flv;
    read_flv_header(&mut r).ok()?;
    let mut avcc: Option<AvcC> = None;
    let mut frames = Vec::new();
    let mut audio = Vec::new();
    while let Ok(Some(tag)) = read_tag(&mut r) {
        if tag.tag_type == 8 {
            if !tag_is_audio_seqhdr(&tag.data) {
                audio.push(tag.data); // AAC cru já conformado (0xAF 0x01 + AU)
            }
            continue;
        }
        if tag.tag_type != 9 {
            continue;
        }
        if tag_is_video_seqhdr(&tag.data) {
            avcc = parse_avcc(&tag.data[5..]);
            continue;
        }
        let Some(cfg) = &avcc else { continue };
        let is_key = tag_is_idr(&tag.data, cfg.length_size);
        let data = if is_key {
            // prefixa o SPS/PPS do slate ANTES dos NALUs do IDR (dentro do payload AVCC)
            let mut d = tag.data[..5].to_vec();
            d.extend_from_slice(&prefix_param_sets(&cfg.sps, &cfg.pps, cfg.length_size));
            d.extend_from_slice(&tag.data[5..]);
            d
        } else {
            tag.data.clone()
        };
        frames.push(SlateFrame {
            keyframe: is_key,
            data,
        });
    }
    if frames.is_empty() || avcc.is_none() {
        return None;
    }
    // Descarta o 1º quadro de áudio (priming/warm-up do encoder AAC) — mesmo motivo do
    // build_silence: dá um loop mais limpo. Só se houver mais de um (não esvazia trilha curta).
    if audio.len() > 1 {
        audio.remove(0);
    }
    Some((frames, audio))
}

/// Gera UM quadro AAC de silêncio (corpo do tag: 0xAF 0x01 + AU), na taxa/canais do OBS.
fn build_silence(app: &AppHandle, ffmpeg: &std::path::Path, sr: u32, ch: u8) -> Vec<u8> {
    let fallback = |ch: u8| -> Vec<u8> {
        // AU de silêncio AAC-LC, independente de taxa (do de-risk): estéreo / mono.
        let mut v = vec![0xAF, 0x01];
        if ch >= 2 {
            v.extend_from_slice(&[0x21, 0x10, 0x04, 0x60, 0x8C, 0x1C]);
        } else {
            v.extend_from_slice(&[0x01, 0x18, 0x20, 0x07]);
        }
        v
    };
    let Some(dir) = app
        .path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("splice-tmp"))
    else {
        return fallback(ch);
    };
    let _ = std::fs::create_dir_all(&dir);
    let out = dir.join("silence.flv");
    let cl = if ch >= 2 { "stereo" } else { "mono" };
    let ok = base_cmd(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            &format!("anullsrc=r={sr}:cl={cl}"),
            "-t",
            "1",
            "-c:a",
            "aac",
            "-ar",
            &sr.to_string(),
            "-ac",
            &ch.to_string(),
            "-b:a",
            "160k",
            "-f",
            "flv",
            &out.to_string_lossy(),
        ])
        .stdin(Stdio::null()) // ver build_slate_still: sem isto, temp residual trava o setup
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        return fallback(ch);
    }
    let Ok(flv) = std::fs::read(&out) else {
        return fallback(ch);
    };
    let _ = std::fs::remove_file(&out);
    let mut r = &flv[..];
    if read_flv_header(&mut r).is_err() {
        return fallback(ch);
    }
    // pula o ASC (aacpt==0) E o 1º quadro (priming "Lavc") — pega um quadro estável.
    let mut audio_frames = Vec::new();
    while let Ok(Some(tag)) = read_tag(&mut r) {
        if tag.tag_type == 8 && !tag_is_audio_seqhdr(&tag.data) {
            audio_frames.push(tag.data);
        }
    }
    audio_frames
        .into_iter()
        .nth(1)
        .unwrap_or_else(|| fallback(ch))
}

// ----------------------------- state machine -----------------------------

#[derive(Clone, Copy, PartialEq, Debug)]
enum State {
    Copy,
    Slate,
    HoldIncompat,
}

/// Estado do relógio de saída (uma linha do tempo monotônica pra toda a sessão).
struct Clock {
    out_dts: u32,     // último DTS de vídeo emitido (monotônico)
    out_pts_hwm: u32, // marca d'água do PTS de vídeo (por causa dos B-frames do OBS)
    a_idx: u64,       // total de quadros de áudio emitidos (real ou silêncio)
    sr: u32,          // taxa do áudio do OBS
    frame_dt: u32,    // delta típico entre DTS de vídeo (ms), pra pontes de segmento
    started: bool,    // já emitimos o 1º quadro?
}
impl Clock {
    fn new(sr: u32, fps: u32) -> Self {
        Clock {
            out_dts: 0,
            out_pts_hwm: 0,
            a_idx: 0,
            sr: sr.max(8000),
            frame_dt: (1000 / fps.clamp(1, 240)).max(1),
            started: false,
        }
    }
    /// Timestamp do próximo quadro de áudio (drift-free: conta de quadros × 1024 / taxa).
    fn audio_ts(&self) -> u32 {
        ((self.a_idx.wrapping_mul(1024).wrapping_mul(1000)) / self.sr as u64) as u32
    }
}

/// Uma operação de escrita pro ffmpeg de saída.
struct WriteOp {
    tag_type: u8,
    ts: u32,
    data: Vec<u8>,
}

/// Escreve uma leva de ops no ffmpeg de saída. `false` = pipe quebrado (saída morreu).
fn write_ops<W: Write>(w: &mut W, ops: &[WriteOp]) -> bool {
    for op in ops {
        if write_tag(w, op.tag_type, op.ts, &op.data).is_err() {
            return false;
        }
    }
    true
}

// ----------------------------- run -----------------------------

enum SetupOutcome {
    /// O splicer não estabeleceu ANTES de publicar — cai pro compositor com os mesmos opts.
    Fallback(CompositorOpts),
    Done,
}

/// Roda o splicer enquanto a transmissão estiver no ar. Espelha compositor::run.
pub async fn run(
    app: AppHandle,
    running: Arc<AtomicBool>,
    has_signal: Arc<AtomicBool>,
    slate_on: Arc<AtomicBool>,
    opts: CompositorOpts,
) {
    let (app_c, run_c, sig_c, slate_c) = (
        app.clone(),
        running.clone(),
        has_signal.clone(),
        slate_on.clone(),
    );
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        setup_and_pump(&app_c, &run_c, &sig_c, &slate_c, opts)
    })
    .await
    .unwrap_or(SetupOutcome::Done);
    // Fallback SÓ é alcançável na fase de setup (antes do 1º publish) — aqui é seguro delegar.
    if let SetupOutcome::Fallback(opts) = outcome {
        log::warn!("splicer: não estabeleceu — caindo pro compositor (comportamento de hoje)");
        crate::compositor::run(app, running, has_signal, slate_on, opts).await;
    }
    // slate_on já foi zerado no teardown do pump (ou pelo compositor no ramo de fallback).
}

fn setup_and_pump(
    app: &AppHandle,
    running: &Arc<AtomicBool>,
    has_signal: &Arc<AtomicBool>,
    slate_on: &Arc<AtomicBool>,
    opts: CompositorOpts,
) -> SetupOutcome {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("splicer: sidecar ffmpeg não encontrado");
        return SetupOutcome::Fallback(opts);
    };
    let cfg = crate::config::load(app);
    let ingest = engine::ingest_url(&cfg);
    let program = engine::program_url(&cfg);

    // 1) Espera o OBS PUBLICAR (sem prazo — igual compositor.rs:455). Só então conta os 8s.
    while !has_signal.load(Ordering::Relaxed) {
        if !running.load(Ordering::Relaxed) {
            return SetupOutcome::Done;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    // 2) Sobe o ffmpeg de entrada e captura avcC + ASC (portões) dentro do prazo.
    let mut gen: u64 = 0;
    let mut in_child = match spawn_input(&ffmpeg, &ingest) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: ffmpeg de entrada não subiu: {e}");
            return SetupOutcome::Fallback(opts);
        }
    };
    let (mut rx, reader) = spawn_reader(&mut in_child, gen);

    let mut avcc: Option<AvcC> = None;
    let mut asc: Option<Asc> = None;
    let mut pending: VecDeque<FlvTag> = VecDeque::new(); // tags de vídeo/áudio antes do 1º IDR
    let deadline = Instant::now() + Duration::from_millis(SETUP_DEADLINE_MS);
    while avcc.is_none() || asc.is_none() {
        if !running.load(Ordering::Relaxed) {
            kill(&mut in_child);
            drain_and_join(&rx, Some(reader));
            return SetupOutcome::Done;
        }
        if Instant::now() > deadline {
            // Sem áudio? Sintetiza ASC 48k estéreo e segue (a plataforma exige trilha).
            if avcc.is_some() && asc.is_none() {
                asc = Some(Asc {
                    bytes: vec![0xAF, 0x00, 0x11, 0x90, 0x56, 0xE5, 0x00],
                    sample_rate: 48000,
                    channels: 2,
                    object_type: 2,
                });
                break;
            }
            log::warn!(
                "splicer: não achei o sequence header do OBS em {SETUP_DEADLINE_MS}ms — fallback"
            );
            kill(&mut in_child);
            drain_and_join(&rx, Some(reader));
            return SetupOutcome::Fallback(opts);
        }
        match rx.try_recv() {
            Ok((_, tag)) => {
                if tag.tag_type == 9 && tag_is_video_seqhdr(&tag.data) {
                    avcc = parse_avcc(&tag.data[5..]);
                    if avcc.is_none() {
                        return fail_setup(&mut in_child, &rx, reader, opts, "avcC ilegível");
                    }
                } else if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
                    asc = parse_asc(&tag.data);
                    if asc.is_none() {
                        return fail_setup(&mut in_child, &rx, reader, opts, "ASC ilegível");
                    }
                } else if (tag.tag_type == 9 || tag.tag_type == 8) && pending.len() < 512 {
                    pending.push_back(tag);
                }
            }
            Err(TryRecvError::Empty) => std::thread::sleep(Duration::from_millis(20)),
            Err(TryRecvError::Disconnected) => {
                return fail_setup(
                    &mut in_child,
                    &rx,
                    reader,
                    opts,
                    "OBS caiu antes do sequence header",
                );
            }
        }
    }
    let avcc = avcc.unwrap();
    let asc = asc.unwrap();

    // 3) PORTÕES (do de-risk): só H.264 8-bit 4:2:0 progressivo, perfil {baseline,main,high}.
    let i = &avcc.info;
    let gate_ok = i.chroma_format_idc == 1
        && i.frame_mbs_only == 1
        && avcc.length_size == 4
        && i.bit_depth_luma_minus8 == 0
        && i.bit_depth_chroma_minus8 == 0
        && map_profile(i.profile_idc).is_some()
        && i.width > 0
        && i.height > 0
        && asc.object_type == 2; // só AAC-LC (o silêncio gerado é LC); HE/SBR cai pro compositor
    if !gate_ok {
        return fail_setup(
            &mut in_child,
            &rx,
            reader,
            opts,
            "config do OBS fora do escopo do splicer (perfil/bit-depth/chroma)",
        );
    }

    // 4) Prepara o slate (imagem OU vídeo) na resolução/ASC do OBS + o silêncio de reserva.
    let (slate, slate_audio) = match build_slate_media(
        app,
        &ffmpeg,
        &opts.slate,
        &avcc.info,
        &SlateMediaSpec {
            width: opts.spec.w,
            height: opts.spec.h,
            sample_rate: asc.sample_rate,
            channels: asc.channels,
        },
    ) {
        Some(m) => m,
        None => return fail_setup(&mut in_child, &rx, reader, opts, "preparo do slate falhou"),
    };
    // silêncio: usado quando o slate é imagem OU vídeo sem trilha de áudio.
    let silence = build_silence(app, &ffmpeg, asc.sample_rate, asc.channels);
    if matches!(opts.slate, Slate::Video { .. }) {
        log::info!(
            "splicer: slate de vídeo pronto — {} quadros, {} de áudio (loop, cap {}s)",
            slate.len(),
            slate_audio.len(),
            SLATE_VIDEO_MAX_SEC
        );
    }

    // 5) Sobe o ffmpeg de SAÍDA (o publisher do _program) e emite o preâmbulo + seq headers.
    let mut out_child = match spawn_output(&ffmpeg, &program) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: ffmpeg de saída não subiu: {e}");
            return fail_setup(
                &mut in_child,
                &rx,
                reader,
                opts,
                "ffmpeg de saída não subiu",
            );
        }
    };
    let mut out_stdin = out_child.stdin.take().expect("output ffmpeg sem stdin");
    // Vigia: um write travado no stdin não vê o running — quando cai, mata o publisher.
    let gen_done = Arc::new(AtomicBool::new(false));
    spawn_output_watchdog(running.clone(), gen_done.clone(), out_child.id());

    if write_preamble(&mut out_stdin).is_err()
        || write_tag(&mut out_stdin, 9, 0, &seqhdr_video(&avcc)).is_err()
        || write_tag(&mut out_stdin, 8, 0, &asc.bytes).is_err()
    {
        gen_done.store(true, Ordering::Relaxed);
        kill(&mut out_child);
        return fail_setup(
            &mut in_child,
            &rx,
            reader,
            opts,
            "não consegui publicar o _program",
        );
    }

    log::info!(
        "splicer: estabelecido — {}x{} perfil={} {}Hz/{}ch — copiando o OBS pro _program (zero re-encode)",
        avcc.info.width, avcc.info.height, avcc.info.profile_idc, asc.sample_rate, asc.channels
    );

    // ---- daqui pra frente NÃO tem mais fallback: qualquer problema vira "segura no slate" ----
    // A leitora vira Option: num respawn que falha ela fica None até a próxima tentativa (sem
    // "use após move").
    let mut reader = Some(reader);
    let mut clock = Clock::new(asc.sample_rate, opts.spec.fps.max(SLATE_FPS));
    let mut state = State::Slate; // começa no slate até o 1º IDR real entrar
    let mut slate_i = 0usize; // índice do quadro de VÍDEO do slate (loop)
    let mut slate_a_i = 0usize; // índice do quadro de ÁUDIO do slate (loop, quando há trilha)
    let mut slate_epoch: Option<Instant> = None;
    let mut slate_base_dts: u32 = 0;
    let mut slate_n: u32 = 0; // quadros de slate desde a entrada (grade fracionária, sem drift)
    let mut last_video_at = Instant::now();
    let mut input_alive = true;
    let mut last_respawn = Instant::now();
    let mut need_copy_epoch = true; // recomputar v_epoch ao (re)entrar em Copy
    let mut v_epoch: i64 = 0;
    let mut primed = false; // só emite slate depois da 1ª cópia (não abrir a live no JÁ VOLTO)
    let mut video_ok = true; // compat semântica do último seq header de vídeo/áudio (por respawn)
    let mut audio_ok = true;

    // Reinjeta os tags que chegaram antes do 1º IDR? Não — começamos no slate e só entramos em
    // Copy num IDR real; esses tags pendentes (pré-IDR) são descartados de propósito.
    pending.clear();

    loop {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        let forced = opts.force_slate.load(Ordering::Relaxed);
        let mut ops: Vec<WriteOp> = Vec::new();

        // ---- drena a entrada (não bloqueante) ----
        let mut got_disconnect = false;
        loop {
            match rx.try_recv() {
                Ok((g, tag)) => {
                    if g != gen {
                        continue; // tag de uma geração antiga (respawn) — ignora
                    }
                    handle_input_tag(
                        tag,
                        forced,
                        &avcc,
                        &asc,
                        &mut video_ok,
                        &mut audio_ok,
                        &mut state,
                        &mut clock,
                        &mut need_copy_epoch,
                        &mut v_epoch,
                        &mut last_video_at,
                        &mut ops,
                    );
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    got_disconnect = true;
                    break;
                }
            }
        }

        // "primed" libera a emissão do slate. Marca na 1ª cópia OU num force_brb explícito (abrir
        // a live já no JÁ VOLTO) — senão o slate nunca sairia e o _program ficaria mudo/parado.
        if state == State::Copy || forced {
            primed = true;
        }

        // ---- decide entrar no slate (gap ou forçado) ----
        let gap = got_disconnect
            || (state == State::Copy && last_video_at.elapsed() > Duration::from_millis(HOLD_MS));
        if state == State::Copy && (gap || forced) {
            state = State::Slate;
        }
        if got_disconnect {
            input_alive = false;
        }

        // ---- emite o slate/silêncio (só depois de "primed" = já teve cópia), por relógio ----
        let showing_slate = matches!(state, State::Slate | State::HoldIncompat) && primed;
        if showing_slate {
            if slate_epoch.is_none() {
                slate_epoch = Some(Instant::now());
                slate_base_dts = clock.out_dts;
                slate_n = 0;
                slate_i = 0; // SEMPRE recomeça no IDR do slate (índice 0) — senão entra num
                             // P-frame cujas referências não foram emitidas → JÁ VOLTO corrompido.
                slate_a_i = 0; // áudio do slate recomeça junto (vídeo e trilha alinhados no topo)
            }
            let elapsed = slate_epoch.unwrap().elapsed().as_millis() as u32;
            let target = slate_base_dts.wrapping_add(elapsed);
            let mut emitted = 0u32;
            while clock.out_dts < target && emitted < SLATE_CATCHUP_CAP && !slate.is_empty() {
                // Vídeo deu a volta (voltou ao IDR do índice 0) → reinicia a trilha junto, pra
                // A/V não derivarem (os dois loops têm períodos quase iguais, mas não idênticos).
                if slate_i != 0 && slate_i % slate.len() == 0 {
                    slate_a_i = 0;
                }
                let frame = &slate[slate_i % slate.len()];
                slate_i += 1;
                slate_n += 1;
                // grade FRACIONÁRIA de 30fps (33.33ms, não 33) — senão o DTS deriva num JÁ VOLTO
                // longo e colide/afasta do relógio real.
                let dts = slate_base_dts
                    .wrapping_add(((slate_n as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
                clock.out_dts = dts;
                clock.out_pts_hwm = clock.out_pts_hwm.max(dts);
                clock.started = true;
                ops.push(WriteOp {
                    tag_type: 9,
                    ts: dts,
                    data: frame.data.clone(),
                });
                // áudio até alcançar o vídeo: a trilha do slate-vídeo (em loop) ou silêncio.
                while clock.audio_ts() < dts {
                    let audio = if slate_audio.is_empty() {
                        silence.clone()
                    } else {
                        let a = slate_audio[slate_a_i % slate_audio.len()].clone();
                        slate_a_i += 1;
                        a
                    };
                    ops.push(WriteOp {
                        tag_type: 8,
                        ts: clock.audio_ts(),
                        data: audio,
                    });
                    clock.a_idx += 1;
                }
                emitted += 1;
                let _ = frame.keyframe;
            }
        } else {
            slate_epoch = None;
        }
        slate_on.store(showing_slate, Ordering::Relaxed);

        // ---- escreve tudo; falha de escrita = ffmpeg de saída morreu ----
        if !write_ops(&mut out_stdin, &ops) {
            log::error!("splicer: ffmpeg de saída caiu (pipe quebrado) — encerrando o splicer");
            break;
        }

        // ---- respawn da entrada quando o OBS voltar ----
        if !input_alive
            && has_signal.load(Ordering::Relaxed)
            && last_respawn.elapsed() >= Duration::from_millis(RESPAWN_MS)
        {
            last_respawn = Instant::now();
            // fecha a geração antiga: mata o ffmpeg, junta a thread, bumpa a geração.
            kill(&mut in_child);
            drain_and_join(&rx, reader.take());
            match spawn_input(&ffmpeg, &ingest) {
                Ok(mut c) => {
                    gen += 1;
                    let (nrx, nreader) = spawn_reader(&mut c, gen);
                    in_child = c;
                    rx = nrx;
                    reader = Some(nreader);
                    input_alive = true;
                    need_copy_epoch = true;
                    // avcC novo será checado quando o novo seq header chegar (handle_input_tag).
                }
                Err(e) => log::warn!("splicer: respawn da entrada falhou: {e}"),
            }
        }

        std::thread::sleep(Duration::from_millis(4));
    }

    // teardown — mata a SAÍDA antes de juntar a leitora (reap garantido do publisher) e drena o
    // canal pra desbloquear um send parado (senão o join trava quando o pipe de saída engasgou).
    gen_done.store(true, Ordering::Relaxed);
    kill(&mut in_child);
    kill(&mut out_child);
    drain_and_join(&rx, reader.take());
    slate_on.store(false, Ordering::Relaxed);
    log::info!("splicer: encerrado");
    SetupOutcome::Done
}

/// Trata um tag vindo do OBS conforme o estado atual. Empurra WriteOps prontos.
#[allow(clippy::too_many_arguments)]
fn handle_input_tag(
    tag: FlvTag,
    forced: bool,
    avcc: &AvcC,
    asc: &Asc,
    video_ok: &mut bool,
    audio_ok: &mut bool,
    state: &mut State,
    clock: &mut Clock,
    need_copy_epoch: &mut bool,
    v_epoch: &mut i64,
    last_video_at: &mut Instant,
    ops: &mut Vec<WriteOp>,
) {
    // Sequence header novo (respawn): compara semanticamente. Igual → segue (retoma no IDR);
    // diferente → segura no slate (o ffmpeg de saída tem o extradata TRAVADO no avcC original,
    // então não dá pra injetar um novo — e delegar pro compositor mataria o publisher).
    if tag.tag_type == 9 && tag_is_video_seqhdr(&tag.data) {
        if let Some(new) = parse_avcc(&tag.data[5..]) {
            *video_ok = new.info.semantically_eq(&avcc.info);
            if !*video_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS mudou o vídeo ({}x{}→{}x{}) — segurando no JÁ VOLTO",
                        avcc.info.width,
                        avcc.info.height,
                        new.info.width,
                        new.info.height
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *audio_ok {
                log::info!("splicer: OBS voltou à config compatível — retomando no próximo IDR");
                *state = State::Slate; // só sai do hold quando VÍDEO E ÁUDIO batem
            }
        }
        return;
    }
    if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
        // ASC reemitido (respawn): SIMÉTRICO ao vídeo — o extradata de saída está travado no ASC
        // original. Só sai do HoldIncompat quando ambos batem, independente da ordem de chegada
        // dos dois seq headers (senão uma corrida deixava o áudio incompatível voltar pra cópia).
        if let Some(new) = parse_asc(&tag.data) {
            *audio_ok = new.semantically_eq(asc);
            if !*audio_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS mudou o áudio ({}Hz/{}ch→{}Hz/{}ch) — segurando no JÁ VOLTO",
                        asc.sample_rate,
                        asc.channels,
                        new.sample_rate,
                        new.channels
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *video_ok {
                log::info!("splicer: OBS voltou à config compatível — retomando no próximo IDR");
                *state = State::Slate;
            }
        }
        return;
    }

    match *state {
        State::HoldIncompat => {
            // segura no slate; descarta os quadros do OBS incompatível. (Reentra em Copy só se o
            // OBS voltar com params semanticamente iguais — tratado no ramo de seq header acima,
            // que sai do HoldIncompat quando new == avcc… mas como o avcc de referência não muda,
            // a saída acontece quando o seq header volta a bater: aqui não fazemos nada.)
        }
        State::Slate => {
            if tag.tag_type == 9 && !forced && tag_is_idr(&tag.data, avcc.length_size) {
                // RESUME: reafirma o SPS/PPS do OBS antes do IDR e volta pra cópia.
                emit_resume_idr(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                *state = State::Copy;
                *last_video_at = Instant::now();
            }
            // qualquer outro tag durante o slate é descartado (emitimos slate+silêncio no laço).
        }
        State::Copy => {
            if forced {
                // força do usuário no meio da cópia: vai pro slate (mic mudo) no próximo laço.
                *state = State::Slate;
                return;
            }
            match tag.tag_type {
                9 => {
                    emit_copy_video(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                    *last_video_at = Instant::now();
                }
                8 => {
                    // áudio real do OBS, retimado pela contagem (drift-free).
                    let ts = clock.audio_ts();
                    ops.push(WriteOp {
                        tag_type: 8,
                        ts,
                        data: tag.data,
                    });
                    clock.a_idx += 1;
                }
                _ => {}
            }
        }
    }
}

/// Emite um quadro de vídeo em cópia (só reescreve o DTS pra linha do tempo contínua).
fn emit_copy_video(
    tag: &FlvTag,
    _avcc: &AvcC,
    clock: &mut Clock,
    need_epoch: &mut bool,
    v_epoch: &mut i64,
    ops: &mut Vec<WriteOp>,
) {
    if *need_epoch {
        // ponte: o novo ffmpeg reinicia o ts do OBS perto de 0.
        *v_epoch = if clock.started {
            (clock.out_dts as i64 + clock.frame_dt as i64) - tag.ts as i64
        } else {
            -(tag.ts as i64)
        };
        *need_epoch = false;
    }
    let mut dts = (tag.ts as i64).wrapping_add(*v_epoch).max(0) as u32;
    if clock.started && dts <= clock.out_dts {
        dts = clock.out_dts.wrapping_add(1);
    }
    let cts = read_cts(&tag.data);
    clock.out_dts = dts;
    clock.out_pts_hwm = clock.out_pts_hwm.max(dts.wrapping_add(cts as u32));
    clock.started = true;
    ops.push(WriteOp {
        tag_type: 9,
        ts: dts,
        data: tag.data.clone(),
    });
}

/// Emite o IDR de retorno do OBS com o SPS/PPS do OBS reafirmado in-band.
fn emit_resume_idr(
    tag: &FlvTag,
    avcc: &AvcC,
    clock: &mut Clock,
    need_epoch: &mut bool,
    v_epoch: &mut i64,
    ops: &mut Vec<WriteOp>,
) {
    *need_epoch = false;
    *v_epoch = if clock.started {
        (clock.out_dts as i64 + clock.frame_dt as i64) - tag.ts as i64
    } else {
        -(tag.ts as i64)
    };
    let mut dts = (tag.ts as i64).wrapping_add(*v_epoch).max(0) as u32;
    if clock.started && dts <= clock.out_dts {
        dts = clock.out_dts.wrapping_add(1);
    }
    let cts = read_cts(&tag.data);
    // reafirma o SPS/PPS do OBS antes dos NALUs do IDR (dentro do payload AVCC)
    let mut data = tag.data[..5].to_vec();
    data.extend_from_slice(&prefix_param_sets(&avcc.sps, &avcc.pps, avcc.length_size));
    data.extend_from_slice(&tag.data[5..]);
    clock.out_dts = dts;
    clock.out_pts_hwm = clock.out_pts_hwm.max(dts.wrapping_add(cts as u32));
    clock.started = true;
    ops.push(WriteOp {
        tag_type: 9,
        ts: dts,
        data,
    });
}

/// CompositionTime (24 bits com sinal) dos bytes 2..5 do tag de vídeo AVC.
fn read_cts(data: &[u8]) -> i32 {
    if data.len() < 5 {
        return 0;
    }
    let raw = ((data[2] as i32) << 16) | ((data[3] as i32) << 8) | (data[4] as i32);
    if raw & 0x80_0000 != 0 {
        raw | !0xFF_FFFF // estende o sinal
    } else {
        raw
    }
}

/// Monta o corpo do tag de sequence header de vídeo (0x17 0x00 CTS=0 + avcC verbatim).
fn seqhdr_video(avcc: &AvcC) -> Vec<u8> {
    // reemite o avcC ORIGINAL do OBS verbatim (byte-exato) — nada de reconstruir/adivinhar o
    // profile_compatibility ou a cauda de chroma/bit-depth do High.
    let mut v = vec![0x17, 0x00, 0x00, 0x00, 0x00]; // frame key+AVC, seqhdr, CTS=0
    v.extend_from_slice(&avcc.raw);
    v
}

fn fail_setup(
    in_child: &mut Child,
    rx: &Receiver<(u64, FlvTag)>,
    reader: std::thread::JoinHandle<()>,
    opts: CompositorOpts,
    why: &str,
) -> SetupOutcome {
    log::warn!("splicer: setup falhou ({why}) — fallback pro compositor");
    kill(in_child);
    drain_and_join(rx, Some(reader)); // pode ter enchido o canal durante o build lento do slate
    SetupOutcome::Fallback(opts)
}

/// Vigia do ffmpeg de saída: quando running cai (ou o gen encerra), garante que o publisher morre.
fn spawn_output_watchdog(running: Arc<AtomicBool>, gen_done: Arc<AtomicBool>, pid: u32) {
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) && !gen_done.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(200));
        }
        std::thread::sleep(Duration::from_millis(1200)); // chance do teardown normal
        if !gen_done.load(Ordering::Relaxed) {
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
    });
}

// ----------------------------- testes -----------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// avcC real do OBS (do de-risk): 1080p high, 1 SPS + 1 PPS.
    fn sample_avcc() -> Vec<u8> {
        // 01 42c01f ff e1 0017 <sps> 01 0004 <pps>
        let sps = [
            0x67, 0x42, 0xc0, 0x1f, 0xda, 0x01, 0x40, 0x16, 0xe8, 0x06, 0xd0, 0xa1, 0x35,
        ];
        let pps = [0x68, 0xce, 0x3c, 0x80];
        let mut v = vec![0x01, 0x42, 0xc0, 0x1f, 0xff, 0xe1];
        v.extend_from_slice(&(sps.len() as u16).to_be_bytes());
        v.extend_from_slice(&sps);
        v.push(0x01);
        v.extend_from_slice(&(pps.len() as u16).to_be_bytes());
        v.extend_from_slice(&pps);
        v
    }

    #[test]
    fn flv_ts_roundtrip_past_24bit() {
        let mut buf = Vec::new();
        let ts = 20_000_000u32; // > 16.7M (precisa do ts_ext)
        write_tag(&mut buf, 9, ts, &[0x17, 0x01, 0, 0, 0, 0xAA]).unwrap();
        let mut r = &buf[..];
        let tag = read_tag(&mut r).unwrap().unwrap();
        assert_eq!(tag.ts, ts);
        assert_eq!(tag.tag_type, 9);
        assert_eq!(tag.data.last(), Some(&0xAA));
    }

    #[test]
    fn parse_avcc_caches_all_sets() {
        let a = parse_avcc(&sample_avcc()).expect("avcC parseável");
        assert_eq!(a.sps.len(), 1);
        assert_eq!(a.pps.len(), 1);
        assert_eq!(a.length_size, 4);
        assert_eq!(a.info.profile_idc, 66); // 0x42 = 66 (baseline) neste header sintético
        assert_eq!(a.info.chroma_format_idc, 1);
        assert_eq!(a.info.frame_mbs_only, 1);
    }

    #[test]
    fn seqhdr_roundtrips_through_parse() {
        let a = parse_avcc(&sample_avcc()).unwrap();
        let hdr = seqhdr_video(&a);
        assert_eq!(&hdr[0..2], &[0x17, 0x00]);
        let a2 = parse_avcc(&hdr[5..]).expect("reparse do seqhdr");
        assert!(a2.info.semantically_eq(&a.info));
        assert_eq!(a2.sps, a.sps);
        assert_eq!(a2.pps, a.pps);
    }

    #[test]
    fn asc_parse_48k_stereo() {
        let a = parse_asc(&[0xAF, 0x00, 0x11, 0x90, 0x56, 0xE5, 0x00]).unwrap();
        assert_eq!(a.sample_rate, 48000);
        assert_eq!(a.channels, 2);
        assert_eq!(a.object_type, 2);
    }

    #[test]
    fn semantic_eq_ignores_vui_bytes() {
        let a = SpsInfo {
            width: 1920,
            height: 1080,
            profile_idc: 100,
            level_idc: 42,
            chroma_format_idc: 1,
            frame_mbs_only: 1,
            bit_depth_luma_minus8: 0,
            bit_depth_chroma_minus8: 0,
            log2_max_frame_num: 4,
            pic_order_cnt_type: 0,
            log2_max_pic_order_cnt_lsb: 4,
        };
        let mut b = a.clone();
        assert!(a.semantically_eq(&b));
        b.height = 720;
        assert!(!a.semantically_eq(&b));
        // geometria do slice header (frame_num/POC) também conta — folda o achado do review:
        // um respawn com essa geometria diferente deve virar HoldIncompat, não retomar a cópia.
        let mut c = a.clone();
        c.log2_max_frame_num += 1;
        assert!(!a.semantically_eq(&c));
        let mut d = a.clone();
        d.pic_order_cnt_type = 2;
        assert!(!a.semantically_eq(&d));
    }

    #[test]
    fn idr_detection_bounds_checked() {
        // tag de vídeo AVC NALU com um NAL tipo 5 (IDR), length_size=4
        let mut data = vec![0x17, 0x01, 0, 0, 0];
        let nal = [0x65u8, 0x88, 0x84]; // type 5
        data.extend_from_slice(&(nal.len() as u32).to_be_bytes());
        data.extend_from_slice(&nal);
        assert!(tag_is_idr(&data, 4));
        // prefixo mentiroso (maior que o tag) não pode indexar fora
        let bad = vec![0x17, 0x01, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0x65];
        assert!(!tag_is_idr(&bad, 4));
    }

    #[test]
    fn audio_ts_is_drift_free() {
        let mut c = Clock::new(48000, 30);
        // 48 quadros de 1024 amostras a 48kHz = 1024*48/48000*1000 = 1024ms
        for _ in 0..48 {
            c.a_idx += 1;
        }
        assert_eq!(c.audio_ts(), 1024);
    }

    #[test]
    fn each_nalu_rejects_oversized_prefix() {
        let payload = [0x00, 0x00, 0x00, 0xFF, 0x65]; // len=255 mas só há 1 byte
        assert!(each_nalu(&payload, 4).is_empty());
    }

    // -------- Layer 2: emenda ponta-a-ponta decodificada por ffmpeg de verdade --------
    // Roda com:  cargo test --lib splicer -- --ignored --nocapture   (precisa de ffmpeg+ffprobe no PATH)
    // Prova que a MINHA implementação da estratégia (avcC do OBS out-of-band; SPS/PPS do slate
    // in-band no IDR do slate; SPS/PPS do OBS reafirmado no IDR de retorno) decodifica SEM erro
    // atravessando OBS→slate→OBS, com DTS monotônico e um único sequence header.

    use std::process::Command as PCommand;

    fn ff(args: &[&str]) -> bool {
        PCommand::new("ffmpeg")
            .args(args)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    fn read_video_tags(flv: &[u8]) -> (AvcC, Vec<FlvTag>) {
        let mut r = flv;
        read_flv_header(&mut r).expect("cabeçalho FLV");
        let mut avcc = None;
        let mut tags = Vec::new();
        while let Ok(Some(t)) = read_tag(&mut r) {
            if t.tag_type != 9 {
                continue;
            }
            if tag_is_video_seqhdr(&t.data) {
                avcc = parse_avcc(&t.data[5..]);
            } else {
                tags.push(t);
            }
        }
        (avcc.expect("avcC no FLV do OBS"), tags)
    }

    #[test]
    #[ignore]
    fn e2e_splice_decodes_clean() {
        let dir = std::env::temp_dir().join("corneta-splice-e2e");
        let _ = std::fs::create_dir_all(&dir);
        let p = |n: &str| dir.join(n).to_string_lossy().to_string();
        let (obs, slate_png, slate_flv, out) =
            (p("obs.flv"), p("slate.png"), p("slate.flv"), p("out.flv"));

        // 1) "OBS": x264 high 720p30, keyint 60 (2s), sem áudio (o vídeo é a parte difícil).
        assert!(
            ff(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=1280x720:rate=30",
                "-t",
                "6",
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-preset",
                "veryfast",
                "-g",
                "60",
                "-keyint_min",
                "60",
                "-sc_threshold",
                "0",
                "-bf",
                "3",
                "-pix_fmt",
                "yuv420p",
                "-an",
                "-f",
                "flv",
                &obs
            ]),
            "gerar obs.flv (ffmpeg no PATH?)"
        );
        // 2) slate na MESMA resolução/perfil do OBS.
        assert!(ff(&[
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=teal:size=1280x720",
            "-frames:v",
            "1",
            &slate_png
        ]));
        assert!(ff(&[
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-loop",
            "1",
            "-i",
            &slate_png,
            "-t",
            "2",
            "-r",
            "30",
            "-s",
            "1280x720",
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-x264-params",
            "keyint=60:min-keyint=60:scenecut=0",
            "-bf",
            "0",
            "-an",
            "-f",
            "flv",
            &slate_flv
        ]));

        let obs_flv = std::fs::read(&obs).unwrap();
        let (avcc, obs_tags) = read_video_tags(&obs_flv);
        let (slate_frames, _) =
            extract_slate_media(&std::fs::read(&slate_flv).unwrap()).expect("slate frames");

        // índices dos IDR do OBS
        let idrs: Vec<usize> = obs_tags
            .iter()
            .enumerate()
            .filter(|(_, t)| tag_is_idr(&t.data, avcc.length_size))
            .map(|(i, _)| i)
            .collect();
        assert!(idrs.len() >= 2, "preciso de ao menos 2 keyframes no OBS");
        let cut = idrs[1]; // corta pro slate no início do 2º GOP; retoma no 3º IDR

        // 3) monta a saída com as MESMAS funções do runtime.
        let mut clock = Clock::new(48000, 30);
        let mut need_epoch = true;
        let mut v_epoch = 0i64;
        let mut ops: Vec<WriteOp> = Vec::new();

        // copia o 1º GOP do OBS
        for t in &obs_tags[..cut] {
            emit_copy_video(
                t,
                &avcc,
                &mut clock,
                &mut need_epoch,
                &mut v_epoch,
                &mut ops,
            );
        }
        // slate por ~2s (loopando o GOP do slate), DTS na grade fracionária de 30fps
        let slate_base = clock.out_dts;
        for i in 0..60u32 {
            let f = &slate_frames[(i as usize) % slate_frames.len()];
            let dts = slate_base
                .wrapping_add((((i + 1) as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
            clock.out_dts = dts;
            ops.push(WriteOp {
                tag_type: 9,
                ts: dts,
                data: f.data.clone(),
            });
        }
        // retoma no próximo IDR do OBS (reafirma SPS/PPS do OBS), copia o resto
        let resume = idrs.iter().copied().find(|&i| i > cut).unwrap_or(cut);
        need_epoch = true;
        emit_resume_idr(
            &obs_tags[resume],
            &avcc,
            &mut clock,
            &mut need_epoch,
            &mut v_epoch,
            &mut ops,
        );
        for t in &obs_tags[resume + 1..] {
            emit_copy_video(
                t,
                &avcc,
                &mut clock,
                &mut need_epoch,
                &mut v_epoch,
                &mut ops,
            );
        }

        // escreve o FLV de saída (preâmbulo + seq header do OBS + ops)
        let mut buf = Vec::new();
        write_preamble(&mut buf).unwrap();
        write_tag(&mut buf, 9, 0, &seqhdr_video(&avcc)).unwrap();
        assert!(write_ops(&mut buf, &ops));
        std::fs::write(&out, &buf).unwrap();

        // DTS estritamente monotônico?
        let mut prev: Option<u32> = None;
        {
            let mut r = &buf[..];
            read_flv_header(&mut r).unwrap();
            let mut seqhdrs = 0;
            while let Ok(Some(t)) = read_tag(&mut r) {
                if t.tag_type == 9 && tag_is_video_seqhdr(&t.data) {
                    seqhdrs += 1;
                    continue;
                }
                if t.tag_type == 9 {
                    if let Some(pv) = prev {
                        assert!(t.ts > pv, "DTS não monotônico: {} <= {}", t.ts, pv);
                    }
                    prev = Some(t.ts);
                }
            }
            assert_eq!(
                seqhdrs, 1,
                "deve haver exatamente 1 sequence header out-of-band"
            );
        }

        // 4) PORTÃO DE OURO: framemd5 = decode REAL por quadro (sem o re-timing CFR do -f null,
        // que colide a grade). Qualquer erro de h264 (PPS/slice/conceal) sai no stderr.
        let decode = PCommand::new("ffmpeg")
            .args([
                "-hide_banner",
                "-v",
                "error",
                "-fflags",
                "+genpts",
                "-i",
                &out,
                "-f",
                "framemd5",
                "-",
            ])
            .output()
            .expect("rodar ffmpeg de decode");
        let stderr = String::from_utf8_lossy(&decode.stderr);
        assert!(
            stderr.trim().is_empty(),
            "decode da emenda acusou erro de h264:\n{stderr}"
        );
    }

    /// Lê um FLV inteiro: (avcC, ASC, tags de vídeo em ordem).
    fn read_flv_all(flv: &[u8]) -> (AvcC, Vec<u8>, Vec<FlvTag>) {
        let mut r = flv;
        read_flv_header(&mut r).expect("cabeçalho FLV");
        let (mut avcc, mut asc, mut vtags) = (None, None, Vec::new());
        while let Ok(Some(t)) = read_tag(&mut r) {
            if t.tag_type == 9 {
                if tag_is_video_seqhdr(&t.data) {
                    avcc = parse_avcc(&t.data[5..]);
                } else {
                    vtags.push(t);
                }
            } else if t.tag_type == 8 && tag_is_audio_seqhdr(&t.data) {
                asc = Some(t.data.clone());
            }
        }
        (avcc.expect("avcC"), asc.expect("ASC"), vtags)
    }

    /// Slate de VÍDEO: transcoda um vídeo (com áudio) pro perfil/ASC do "OBS", emenda
    /// OBS→slate-vídeo(loop, com trilha)→OBS e prova decode limpo de vídeo E áudio.
    #[test]
    #[ignore]
    fn e2e_video_slate_decodes_clean() {
        let dir = std::env::temp_dir().join("corneta-splice-e2e-vid");
        let _ = std::fs::create_dir_all(&dir);
        let p = |n: &str| dir.join(n).to_string_lossy().to_string();
        let (obs, src, slate_flv, out) =
            (p("obs.flv"), p("src.mp4"), p("slate_vid.flv"), p("out.flv"));

        // "OBS": 720p30 high COM áudio (pra ter um ASC out-of-band real).
        assert!(
            ff(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=1280x720:rate=30",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000",
                "-t",
                "6",
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-preset",
                "veryfast",
                "-g",
                "60",
                "-keyint_min",
                "60",
                "-sc_threshold",
                "0",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-b:a",
                "160k",
                "-f",
                "flv",
                &obs
            ]),
            "gerar obs.flv"
        );
        // Vídeo-fonte do slate: resolução DIFERENTE (640x480) + áudio, num container real (mp4).
        assert!(
            ff(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=640x480:rate=25",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=880:sample_rate=44100",
                "-t",
                "4",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-f",
                "mp4",
                &src
            ]),
            "gerar src.mp4"
        );
        // Transcoda o slate conformado ao OBS (mimetiza build_slate_video: scale+fps, high, ASC 48k/2ch).
        assert!(
            ff(&[
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                &src,
                "-t",
                "30",
                "-vf",
                "scale=1280:720,fps=30",
                "-c:v",
                "libx264",
                "-profile:v",
                "high",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-x264-params",
                "keyint=60:min-keyint=60:scenecut=0",
                "-bf",
                "0",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-b:a",
                "160k",
                "-f",
                "flv",
                &slate_flv
            ]),
            "transcodar slate de vídeo"
        );

        let (avcc, obs_asc, obs_tags) = read_flv_all(&std::fs::read(&obs).unwrap());
        let (slate_frames, slate_audio) =
            extract_slate_media(&std::fs::read(&slate_flv).unwrap()).expect("slate media");
        // O novo caminho: vários GOPs de vídeo E áudio extraídos.
        assert!(
            slate_frames.len() > 60,
            "slate de vídeo deve ter vários GOPs, tem {}",
            slate_frames.len()
        );
        assert!(
            !slate_audio.is_empty(),
            "slate de vídeo com trilha deve extrair áudio"
        );
        assert!(slate_frames[0].keyframe, "1º quadro do slate deve ser IDR");

        let idrs: Vec<usize> = obs_tags
            .iter()
            .enumerate()
            .filter(|(_, t)| tag_is_idr(&t.data, avcc.length_size))
            .map(|(i, _)| i)
            .collect();
        assert!(idrs.len() >= 2);
        let cut = idrs[1];

        // Monta a saída com a MESMA lógica de emissão do runtime (vídeo do slate + áudio em loop).
        let mut clock = Clock::new(48000, 30);
        let (mut need_epoch, mut v_epoch) = (true, 0i64);
        let mut ops: Vec<WriteOp> = Vec::new();
        for t in &obs_tags[..cut] {
            if t.tag_type == 9 {
                emit_copy_video(
                    t,
                    &avcc,
                    &mut clock,
                    &mut need_epoch,
                    &mut v_epoch,
                    &mut ops,
                );
            }
        }
        // slate de vídeo por ~3s (loopa quadros E trilha), grade fracionária de 30fps.
        let slate_base = clock.out_dts;
        let (mut si, mut ai) = (0usize, 0usize);
        for i in 0..90u32 {
            let dts = slate_base
                .wrapping_add((((i + 1) as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
            clock.out_dts = dts;
            clock.started = true;
            ops.push(WriteOp {
                tag_type: 9,
                ts: dts,
                data: slate_frames[si % slate_frames.len()].data.clone(),
            });
            si += 1;
            while clock.audio_ts() < dts {
                ops.push(WriteOp {
                    tag_type: 8,
                    ts: clock.audio_ts(),
                    data: slate_audio[ai % slate_audio.len()].clone(),
                });
                ai += 1;
                clock.a_idx += 1;
            }
        }
        let resume = idrs.iter().copied().find(|&i| i > cut).unwrap_or(cut);
        need_epoch = true;
        emit_resume_idr(
            &obs_tags[resume],
            &avcc,
            &mut clock,
            &mut need_epoch,
            &mut v_epoch,
            &mut ops,
        );
        for t in &obs_tags[resume + 1..] {
            if t.tag_type == 9 {
                emit_copy_video(
                    t,
                    &avcc,
                    &mut clock,
                    &mut need_epoch,
                    &mut v_epoch,
                    &mut ops,
                );
            }
        }

        let mut buf = Vec::new();
        write_preamble(&mut buf).unwrap();
        write_tag(&mut buf, 9, 0, &seqhdr_video(&avcc)).unwrap();
        write_tag(&mut buf, 8, 0, &obs_asc).unwrap(); // ASC do OBS out-of-band (uma vez)
        assert!(write_ops(&mut buf, &ops));
        std::fs::write(&out, &buf).unwrap();

        // PORTÃO DE OURO: framemd5 decodifica vídeo E áudio; erro em qualquer um sai no stderr.
        let decode = PCommand::new("ffmpeg")
            .args([
                "-hide_banner",
                "-v",
                "error",
                "-fflags",
                "+genpts",
                "-i",
                &out,
                "-f",
                "framemd5",
                "-",
            ])
            .output()
            .expect("rodar ffmpeg de decode");
        let stderr = String::from_utf8_lossy(&decode.stderr);
        assert!(
            stderr.trim().is_empty(),
            "decode do slate de vídeo acusou erro:\n{stderr}"
        );

        // A saída tem trilha de áudio decodável?
        let probe = PCommand::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "csv=p=0",
                &out,
            ])
            .output()
            .expect("rodar ffprobe");
        assert!(
            String::from_utf8_lossy(&probe.stdout).contains("aac"),
            "saída deve ter trilha AAC"
        );
    }
}
