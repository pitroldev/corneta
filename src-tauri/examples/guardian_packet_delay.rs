//! Offline policy experiment only. Creates synthetic compressed-size payloads;
//! no network, OCR, video decoding, recordings or personal configuration access.
#[path = "../experiments/compressed_delay.rs"]
mod compressed_delay;
use compressed_delay::{Delay, Epoch, Gop, Output, Verdict};

fn main() {
    let epoch = Epoch {
        source: 1,
        codec: 1,
    };
    let mut delay = Delay::new(epoch, 16 * 1024 * 1024);
    let mut clear = 0;
    let mut covered = 0;
    let mut emitted_bytes = 0;
    for index in 0..60 {
        let start = index * 2000;
        delay
            .push(Gop {
                epoch,
                start_ms: start,
                end_ms: start + 2000,
                closed_idr: true,
                encoded: vec![0; 1_500_000],
            })
            .unwrap();
        let verdict = match index % 3 {
            0 => Verdict::Clear,
            1 => Verdict::Sensitive,
            _ => Verdict::Unknown,
        };
        delay.inspect(epoch, start, start + 2000, verdict);
        while let Some(output) = delay.release(start) {
            match output {
                Output::Media(gop) => {
                    clear += 1;
                    emitted_bytes += gop.encoded.len();
                }
                Output::Cover { start_ms, end_ms } => {
                    assert_eq!(end_ms - start_ms, 2000);
                    covered += 1;
                }
            }
        }
    }
    println!("OFFLINE prototype: clear_gops={clear} covered_gops={covered} emitted_bytes={emitted_bytes} retained_bytes={} high_water_bytes={}", delay.retained_bytes(), delay.high_water_bytes());
    println!("Synthetic payload accounting, NOT app RSS or a privacy/latency validation. Production Guardian is unchanged.");
}
