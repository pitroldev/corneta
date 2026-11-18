//! Enhanced RTMP v1/v2 FLV video tag parsing and keyframe decoration for HEVC (`hvc1`) and AV1 (`av01`).
use super::avc::{each_nalu, strip_emulation, AvcC, BitReader, SpsInfo};
use crate::platforms::VideoCodec;

pub(super) const EX_HEADER_MASK: u8 = 0x80;
pub(super) const PKT_SEQUENCE_START: u8 = 0;
pub(super) const PKT_CODED_FRAMES: u8 = 1;
pub(super) const PKT_CODED_FRAMES_X: u8 = 3;

pub(super) const FOURCC_HEVC: [u8; 4] = *b"hvc1";
pub(super) const FOURCC_AV1: [u8; 4] = *b"av01";

#[derive(Clone, Debug, PartialEq)]
pub(super) enum EnhancedConfig {
    Hevc { vps: Vec<Vec<u8>> },
    Av1 { config_obus: Vec<u8> },
}

impl EnhancedConfig {
    pub(super) const fn codec(&self) -> VideoCodec {
        match self {
            Self::Hevc { .. } => VideoCodec::Hevc,
            Self::Av1 { .. } => VideoCodec::Av1,
        }
    }

    pub(super) const fn fourcc(&self) -> [u8; 4] {
        match self {
            Self::Hevc { .. } => FOURCC_HEVC,
            Self::Av1 { .. } => FOURCC_AV1,
        }
    }
}

pub(super) fn is_ex_header(data: &[u8]) -> bool {
    data.first().is_some_and(|b| (b & EX_HEADER_MASK) != 0)
}

pub(super) fn tag_is_enhanced_seqhdr(data: &[u8]) -> bool {
    data.len() >= 6
        && is_ex_header(data)
        && (data[0] & 0x0F) == PKT_SEQUENCE_START
        && matches!(&data[1..5], b"hvc1" | b"av01")
}

pub(super) fn tag_is_enhanced_coded_frame(data: &[u8]) -> bool {
    if data.len() <= 5 || !is_ex_header(data) {
        return false;
    }
    let pkt_type = data[0] & 0x0F;
    match (&data[1..5], pkt_type) {
        (b"hvc1", PKT_CODED_FRAMES) => data.len() > 8,
        (b"hvc1", PKT_CODED_FRAMES_X) => true,
        (b"av01", PKT_CODED_FRAMES | PKT_CODED_FRAMES_X) => true,
        _ => false,
    }
}

pub(super) fn read_enhanced_cts(data: &[u8]) -> i32 {
    if data.len() >= 8
        && is_ex_header(data)
        && (data[0] & 0x0F) == PKT_CODED_FRAMES
        && &data[1..5] == b"hvc1"
    {
        let raw = ((data[5] as i32) << 16) | ((data[6] as i32) << 8) | (data[7] as i32);
        if raw & 0x80_0000 != 0 {
            raw | !0xFF_FFFF
        } else {
            raw
        }
    } else {
        0
    }
}

pub(super) fn parse_enhanced_seqhdr(data: &[u8]) -> Option<AvcC> {
    if !tag_is_enhanced_seqhdr(data) {
        return None;
    }
    match &data[1..5] {
        b"hvc1" => parse_hvcc(&data[5..]),
        b"av01" => parse_av1c(&data[5..]),
        _ => None,
    }
}

/// Parse `HEVCDecoderConfigurationRecord` (`ISO/IEC 14496-15`).
pub(super) fn parse_hvcc(cfg: &[u8]) -> Option<AvcC> {
    if cfg.len() < 23 || cfg[0] != 1 {
        return None;
    }
    let profile_idc = cfg[1] & 0x1F;
    let level_idc = cfg[12];
    let chroma_from_rec = (cfg[16] & 0x03) as u32;
    let luma_from_rec = (cfg[17] & 0x07) as u32;
    let chroma_bd_from_rec = (cfg[18] & 0x07) as u32;
    let length_size = (cfg[21] & 0x03) + 1;
    let num_arrays = cfg[22] as usize;
    let mut i = 23;
    let mut vps = Vec::new();
    let mut sps = Vec::new();
    let mut pps = Vec::new();
    for _ in 0..num_arrays {
        if i + 3 > cfg.len() {
            return None;
        }
        let nal_type = cfg[i] & 0x3F;
        let num_nalus = ((cfg[i + 1] as usize) << 8) | (cfg[i + 2] as usize);
        i += 3;
        for _ in 0..num_nalus {
            if i + 2 > cfg.len() {
                return None;
            }
            let len = ((cfg[i] as usize) << 8) | (cfg[i + 1] as usize);
            i += 2;
            if len == 0 || i + len > cfg.len() {
                return None;
            }
            let nal = cfg[i..i + len].to_vec();
            i += len;
            match nal_type {
                32 => vps.push(nal),
                33 => sps.push(nal),
                34 => pps.push(nal),
                _ => {}
            }
        }
    }
    let mut info = parse_hevc_sps(sps.first()?)?;
    if info.profile_idc == 0 {
        info.profile_idc = profile_idc;
    }
    if info.level_idc == 0 {
        info.level_idc = level_idc;
    }
    if info.chroma_format_idc == 0 {
        info.chroma_format_idc = chroma_from_rec;
    }
    let _ = (luma_from_rec, chroma_bd_from_rec);
    Some(AvcC {
        sps,
        pps,
        length_size,
        info,
        raw: cfg.to_vec(),
        enhanced: Some(EnhancedConfig::Hevc { vps }),
    })
}

fn skip_hevc_profile_tier_level(
    br: &mut BitReader,
    max_sub_layers_minus1: u32,
) -> Option<(u8, u8)> {
    let _profile_space_tier = br.bits(3)?;
    let profile_idc = br.bits(5)? as u8;
    let _compat = br.bits(32)?;
    let _constraint_hi = br.bits(32)?;
    let _constraint_lo = br.bits(16)?;
    let level_idc = br.bits(8)? as u8;
    if max_sub_layers_minus1 == 0 {
        return Some((profile_idc, level_idc));
    }
    let mut prof_present = [false; 8];
    let mut level_present = [false; 8];
    for i in 0..max_sub_layers_minus1 as usize {
        prof_present[i] = br.bit()? == 1;
        level_present[i] = br.bit()? == 1;
    }
    for _ in max_sub_layers_minus1..8 {
        let _ = br.bits(2)?;
    }
    for i in 0..max_sub_layers_minus1 as usize {
        if prof_present[i] {
            let _ = br.bits(32)?;
            let _ = br.bits(32)?;
            let _ = br.bits(24)?;
        }
        if level_present[i] {
            let _ = br.bits(8)?;
        }
    }
    Some((profile_idc, level_idc))
}

fn parse_hevc_sps(nal: &[u8]) -> Option<SpsInfo> {
    if nal.len() < 15 {
        return None;
    }
    let rbsp = strip_emulation(&nal[2..]);
    let mut br = BitReader::new(&rbsp);
    let _vps_id = br.bits(4)?;
    let max_sub_layers_minus1 = br.bits(3)?;
    let _temporal_id_nesting = br.bit()?;
    let (profile_idc, level_idc) = skip_hevc_profile_tier_level(&mut br, max_sub_layers_minus1)?;
    let _sps_id = br.ue()?;
    let chroma_format_idc = br.ue()?;
    if chroma_format_idc == 3 {
        let _separate_colour_plane = br.bit()?;
    }
    let mut width = br.ue()?;
    let mut height = br.ue()?;
    if br.bit()? == 1 {
        let left = br.ue()?;
        let right = br.ue()?;
        let top = br.ue()?;
        let bottom = br.ue()?;
        let sub_w = if chroma_format_idc == 1 || chroma_format_idc == 2 {
            2
        } else {
            1
        };
        let sub_h = if chroma_format_idc == 1 { 2 } else { 1 };
        width = width.saturating_sub((left + right) * sub_w);
        height = height.saturating_sub((top + bottom) * sub_h);
    }
    let bit_depth_luma_minus8 = br.ue()?;
    let bit_depth_chroma_minus8 = br.ue()?;
    let log2_max_pic_order_cnt_lsb = br.ue()?;
    Some(SpsInfo {
        width,
        height,
        profile_idc,
        level_idc,
        chroma_format_idc,
        frame_mbs_only: 1,
        bit_depth_luma_minus8,
        bit_depth_chroma_minus8,
        log2_max_frame_num: 0,
        pic_order_cnt_type: 0,
        log2_max_pic_order_cnt_lsb,
    })
}

/// Parse `AV1CodecConfigurationRecord` (`av1C`).
pub(super) fn parse_av1c(cfg: &[u8]) -> Option<AvcC> {
    if cfg.len() < 4 || cfg[0] != 0x81 {
        return None;
    }
    let seq_profile = (cfg[1] >> 5) & 0x07;
    let seq_level_idx_0 = cfg[1] & 0x1F;
    let high_bitdepth = (cfg[2] >> 6) & 1;
    let twelve_bit = (cfg[2] >> 5) & 1;
    let monochrome = (cfg[2] >> 4) & 1;
    let subsampling_x = (cfg[2] >> 3) & 1;
    let subsampling_y = (cfg[2] >> 2) & 1;
    let bit_depth_minus8 = if high_bitdepth == 0 {
        0
    } else if twelve_bit == 0 {
        2
    } else {
        4
    };
    let chroma_format_idc = if monochrome == 1 {
        0
    } else if subsampling_x == 1 && subsampling_y == 1 {
        1
    } else if subsampling_x == 1 {
        2
    } else {
        3
    };
    let config_obus = cfg[4..].to_vec();
    let (width, height) = parse_av1_obus_dimensions(&config_obus)?;
    Some(AvcC {
        sps: Vec::new(),
        pps: Vec::new(),
        length_size: 4,
        info: SpsInfo {
            width,
            height,
            profile_idc: seq_profile,
            level_idc: seq_level_idx_0,
            chroma_format_idc,
            frame_mbs_only: 1,
            bit_depth_luma_minus8: bit_depth_minus8,
            bit_depth_chroma_minus8: bit_depth_minus8,
            log2_max_frame_num: 0,
            pic_order_cnt_type: 0,
            log2_max_pic_order_cnt_lsb: 0,
        },
        raw: cfg.to_vec(),
        enhanced: Some(EnhancedConfig::Av1 { config_obus }),
    })
}

fn read_leb128(data: &[u8]) -> Option<(usize, usize)> {
    let mut value = 0usize;
    for (i, &b) in data.iter().take(8).enumerate() {
        value |= ((b & 0x7F) as usize) << (i * 7);
        if (b & 0x80) == 0 {
            return Some((value, i + 1));
        }
    }
    None
}

const MEDIAMTX_SYNTHETIC_AV1_OBU: [u8; 13] = [
    0x0A, 0x0B, 0x00, 0x00, 0x00, 0x42, 0xAB, 0xBF, 0xC3, 0x70, 0x0B, 0xE0, 0x01,
];

pub(super) fn is_mediamtx_synthetic_av1(avcc: &AvcC) -> bool {
    matches!(
        &avcc.enhanced,
        Some(EnhancedConfig::Av1 { config_obus })
            if config_obus.as_slice() == MEDIAMTX_SYNTHETIC_AV1_OBU
    )
}

#[derive(Clone, Copy)]
struct Av1SeqHeaderInfo {
    width: u32,
    height: u32,
    seq_profile: u8,
    seq_level_idx_0: u8,
    seq_tier_0: u8,
    high_bitdepth: u8,
    twelve_bit: u8,
    monochrome: u8,
    subsampling_x: u8,
    subsampling_y: u8,
    chroma_sample_position: u8,
}

fn find_av1_seq_obu(obus: &[u8]) -> Option<(&[u8], &[u8])> {
    let mut i = 0;
    while i < obus.len() {
        let obu_start = i;
        let header = obus[i];
        i += 1;
        let obu_type = (header >> 3) & 0x0F;
        let has_ext = (header >> 2) & 1 == 1;
        let has_size = (header >> 1) & 1 == 1;
        if has_ext {
            if i >= obus.len() {
                return None;
            }
            i += 1;
        }
        let payload = if has_size {
            let (sz, used) = read_leb128(&obus[i..])?;
            i += used;
            if i + sz > obus.len() {
                return None;
            }
            let slice = &obus[i..i + sz];
            i += sz;
            slice
        } else {
            let slice = &obus[i..];
            i = obus.len();
            slice
        };
        if obu_type == 1 {
            return Some((&obus[obu_start..i], payload));
        }
    }
    None
}

fn parse_av1_obus_dimensions(obus: &[u8]) -> Option<(u32, u32)> {
    let (_, payload) = find_av1_seq_obu(obus)?;
    let info = parse_av1_sequence_header_payload(payload)?;
    Some((info.width, info.height))
}

fn parse_av1_color_config(
    br: &mut BitReader,
    seq_profile: u8,
    reduced: u32,
) -> Option<(u8, u8, u8, u8, u8, u8)> {
    if reduced == 0 && br.bit()? == 1 {
        let _ = br.bits(7)?;
    }
    let _ = br.bits(3)?; // use_128x128_superblock, enable_filter_intra, enable_intra_edge_filter
    if reduced == 0 {
        let _ = br.bits(4)?; // interintra, masked, warped, dual_filter
        let enable_order_hint = br.bit()?;
        if enable_order_hint == 1 {
            let _ = br.bits(2)?; // jnt_comp, ref_frame_mvs
        }
        let seq_force_screen_content_tools = if br.bit()? == 1 { 2 } else { br.bit()? };
        if seq_force_screen_content_tools > 0 && br.bit()? == 0 {
            let _ = br.bit()?;
        }
        if enable_order_hint == 1 {
            let _ = br.bits(3)?;
        }
    }
    let _ = br.bits(3)?; // superres, cdef, restoration
    let high_bitdepth = br.bit()? as u8;
    let twelve_bit = if seq_profile == 2 && high_bitdepth == 1 {
        br.bit()? as u8
    } else {
        0
    };
    let monochrome = if seq_profile == 1 { 0 } else { br.bit()? as u8 };
    let (cp, tc, mc) = if br.bit()? == 1 {
        (br.bits(8)?, br.bits(8)?, br.bits(8)?)
    } else {
        (2, 2, 2)
    };
    if monochrome == 1 {
        let _color_range = br.bit()?;
        return Some((high_bitdepth, twelve_bit, 1, 1, 1, 0));
    }
    if cp == 1 && tc == 13 && mc == 0 {
        return Some((high_bitdepth, twelve_bit, 0, 0, 0, 0));
    }
    let _color_range = br.bit()?;
    let (sx, sy) = match seq_profile {
        0 => (1u8, 1u8),
        1 => (0u8, 0u8),
        _ => {
            if twelve_bit == 1 {
                let sx = br.bit()? as u8;
                let sy = if sx == 1 { br.bit()? as u8 } else { 0 };
                (sx, sy)
            } else {
                (1u8, 0u8)
            }
        }
    };
    let csp = if sx == 1 && sy == 1 {
        br.bits(2)? as u8
    } else {
        0
    };
    Some((high_bitdepth, twelve_bit, 0, sx, sy, csp))
}

fn parse_av1_sequence_header_payload(payload: &[u8]) -> Option<Av1SeqHeaderInfo> {
    let mut br = BitReader::new(payload);
    let seq_profile = br.bits(3)? as u8;
    let _still_picture = br.bit()?;
    let reduced = br.bit()?;
    let mut seq_level_idx_0 = 0u8;
    let mut seq_tier_0 = 0u8;
    if reduced == 1 {
        seq_level_idx_0 = br.bits(5)? as u8;
    } else {
        let timing_info_present = br.bit()?;
        let mut decoder_model_info_present = false;
        let mut buffer_delay_len = 0u32;
        if timing_info_present == 1 {
            let _num_units = br.bits(32)?;
            let _time_scale = br.bits(32)?;
            if br.bit()? == 1 {
                let _ticks = br.ue()?;
            }
            decoder_model_info_present = br.bit()? == 1;
            if decoder_model_info_present {
                buffer_delay_len = br.bits(5)? + 1;
                let _num_units_dec = br.bits(32)?;
                let _removal_len = br.bits(5)?;
                let _pres_len = br.bits(5)?;
            }
        }
        let initial_display_delay_present = br.bit()? == 1;
        let op_cnt_minus_1 = br.bits(5)?;
        for op in 0..=op_cnt_minus_1 {
            let _idc = br.bits(12)?;
            let level = br.bits(5)? as u8;
            let tier = if level > 7 { br.bit()? as u8 } else { 0 };
            if op == 0 {
                seq_level_idx_0 = level;
                seq_tier_0 = tier;
            }
            if decoder_model_info_present && br.bit()? == 1 {
                let _dec_delay = br.bits(buffer_delay_len)?;
                let _enc_delay = br.bits(buffer_delay_len)?;
                let _low_delay = br.bit()?;
            }
            if initial_display_delay_present && br.bit()? == 1 {
                let _init_delay = br.bits(4)?;
            }
        }
    }
    let w_bits = br.bits(4)? + 1;
    let h_bits = br.bits(4)? + 1;
    let width = br.bits(w_bits)? + 1;
    let height = br.bits(h_bits)? + 1;
    let (
        high_bitdepth,
        twelve_bit,
        monochrome,
        subsampling_x,
        subsampling_y,
        chroma_sample_position,
    ) = parse_av1_color_config(&mut br, seq_profile, reduced).unwrap_or((0, 0, 0, 1, 1, 0));
    Some(Av1SeqHeaderInfo {
        width,
        height,
        seq_profile,
        seq_level_idx_0,
        seq_tier_0,
        high_bitdepth,
        twelve_bit,
        monochrome,
        subsampling_x,
        subsampling_y,
        chroma_sample_position,
    })
}

/// Extract a canonical `AvcC` (`av1C`) from an AV1 keyframe's in-band `OBU_SEQUENCE_HEADER`.
/// MediaMTX v1.19.3 emits a synthetic 1920x1080 `av1C` on RTMP connect; the keyframe OBU carries the true stream header.
pub(super) fn parse_av1_keyframe_seqhdr(data: &[u8]) -> Option<AvcC> {
    if !tag_is_enhanced_keyframe(data, 4) || &data[1..5] != b"av01" {
        return None;
    }
    let (seq_obu, payload) = find_av1_seq_obu(&data[5..])?;
    let info = parse_av1_sequence_header_payload(payload)?;
    let mut raw = Vec::with_capacity(4 + seq_obu.len());
    raw.push(0x81);
    raw.push(
        ((info.seq_profile & 0x07) << 5)
            | ((info.seq_tier_0 & 1) << 4)
            | (info.seq_level_idx_0 & 0x1F),
    );
    raw.push(
        ((info.high_bitdepth & 1) << 6)
            | ((info.twelve_bit & 1) << 5)
            | ((info.monochrome & 1) << 4)
            | ((info.subsampling_x & 1) << 3)
            | ((info.subsampling_y & 1) << 2)
            | (info.chroma_sample_position & 0x03),
    );
    raw.push(0x00);
    raw.extend_from_slice(seq_obu);
    parse_av1c(&raw)
}

/// Verify both the FLV keyframe nibble and an in-band IRAP NAL (`hvc1`) or OBU payload (`av01`).
pub(super) fn tag_is_enhanced_keyframe(data: &[u8], length_size: u8) -> bool {
    if !tag_is_enhanced_coded_frame(data) {
        return false;
    }
    let frame_type = (data[0] >> 4) & 0x07;
    if frame_type != 1 {
        return false;
    }
    let pkt_type = data[0] & 0x0F;
    match &data[1..5] {
        b"hvc1" => {
            let hdr_len = if pkt_type == PKT_CODED_FRAMES { 8 } else { 5 };
            each_nalu(&data[hdr_len..], length_size).iter().any(|n| {
                if n.len() < 2 {
                    return false;
                }
                let nal_type = (n[0] >> 1) & 0x3F;
                (16..=21).contains(&nal_type)
            })
        }
        b"av01" => data.len() > 5,
        _ => false,
    }
}

fn obus_have_sequence_header(obus: &[u8]) -> bool {
    let mut i = 0;
    while i < obus.len() {
        let header = obus[i];
        i += 1;
        let obu_type = (header >> 3) & 0x0F;
        if obu_type == 1 {
            return true;
        }
        let has_ext = (header >> 2) & 1 == 1;
        let has_size = (header >> 1) & 1 == 1;
        if has_ext {
            if i >= obus.len() {
                break;
            }
            i += 1;
        }
        if has_size {
            let Some((sz, used)) = read_leb128(&obus[i..]) else {
                break;
            };
            i += used + sz;
        } else {
            break;
        }
    }
    false
}

/// Reassert parameter sets (`VPS`/`SPS`/`PPS` for HEVC, `OBU_SEQUENCE_HEADER` for AV1) before a keyframe.
pub(super) fn decorate_enhanced_keyframe(data: &[u8], avcc: &AvcC) -> Vec<u8> {
    let Some(enhanced) = &avcc.enhanced else {
        return data.to_vec();
    };
    match enhanced {
        EnhancedConfig::Hevc { vps } => {
            let pkt_type = data[0] & 0x0F;
            let hdr_len = if pkt_type == PKT_CODED_FRAMES { 8 } else { 5 };
            if data.len() < hdr_len {
                return data.to_vec();
            }
            let ls = avcc.length_size as usize;
            let mut out = data[..hdr_len].to_vec();
            for set in vps.iter().chain(avcc.sps.iter()).chain(avcc.pps.iter()) {
                let len = set.len() as u32;
                out.extend_from_slice(&len.to_be_bytes()[4 - ls..]);
                out.extend_from_slice(set);
            }
            out.extend_from_slice(&data[hdr_len..]);
            out
        }
        EnhancedConfig::Av1 { config_obus } => {
            if data.len() <= 5 || config_obus.is_empty() || obus_have_sequence_header(&data[5..]) {
                return data.to_vec();
            }
            let mut out = data[..5].to_vec();
            // Keep OBU_TEMPORAL_DELIMITER first when present.
            if data[5..].starts_with(&[0x12, 0x00]) {
                out.extend_from_slice(&[0x12, 0x00]);
                out.extend_from_slice(config_obus);
                out.extend_from_slice(&data[7..]);
            } else {
                out.extend_from_slice(config_obus);
                out.extend_from_slice(&data[5..]);
            }
            out
        }
    }
}
