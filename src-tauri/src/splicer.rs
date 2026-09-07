//! Copy OBS packets and splice pre-encoded slates without re-encoding the live stream.
//! Announce OBS avcC once; reassert each source's SPS/PPS in-band when switching at an IDR.
//! Fall back to the compositor only before publishing; replacing an active publisher disconnects destinations.
//! Use binary process pipes rather than the line-oriented Tauri shell.

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
use crate::telemetry::AppError;
use crate::AppState;

fn capture_splicer_error(app: &AppHandle, code: &str) {
    let state = app.state::<AppState>();
    let operation_id = state.engine.lock().unwrap().operation_id.clone();
    state.telemetry.capture_error(
        AppError::new(code, "compositor", true, None),
        operation_id.as_deref(),
        true,
        "warning",
    );
}

const SLATE_FPS: u32 = 30;
/// Balance transient-stall tolerance against visible freezes before switching to the slate.
const HOLD_MS: u64 = 600;
const RESPAWN_MS: u64 = 1500;
const SETUP_DEADLINE_MS: u64 = 8_000;
/// Bound catch-up bursts after a delayed pump iteration.
const SLATE_CATCHUP_CAP: u32 = 3;
/// Cap cached slate duration to bound setup time and encoded-frame memory.
const SLATE_VIDEO_MAX_SEC: u64 = 30;

struct FlvTag {
    tag_type: u8, // 8=audio, 9=video, 18=script
    ts: u32,      // Milliseconds: ts_ext << 24 | low24.
    data: Vec<u8>,
}

fn write_preamble(w: &mut impl Write) -> std::io::Result<()> {
    // FLV v1, audio+video flags, 9-byte header, then PrevTagSize0.
    w.write_all(&[
        0x46, 0x4C, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00,
    ])
}

/// Wire layout: type, size:3, timestamp:3, timestamp extension, streamID:3, data, previous size:4.
fn write_tag(w: &mut impl Write, tag_type: u8, ts: u32, data: &[u8]) -> std::io::Result<()> {
    let n = data.len() as u32;
    let mut hdr = [0u8; 11];
    hdr[0] = tag_type;
    hdr[1] = (n >> 16) as u8;
    hdr[2] = (n >> 8) as u8;
    hdr[3] = n as u8;
    hdr[4] = (ts >> 16) as u8;
    hdr[5] = (ts >> 8) as u8;
    hdr[6] = ts as u8;
    hdr[7] = (ts >> 24) as u8; // Extended timestamp is required beyond roughly 4.6 hours.
    w.write_all(&hdr)?;
    w.write_all(data)?;
    let prev = 11 + n;
    w.write_all(&prev.to_be_bytes())
}

fn read_flv_header(r: &mut impl Read) -> std::io::Result<()> {
    let mut h = [0u8; 9];
    r.read_exact(&mut h)?;
    if &h[0..3] != b"FLV" {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "missing FLV signature",
        ));
    }
    let mut skip = [0u8; 4];
    r.read_exact(&mut skip)
}

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
    r.read_exact(&mut prev)?;
    Ok(Some(FlvTag { tag_type, ts, data }))
}

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
    // Changed frame_num/POC bit widths invalidate resumed slices under the original SPS.
    log2_max_frame_num: u32,
    pic_order_cnt_type: u32,
    log2_max_pic_order_cnt_lsb: u32,
}

impl SpsInfo {
    /// Compare decoding compatibility; VUI/timing may change harmlessly after reconnecting.
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

/// Retain every SPS/PPS because some encoders emit multiple parameter sets.
#[derive(Clone, Debug)]
struct AvcC {
    sps: Vec<Vec<u8>>,
    pps: Vec<Vec<u8>>,
    length_size: u8, // lengthSizeMinusOne + 1
    info: SpsInfo,
    raw: Vec<u8>, // Original OBS avcC, re-emitted byte for byte.
}

#[derive(Clone, Debug)]
struct Asc {
    bytes: Vec<u8>, // Original AAC tag body, including its FLV audio header.
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

/// Big-endian bit reader for Exp-Golomb-coded SPS/ASC fields.
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
    /// Unsigned Exp-Golomb code with a bounded leading-zero scan.
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
    /// Signed Exp-Golomb code.
    fn se(&mut self) -> Option<i32> {
        let k = self.ue()?;
        let sign = if k & 1 == 1 { 1 } else { -1 };
        Some(sign * ((k as i64 + 1) / 2) as i32)
    }
}

/// Remove NAL emulation-prevention bytes: 00 00 03 becomes 00 00.
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

fn parse_sps(nal: &[u8]) -> Option<SpsInfo> {
    if nal.len() < 4 {
        return None;
    }
    let rbsp = strip_emulation(&nal[1..]);
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
    // Chroma subsampling determines crop units; interlaced frames double the vertical unit.
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

/// Parse AVCDecoderConfigurationRecord from the video tag body after its five-byte header.
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

/// Parse AudioSpecificConfig from the complete AAC sequence-header tag body.
fn parse_asc(data: &[u8]) -> Option<Asc> {
    if data.len() < 4 {
        return None;
    }
    let asc = &data[2..];
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
            break;
        }
        out.push(&payload[i..i + len]);
        i += len;
    }
    out
}

/// Require NAL type 5; the FLV keyframe flag alone does not prove an IDR.
fn tag_is_idr(data: &[u8], length_size: u8) -> bool {
    if data.len() < 5 || (data[0] & 0x0F) != 7 || data[1] != 1 {
        return false;
    }
    each_nalu(&data[5..], length_size)
        .iter()
        .any(|n| !n.is_empty() && (n[0] & 0x1F) == 5)
}

fn tag_is_video_seqhdr(data: &[u8]) -> bool {
    data.len() >= 5 && (data[0] & 0x0F) == 7 && data[1] == 0
}
fn tag_is_audio_seqhdr(data: &[u8]) -> bool {
    data.len() >= 2 && (data[0] >> 4) == 10 && data[1] == 0
}

/// Prefix parameter sets in-band before switching sources at an IDR.
fn prefix_param_sets(sps: &[Vec<u8>], pps: &[Vec<u8>], length_size: u8) -> Vec<u8> {
    let ls = length_size as usize;
    let mut out = Vec::new();
    for set in sps.iter().chain(pps.iter()) {
        let len = set.len() as u32;
        out.extend_from_slice(&len.to_be_bytes()[4 - ls..]);
        out.extend_from_slice(set);
    }
    out
}

/// Tauri places sidecars beside the executable without the target-triple suffix.
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

fn spawn_reader(
    child: &mut Child,
    gen: u64,
) -> (Receiver<(u64, FlvTag)>, std::thread::JoinHandle<()>) {
    let stdout = child
        .stdout
        .take()
        .expect("input ffmpeg has no stdout pipe");
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
                        return;
                    }
                }
                Ok(None) | Err(_) => return,
            }
        }
    });
    (rx, handle)
}

/// Drain queued tags before joining: killing the child cannot wake a reader blocked in send.
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

struct SlateFrame {
    keyframe: bool,
    data: Vec<u8>, // AVC tag body: frame type, packet type, CTS, then NALUs.
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

/// Encode slate media once during setup; live forwarding remains stream copy.
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
            Some((frames, Vec::new()))
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
        .stdin(Stdio::null()) // Never prompt on inherited stdin when a temporary output already exists.
        .stdout(Stdio::null())
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

/// Disable B-frames to keep slate CTS zero across loop boundaries.
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
        // Match OBS's out-of-band AAC-LC configuration, sample rate, and channel count.
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
        .stdin(Stdio::null())
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

fn extract_slate_media(flv: &[u8]) -> Option<(Vec<SlateFrame>, Vec<Vec<u8>>)> {
    let mut r = flv;
    read_flv_header(&mut r).ok()?;
    let mut avcc: Option<AvcC> = None;
    let mut frames = Vec::new();
    let mut audio = Vec::new();
    while let Ok(Some(tag)) = read_tag(&mut r) {
        if tag.tag_type == 8 {
            if !tag_is_audio_seqhdr(&tag.data) {
                audio.push(tag.data);
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
            // Reassert slate SPS/PPS before each slate IDR.
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
    // Remove AAC encoder priming for cleaner loops, without emptying a one-frame track.
    if audio.len() > 1 {
        audio.remove(0);
    }
    Some((frames, audio))
}

fn build_silence(app: &AppHandle, ffmpeg: &std::path::Path, sr: u32, ch: u8) -> Vec<u8> {
    let fallback = |ch: u8| -> Vec<u8> {
        // Rate-independent AAC-LC silence access units for stereo and mono.
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
        .stdin(Stdio::null())
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
    // Skip the sequence header and priming frame; use a stable silence frame.
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

#[derive(Clone, Copy, PartialEq, Debug)]
enum State {
    Copy,
    Slate,
    HoldIncompat,
}

struct Clock {
    out_dts: u32,     // Last emitted video DTS.
    out_pts_hwm: u32, // Video PTS high-water mark, including OBS B-frame offsets.
    a_idx: u64,       // Total emitted audio frames, including silence.
    sr: u32,
    frame_dt: u32, // Typical video DTS interval in milliseconds, used to bridge segments.
    started: bool,
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
    /// Derive audio timestamps from frame count to avoid accumulated rounding drift.
    fn audio_ts(&self) -> u32 {
        ((self.a_idx.wrapping_mul(1024).wrapping_mul(1000)) / self.sr as u64) as u32
    }
}

struct WriteOp {
    tag_type: u8,
    ts: u32,
    data: Vec<u8>,
}

fn write_ops<W: Write>(w: &mut W, ops: &[WriteOp]) -> bool {
    for op in ops {
        if write_tag(w, op.tag_type, op.ts, &op.data).is_err() {
            return false;
        }
    }
    true
}

enum SetupOutcome {
    Fallback(CompositorOpts),
    Done,
}

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
    .await;
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(_) => {
            capture_splicer_error(&app, "splicer_task_failed");
            SetupOutcome::Done
        }
    };
    // Fallback is safe only before the first program publish.
    if let SetupOutcome::Fallback(opts) = outcome {
        log::warn!("splicer: setup incomplete; falling back to the compositor");
        capture_splicer_error(&app, "splicer_setup_fallback");
        crate::compositor::run(app, running, has_signal, slate_on, opts).await;
    }
}

fn setup_and_pump(
    app: &AppHandle,
    running: &Arc<AtomicBool>,
    has_signal: &Arc<AtomicBool>,
    slate_on: &Arc<AtomicBool>,
    opts: CompositorOpts,
) -> SetupOutcome {
    let Some(ffmpeg) = ffmpeg_path() else {
        log::error!("splicer: ffmpeg sidecar not found");
        return SetupOutcome::Fallback(opts);
    };
    let cfg = crate::config::load(app);
    let ingest = engine::ingest_url(&cfg);
    let program = engine::program_url(&cfg);

    // Start the setup deadline only after OBS begins publishing.
    while !has_signal.load(Ordering::Relaxed) {
        if !running.load(Ordering::Relaxed) {
            return SetupOutcome::Done;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    let mut gen: u64 = 0;
    let mut in_child = match spawn_input(&ffmpeg, &ingest) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: input ffmpeg could not start: {e}");
            return SetupOutcome::Fallback(opts);
        }
    };
    let (mut rx, reader) = spawn_reader(&mut in_child, gen);

    let mut avcc: Option<AvcC> = None;
    let mut asc: Option<Asc> = None;
    let mut pending: VecDeque<FlvTag> = VecDeque::new();
    let deadline = Instant::now() + Duration::from_millis(SETUP_DEADLINE_MS);
    while avcc.is_none() || asc.is_none() {
        if !running.load(Ordering::Relaxed) {
            kill(&mut in_child);
            drain_and_join(&rx, Some(reader));
            return SetupOutcome::Done;
        }
        if Instant::now() > deadline {
            // Synthesize a 48 kHz stereo ASC when the destination still needs an audio track.
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
                "splicer: no OBS sequence header within {SETUP_DEADLINE_MS}ms; falling back"
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
                        return fail_setup(&mut in_child, &rx, reader, opts, "unreadable avcC");
                    }
                } else if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
                    asc = parse_asc(&tag.data);
                    if asc.is_none() {
                        return fail_setup(&mut in_child, &rx, reader, opts, "unreadable ASC");
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
                    "OBS disconnected before its sequence header",
                );
            }
        }
    }
    let avcc = avcc.unwrap();
    let asc = asc.unwrap();

    // Stream-copy splicing supports progressive 8-bit H.264 4:2:0 baseline/main/high.
    let i = &avcc.info;
    let gate_ok = i.chroma_format_idc == 1
        && i.frame_mbs_only == 1
        && avcc.length_size == 4
        && i.bit_depth_luma_minus8 == 0
        && i.bit_depth_chroma_minus8 == 0
        && map_profile(i.profile_idc).is_some()
        && i.width > 0
        && i.height > 0
        && asc.object_type == 2; // Generated silence is AAC-LC; delegate HE/SBR during setup.
    if !gate_ok {
        return fail_setup(
            &mut in_child,
            &rx,
            reader,
            opts,
            "unsupported OBS splicer configuration (profile/bit depth/chroma)",
        );
    }

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
        None => return fail_setup(&mut in_child, &rx, reader, opts, "slate preparation failed"),
    };
    let silence = build_silence(app, &ffmpeg, asc.sample_rate, asc.channels);
    if matches!(opts.slate, Slate::Video { .. }) {
        log::info!(
            "splicer: video slate ready; {} video frames, {} audio frames (loop cap {}s)",
            slate.len(),
            slate_audio.len(),
            SLATE_VIDEO_MAX_SEC
        );
    }

    let mut out_child = match spawn_output(&ffmpeg, &program) {
        Ok(c) => c,
        Err(e) => {
            log::error!("splicer: output ffmpeg could not start: {e}");
            return fail_setup(
                &mut in_child,
                &rx,
                reader,
                opts,
                "output ffmpeg could not start",
            );
        }
    };
    let mut out_stdin = out_child
        .stdin
        .take()
        .expect("output ffmpeg has no stdin pipe");
    // A blocked stdin write cannot observe cancellation; the watchdog kills the publisher.
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
            "could not publish _program",
        );
    }

    log::info!(
        "splicer: ready; {}x{} profile={} {}Hz/{}ch; copying OBS to _program without re-encoding",
        avcc.info.width,
        avcc.info.height,
        avcc.info.profile_idc,
        asc.sample_rate,
        asc.channels
    );

    // No fallback after publication: incompatible input must remain on the slate.
    let mut reader = Some(reader);
    let mut clock = Clock::new(asc.sample_rate, opts.spec.fps.max(SLATE_FPS));
    let mut state = State::Slate;
    let mut slate_i = 0usize;
    let mut slate_a_i = 0usize;
    let mut slate_epoch: Option<Instant> = None;
    let mut slate_base_dts: u32 = 0;
    let mut slate_n: u32 = 0;
    let mut last_video_at = Instant::now();
    let mut input_alive = true;
    let mut last_respawn = Instant::now();
    let mut need_copy_epoch = true;
    let mut v_epoch: i64 = 0;
    let mut primed = false;
    let mut video_ok = true;
    let mut audio_ok = true;

    // Discard pre-IDR tags; copying may begin only at a real IDR.
    pending.clear();

    loop {
        if !running.load(Ordering::Relaxed) {
            break;
        }
        let forced = opts.force_slate.load(Ordering::Relaxed);
        let mut ops: Vec<WriteOp> = Vec::new();

        let mut got_disconnect = false;
        loop {
            match rx.try_recv() {
                Ok((g, tag)) => {
                    if g != gen {
                        continue;
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

        // Start slate output after the first copied frame or an explicit manual pause.
        if state == State::Copy || forced {
            primed = true;
        }

        let gap = got_disconnect
            || (state == State::Copy && last_video_at.elapsed() > Duration::from_millis(HOLD_MS));
        if state == State::Copy && (gap || forced) {
            state = State::Slate;
        }
        if got_disconnect {
            input_alive = false;
        }

        let showing_slate = matches!(state, State::Slate | State::HoldIncompat) && primed;
        if showing_slate {
            if slate_epoch.is_none() {
                slate_epoch = Some(Instant::now());
                slate_base_dts = clock.out_dts;
                slate_n = 0;
                slate_i = 0; // Restart at the slate IDR, never a P-frame with missing references.
                slate_a_i = 0;
            }
            let elapsed = slate_epoch.unwrap().elapsed().as_millis() as u32;
            let target = slate_base_dts.wrapping_add(elapsed);
            let mut emitted = 0u32;
            while clock.out_dts < target && emitted < SLATE_CATCHUP_CAP && !slate.is_empty() {
                // Restart audio at video loop boundaries to prevent drift between slightly different loop periods.
                if slate_i != 0 && slate_i.is_multiple_of(slate.len()) {
                    slate_a_i = 0;
                }
                let frame = &slate[slate_i % slate.len()];
                slate_i += 1;
                slate_n += 1;
                // Use fractional frame spacing; truncating every frame to 33 ms accumulates drift.
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

        if !write_ops(&mut out_stdin, &ops) {
            log::error!("splicer: output ffmpeg exited (broken pipe); stopping");
            break;
        }

        if !input_alive
            && has_signal.load(Ordering::Relaxed)
            && last_respawn.elapsed() >= Duration::from_millis(RESPAWN_MS)
        {
            last_respawn = Instant::now();
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
                }
                Err(e) => log::warn!("splicer: input restart failed: {e}"),
            }
        }

        std::thread::sleep(Duration::from_millis(4));
    }

    // Reap the publisher before joining readers, and drain channels to release blocked sends.
    gen_done.store(true, Ordering::Relaxed);
    kill(&mut in_child);
    kill(&mut out_child);
    drain_and_join(&rx, reader.take());
    slate_on.store(false, Ordering::Relaxed);
    log::info!("splicer: stopped");
    SetupOutcome::Done
}

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
    // Output extradata is fixed: incompatible reconnects must hold the slate, not replace the publisher.
    if tag.tag_type == 9 && tag_is_video_seqhdr(&tag.data) {
        if let Some(new) = parse_avcc(&tag.data[5..]) {
            *video_ok = new.info.semantically_eq(&avcc.info);
            if !*video_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS video changed ({}x{} to {}x{}); holding BRB",
                        avcc.info.width,
                        avcc.info.height,
                        new.info.width,
                        new.info.height
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *audio_ok {
                log::info!(
                    "splicer: compatible OBS configuration restored; resuming at the next IDR"
                );
                *state = State::Slate;
            }
        }
        return;
    }
    if tag.tag_type == 8 && tag_is_audio_seqhdr(&tag.data) {
        // Both audio and video must match before leaving HoldIncompat, regardless of header arrival order.
        if let Some(new) = parse_asc(&tag.data) {
            *audio_ok = new.semantically_eq(asc);
            if !*audio_ok {
                if *state != State::HoldIncompat {
                    log::warn!(
                        "splicer: OBS audio changed ({}Hz/{}ch to {}Hz/{}ch); holding BRB",
                        asc.sample_rate,
                        asc.channels,
                        new.sample_rate,
                        new.channels
                    );
                }
                *state = State::HoldIncompat;
            } else if *state == State::HoldIncompat && *video_ok {
                log::info!(
                    "splicer: compatible OBS configuration restored; resuming at the next IDR"
                );
                *state = State::Slate;
            }
        }
        return;
    }

    match *state {
        State::HoldIncompat => {}
        State::Slate => {
            if tag.tag_type == 9 && !forced && tag_is_idr(&tag.data, avcc.length_size) {
                // Reassert OBS SPS/PPS before the return IDR.
                emit_resume_idr(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                *state = State::Copy;
                *last_video_at = Instant::now();
            }
        }
        State::Copy => {
            if forced {
                *state = State::Slate;
                return;
            }
            match tag.tag_type {
                9 => {
                    emit_copy_video(&tag, avcc, clock, need_copy_epoch, v_epoch, ops);
                    *last_video_at = Instant::now();
                }
                8 => {
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

fn emit_copy_video(
    tag: &FlvTag,
    _avcc: &AvcC,
    clock: &mut Clock,
    need_epoch: &mut bool,
    v_epoch: &mut i64,
    ops: &mut Vec<WriteOp>,
) {
    if *need_epoch {
        // A new input process restarts OBS timestamps near zero; bridge onto the existing output clock.
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

/// AVC composition offset is a signed 24-bit value in tag bytes 2..5.
fn read_cts(data: &[u8]) -> i32 {
    if data.len() < 5 {
        return 0;
    }
    let raw = ((data[2] as i32) << 16) | ((data[3] as i32) << 8) | (data[4] as i32);
    if raw & 0x80_0000 != 0 {
        raw | !0xFF_FFFF
    } else {
        raw
    }
}

fn seqhdr_video(avcc: &AvcC) -> Vec<u8> {
    // Preserve the original avcC exactly, including profile compatibility and High-profile extensions.
    let mut v = vec![0x17, 0x00, 0x00, 0x00, 0x00];
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
    log::warn!("splicer: setup failed ({why}); falling back to compositor");
    kill(in_child);
    drain_and_join(rx, Some(reader));
    SetupOutcome::Fallback(opts)
}

fn spawn_output_watchdog(running: Arc<AtomicBool>, gen_done: Arc<AtomicBool>, pid: u32) {
    std::thread::spawn(move || {
        while running.load(Ordering::Relaxed) && !gen_done.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(200));
        }
        std::thread::sleep(Duration::from_millis(1200)); // Allow normal teardown to finish first.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_avcc() -> Vec<u8> {
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
        let ts = 20_000_000u32;
        write_tag(&mut buf, 9, ts, &[0x17, 0x01, 0, 0, 0, 0xAA]).unwrap();
        let mut r = &buf[..];
        let tag = read_tag(&mut r).unwrap().unwrap();
        assert_eq!(tag.ts, ts);
        assert_eq!(tag.tag_type, 9);
        assert_eq!(tag.data.last(), Some(&0xAA));
    }

    #[test]
    fn parse_avcc_caches_all_sets() {
        let a = parse_avcc(&sample_avcc()).expect("parseable avcC");
        assert_eq!(a.sps.len(), 1);
        assert_eq!(a.pps.len(), 1);
        assert_eq!(a.length_size, 4);
        assert_eq!(a.info.profile_idc, 66);
        assert_eq!(a.info.chroma_format_idc, 1);
        assert_eq!(a.info.frame_mbs_only, 1);
    }

    #[test]
    fn seqhdr_roundtrips_through_parse() {
        let a = parse_avcc(&sample_avcc()).unwrap();
        let hdr = seqhdr_video(&a);
        assert_eq!(&hdr[0..2], &[0x17, 0x00]);
        let a2 = parse_avcc(&hdr[5..]).expect("reparse sequence header");
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
        let mut c = a.clone();
        c.log2_max_frame_num += 1;
        assert!(!a.semantically_eq(&c));
        let mut d = a.clone();
        d.pic_order_cnt_type = 2;
        assert!(!a.semantically_eq(&d));
    }

    #[test]
    fn idr_detection_bounds_checked() {
        let mut data = vec![0x17, 0x01, 0, 0, 0];
        let nal = [0x65u8, 0x88, 0x84];
        data.extend_from_slice(&(nal.len() as u32).to_be_bytes());
        data.extend_from_slice(&nal);
        assert!(tag_is_idr(&data, 4));
        let bad = vec![0x17, 0x01, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF, 0x65];
        assert!(!tag_is_idr(&bad, 4));
    }

    #[test]
    fn audio_ts_is_drift_free() {
        let mut c = Clock::new(48000, 30);
        for _ in 0..48 {
            c.a_idx += 1;
        }
        assert_eq!(c.audio_ts(), 1024);
    }

    #[test]
    fn each_nalu_rejects_oversized_prefix() {
        let payload = [0x00, 0x00, 0x00, 0xFF, 0x65];
        assert!(each_nalu(&payload, 4).is_empty());
    }

    // Optional integration tests require ffmpeg and ffprobe on PATH: cargo test --locked --lib splicer -- --ignored.

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
        read_flv_header(&mut r).expect("FLV header");
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
        (avcc.expect("avcC in the OBS FLV"), tags)
    }

    #[test]
    #[ignore]
    fn e2e_splice_decodes_clean() {
        let dir = std::env::temp_dir().join("corneta-splice-e2e");
        let _ = std::fs::create_dir_all(&dir);
        let p = |n: &str| dir.join(n).to_string_lossy().to_string();
        let (obs, slate_png, slate_flv, out) =
            (p("obs.flv"), p("slate.png"), p("slate.flv"), p("out.flv"));

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
            "generate obs.flv (is ffmpeg on PATH?)"
        );
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

        let idrs: Vec<usize> = obs_tags
            .iter()
            .enumerate()
            .filter(|(_, t)| tag_is_idr(&t.data, avcc.length_size))
            .map(|(i, _)| i)
            .collect();
        assert!(
            idrs.len() >= 2,
            "OBS fixture requires at least two keyframes"
        );
        let cut = idrs[1];

        let mut clock = Clock::new(48000, 30);
        let mut need_epoch = true;
        let mut v_epoch = 0i64;
        let mut ops: Vec<WriteOp> = Vec::new();

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

        let mut buf = Vec::new();
        write_preamble(&mut buf).unwrap();
        write_tag(&mut buf, 9, 0, &seqhdr_video(&avcc)).unwrap();
        assert!(write_ops(&mut buf, &ops));
        std::fs::write(&out, &buf).unwrap();

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
                        assert!(t.ts > pv, "non-monotonic DTS: {} <= {}", t.ts, pv);
                    }
                    prev = Some(t.ts);
                }
            }
            assert_eq!(
                seqhdrs, 1,
                "there must be exactly one out-of-band sequence header"
            );
        }

        // framemd5 decodes each frame without null-muxer CFR retiming that can obscure timestamp errors.
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
            .expect("run ffmpeg decoding");
        let stderr = String::from_utf8_lossy(&decode.stderr);
        assert!(
            stderr.trim().is_empty(),
            "spliced output produced an H.264 decoding error:\n{stderr}"
        );
    }

    fn read_flv_all(flv: &[u8]) -> (AvcC, Vec<u8>, Vec<FlvTag>) {
        let mut r = flv;
        read_flv_header(&mut r).expect("FLV header");
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

    #[test]
    #[ignore]
    fn e2e_video_slate_decodes_clean() {
        let dir = std::env::temp_dir().join("corneta-splice-e2e-vid");
        let _ = std::fs::create_dir_all(&dir);
        let p = |n: &str| dir.join(n).to_string_lossy().to_string();
        let (obs, src, slate_flv, out) =
            (p("obs.flv"), p("src.mp4"), p("slate_vid.flv"), p("out.flv"));

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
            "generate obs.flv"
        );
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
            "generate src.mp4"
        );
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
            "transcode video slate"
        );

        let (avcc, obs_asc, obs_tags) = read_flv_all(&std::fs::read(&obs).unwrap());
        let (slate_frames, slate_audio) =
            extract_slate_media(&std::fs::read(&slate_flv).unwrap()).expect("slate media");
        assert!(
            slate_frames.len() > 60,
            "video slate must contain multiple GOPs, got {} frames",
            slate_frames.len()
        );
        assert!(
            !slate_audio.is_empty(),
            "video slate with an audio track must yield audio frames"
        );
        assert!(
            slate_frames[0].keyframe,
            "the first slate frame must be an IDR"
        );

        let idrs: Vec<usize> = obs_tags
            .iter()
            .enumerate()
            .filter(|(_, t)| tag_is_idr(&t.data, avcc.length_size))
            .map(|(i, _)| i)
            .collect();
        assert!(idrs.len() >= 2);
        let cut = idrs[1];

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
        write_tag(&mut buf, 8, 0, &obs_asc).unwrap();
        assert!(write_ops(&mut buf, &ops));
        std::fs::write(&out, &buf).unwrap();

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
            .expect("run ffmpeg decoding");
        let stderr = String::from_utf8_lossy(&decode.stderr);
        assert!(
            stderr.trim().is_empty(),
            "video slate produced a decoding error:\n{stderr}"
        );

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
            .expect("run ffprobe");
        assert!(
            String::from_utf8_lossy(&probe.stdout).contains("aac"),
            "output must contain an AAC track"
        );
    }
}
