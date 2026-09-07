//! Offline policy prototype; not a publisher and not used by the app.
//!
//! The future demux/decoder adapter must prove these inputs: complete CLOSED
//! IDR GOPs, both A/V tracks, exact PTS/DTS inspection coverage and codec epochs.
//! A caller asserting those facts is not itself proof that real media is safe.
use std::collections::VecDeque;

pub const DELAY_MS: u64 = 12_000;
const MAX_GOPS: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Epoch {
    pub source: u64,
    pub codec: u64,
}

pub struct Gop {
    pub epoch: Epoch,
    pub start_ms: u64,
    pub end_ms: u64,
    pub closed_idr: bool,
    /// Encoded audio and video, with headers, sharing the same clock interval.
    pub encoded: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Unknown,
    Clear,
    Sensitive,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    EpochChanged,
    NotClosedIdr,
    InvalidClock,
    Capacity,
}

pub enum Output {
    Media(Gop),
    /// The production adapter would generate compatible cover video + silence.
    Cover {
        start_ms: u64,
        end_ms: u64,
    },
}

pub struct Delay {
    epoch: Epoch,
    cap_bytes: usize,
    bytes: usize,
    high_water: usize,
    tail: Option<u64>,
    fault: Option<Fault>,
    queue: VecDeque<(Gop, Verdict)>,
}

impl Delay {
    pub fn new(epoch: Epoch, cap_bytes: usize) -> Self {
        Self {
            epoch,
            cap_bytes,
            bytes: 0,
            high_water: 0,
            tail: None,
            fault: None,
            queue: VecDeque::new(),
        }
    }

    pub fn push(&mut self, gop: Gop) -> Result<(), Fault> {
        if let Some(fault) = self.fault {
            return Err(fault);
        }
        let fault = if gop.epoch != self.epoch {
            Some(Fault::EpochChanged)
        } else if !gop.closed_idr {
            Some(Fault::NotClosedIdr)
        } else if gop.end_ms <= gop.start_ms
            || gop.end_ms.checked_add(DELAY_MS).is_none()
            || self.tail.is_some_and(|tail| tail != gop.start_ms)
        {
            Some(Fault::InvalidClock)
        } else if gop.encoded.is_empty()
            || gop.encoded.len() > self.cap_bytes.saturating_sub(self.bytes)
            || self.queue.len() >= MAX_GOPS
        {
            Some(Fault::Capacity)
        } else {
            None
        };
        if let Some(fault) = fault {
            self.queue.clear();
            self.bytes = 0;
            self.fault = Some(fault);
            return Err(fault);
        }
        self.bytes += gop.encoded.len();
        self.high_water = self.high_water.max(self.bytes);
        self.tail = Some(gop.end_ms);
        self.queue.push_back((gop, Verdict::Unknown));
        Ok(())
    }

    /// A partial scan or a result from a previous source/codec can never clear
    /// this interval. Sensitive verdicts are monotonic until the GOP is removed.
    pub fn inspect(&mut self, epoch: Epoch, start_ms: u64, end_ms: u64, verdict: Verdict) -> bool {
        if self.fault.is_some() || epoch != self.epoch {
            return false;
        }
        let Some((_, current)) = self
            .queue
            .iter_mut()
            .find(|(gop, _)| gop.start_ms == start_ms && gop.end_ms == end_ms)
        else {
            return false;
        };
        if *current != Verdict::Sensitive {
            *current = verdict;
        }
        true
    }

    /// Conservative prototype: wait twelve seconds after the END of the GOP.
    /// This adds up to one GOP of latency; it cannot yet replace the current
    /// per-frame twelve-second pipeline with equivalent latency.
    pub fn release(&mut self, now_ms: u64) -> Option<Output> {
        let (gop, _) = self.queue.front()?;
        if self.fault.is_some() || now_ms < gop.end_ms + DELAY_MS {
            return None;
        }
        let (gop, verdict) = self.queue.pop_front()?;
        self.bytes -= gop.encoded.len();
        Some(if verdict == Verdict::Clear {
            Output::Media(gop)
        } else {
            Output::Cover {
                start_ms: gop.start_ms,
                end_ms: gop.end_ms,
            }
        })
    }

    pub fn retained_bytes(&self) -> usize {
        self.bytes
    }
    pub fn high_water_bytes(&self) -> usize {
        self.high_water
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const EPOCH: Epoch = Epoch {
        source: 1,
        codec: 1,
    };
    fn gop(start: u64) -> Gop {
        Gop {
            epoch: EPOCH,
            start_ms: start,
            end_ms: start + 2000,
            closed_idr: true,
            encoded: vec![7; 1000],
        }
    }

    #[test]
    fn never_releases_unknown_or_sensitive_original_content() {
        for verdict in [Verdict::Unknown, Verdict::Sensitive] {
            let mut delay = Delay::new(EPOCH, 4000);
            delay.push(gop(0)).unwrap();
            delay.inspect(EPOCH, 0, 2000, verdict);
            if verdict == Verdict::Sensitive {
                delay.inspect(EPOCH, 0, 2000, Verdict::Clear);
            }
            assert!(matches!(
                delay.release(14_000),
                Some(Output::Cover {
                    start_ms: 0,
                    end_ms: 2000
                })
            ));
            assert_eq!(delay.retained_bytes(), 0);
        }
    }

    #[test]
    fn exact_complete_scan_and_delay_are_both_required() {
        let mut delay = Delay::new(EPOCH, 4000);
        delay.push(gop(0)).unwrap();
        assert!(!delay.inspect(EPOCH, 0, 1000, Verdict::Clear));
        assert!(!delay.inspect(
            Epoch {
                source: 2,
                codec: 1
            },
            0,
            2000,
            Verdict::Clear
        ));
        assert!(delay.inspect(EPOCH, 0, 2000, Verdict::Clear));
        assert!(delay.release(13_999).is_none());
        let Some(Output::Media(media)) = delay.release(14_000) else {
            panic!("Expected inspected media")
        };
        assert_eq!(media.encoded, vec![7; 1000]);
    }

    #[test]
    fn overflow_and_non_idr_input_latch_closed_and_release_memory() {
        let mut delay = Delay::new(EPOCH, 1000);
        delay.push(gop(0)).unwrap();
        assert_eq!(delay.push(gop(2000)), Err(Fault::Capacity));
        assert_eq!(delay.high_water_bytes(), 1000);
        assert_eq!(delay.retained_bytes(), 0);
        assert!(delay.release(u64::MAX).is_none());
        assert_eq!(delay.push(gop(0)), Err(Fault::Capacity));
        let mut delay = Delay::new(EPOCH, 4000);
        let mut invalid = gop(0);
        invalid.closed_idr = false;
        assert_eq!(delay.push(invalid), Err(Fault::NotClosedIdr));
    }

    #[test]
    fn generation_codec_and_clock_changes_cannot_reuse_old_proof() {
        for invalid in [
            Gop {
                epoch: Epoch {
                    source: 2,
                    codec: 1,
                },
                ..gop(2000)
            },
            Gop {
                epoch: Epoch {
                    source: 1,
                    codec: 2,
                },
                ..gop(2000)
            },
            gop(1000),
            gop(3000),
        ] {
            let mut delay = Delay::new(EPOCH, 4000);
            delay.push(gop(0)).unwrap();
            delay.inspect(EPOCH, 0, 2000, Verdict::Clear);
            assert!(delay.push(invalid).is_err());
            assert!(delay.release(u64::MAX).is_none());
        }
    }
}
