use std::io::{Read, Write};

pub(super) struct FlvTag {
    pub tag_type: u8, // 8=audio, 9=video, 18=script
    pub ts: u32,      // Milliseconds: ts_ext << 24 | low24.
    pub data: Vec<u8>,
}

pub(super) struct WriteOp {
    pub tag_type: u8,
    pub ts: u32,
    pub data: Vec<u8>,
}

pub(super) fn write_preamble(w: &mut impl Write) -> std::io::Result<()> {
    // FLV v1, audio+video flags, 9-byte header, then PrevTagSize0.
    w.write_all(&[
        0x46, 0x4C, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00,
    ])
}

/// Wire layout: type, size:3, timestamp:3, timestamp extension, streamID:3, data, previous size:4.
pub(super) fn write_tag(
    w: &mut impl Write,
    tag_type: u8,
    ts: u32,
    data: &[u8],
) -> std::io::Result<()> {
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

pub(super) fn write_ops<W: Write>(w: &mut W, ops: &[WriteOp]) -> bool {
    for op in ops {
        if write_tag(w, op.tag_type, op.ts, &op.data).is_err() {
            return false;
        }
    }
    true
}

pub(super) fn read_flv_header(r: &mut impl Read) -> std::io::Result<()> {
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

pub(super) fn read_tag(r: &mut impl Read) -> std::io::Result<Option<FlvTag>> {
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

/// AVC composition offset is a signed 24-bit value in tag bytes 2..5.
pub(super) fn read_cts(data: &[u8]) -> i32 {
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

pub(super) fn tag_is_video_seqhdr(data: &[u8]) -> bool {
    data.len() >= 5 && (data[0] & 0x0F) == 7 && data[1] == 0
}

pub(super) fn tag_is_audio_seqhdr(data: &[u8]) -> bool {
    data.len() >= 2 && (data[0] >> 4) == 10 && data[1] == 0
}
