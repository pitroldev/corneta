use super::avc::{each_nalu, parse_asc, parse_avcc, seqhdr_video, tag_is_idr, AvcC, SpsInfo};
use super::flv::{
    read_flv_header, read_tag, tag_is_audio_seqhdr, tag_is_video_seqhdr, write_ops, write_preamble,
    write_tag, FlvTag, WriteOp,
};
use super::pump::{emit_copy_video, emit_resume_idr, Clock};
use super::slate::{extract_slate_media, SLATE_FPS};

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
        let dts =
            slate_base.wrapping_add((((i + 1) as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
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
    let (obs, src, slate_flv, out) = (p("obs.flv"), p("src.mp4"), p("slate_vid.flv"), p("out.flv"));

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
        let dts =
            slate_base.wrapping_add((((i + 1) as f64) * 1000.0 / SLATE_FPS as f64).round() as u32);
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
