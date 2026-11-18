#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct SpsInfo {
    pub width: u32,
    pub height: u32,
    pub profile_idc: u8,
    pub level_idc: u8,
    pub chroma_format_idc: u32,
    pub frame_mbs_only: u8,
    pub bit_depth_luma_minus8: u32,
    pub bit_depth_chroma_minus8: u32,
    // Changed frame_num/POC bit widths invalidate resumed slices under the original SPS.
    pub log2_max_frame_num: u32,
    pub pic_order_cnt_type: u32,
    pub log2_max_pic_order_cnt_lsb: u32,
}

impl SpsInfo {
    /// Compare decoding compatibility; VUI/timing may change harmlessly after reconnecting.
    pub(super) fn semantically_eq(&self, o: &SpsInfo) -> bool {
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
pub(super) struct AvcC {
    pub sps: Vec<Vec<u8>>,
    pub pps: Vec<Vec<u8>>,
    pub length_size: u8, // lengthSizeMinusOne + 1
    pub info: SpsInfo,
    pub raw: Vec<u8>, // Original OBS avcC, re-emitted byte for byte.
}

#[derive(Clone, Debug)]
pub(super) struct Asc {
    pub bytes: Vec<u8>, // Original AAC tag body, including its FLV audio header.
    pub sample_rate: u32,
    pub channels: u8,
    pub object_type: u8,
}

impl Asc {
    pub(super) fn semantically_eq(&self, o: &Asc) -> bool {
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
pub(super) fn parse_avcc(cfg: &[u8]) -> Option<AvcC> {
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
pub(super) fn parse_asc(data: &[u8]) -> Option<Asc> {
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

pub(super) fn each_nalu(payload: &[u8], length_size: u8) -> Vec<&[u8]> {
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
pub(super) fn tag_is_idr(data: &[u8], length_size: u8) -> bool {
    if data.len() < 5 || (data[0] & 0x0F) != 7 || data[1] != 1 {
        return false;
    }
    each_nalu(&data[5..], length_size)
        .iter()
        .any(|n| !n.is_empty() && (n[0] & 0x1F) == 5)
}

/// Prefix parameter sets in-band before switching sources at an IDR.
pub(super) fn prefix_param_sets(sps: &[Vec<u8>], pps: &[Vec<u8>], length_size: u8) -> Vec<u8> {
    let ls = length_size as usize;
    let mut out = Vec::new();
    for set in sps.iter().chain(pps.iter()) {
        let len = set.len() as u32;
        out.extend_from_slice(&len.to_be_bytes()[4 - ls..]);
        out.extend_from_slice(set);
    }
    out
}

pub(super) fn seqhdr_video(avcc: &AvcC) -> Vec<u8> {
    // Preserve the original avcC exactly, including profile compatibility and High-profile extensions.
    let mut v = vec![0x17, 0x00, 0x00, 0x00, 0x00];
    v.extend_from_slice(&avcc.raw);
    v
}
