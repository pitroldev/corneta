//! Optional, local-only queue diagnostics. No payloads, URLs or user content.
//! Counts include the producer blocked in send (channel capacity + one).
use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    Arc, OnceLock,
};
use std::time::Instant;

pub(crate) fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("CORNETA_PERF_QUEUES").is_ok_and(|value| value == "1"))
}

struct Stats {
    name: &'static str,
    queued: AtomicUsize,
    high_water: AtomicUsize,
    count: AtomicU64,
    // Log2 microsecond bins: fixed memory regardless of live duration.
    ages: [AtomicU64; 32],
}

impl Drop for Stats {
    fn drop(&mut self) {
        let count = self.count.load(Ordering::Relaxed);
        let percentile = |percent: u64| {
            if count == 0 {
                return 0.0;
            }
            let threshold = count.saturating_mul(percent).div_ceil(100);
            let mut sum = 0;
            for (index, bucket) in self.ages.iter().enumerate() {
                sum += bucket.load(Ordering::Relaxed);
                if sum >= threshold {
                    return ((1u64 << (index + 1)) - 1) as f64 / 1000.0;
                }
            }
            0.0
        };
        log::info!(
            "perf/queue {}: items={} high_water={} age_p95_upper_ms={:.3} age_p99_upper_ms={:.3}",
            self.name,
            count,
            self.high_water.load(Ordering::Relaxed),
            percentile(95),
            percentile(99)
        );
    }
}

#[derive(Clone)]
pub(crate) struct QueueProbe(Option<Arc<Stats>>);

pub(crate) struct Ticket {
    stats: Arc<Stats>,
    since: Instant,
}
pub(crate) struct Timed<T> {
    pub value: T,
    _ticket: Option<Ticket>,
}

impl<T> Timed<T> {
    pub(crate) fn into_inner(self) -> T {
        drop(self._ticket);
        self.value
    }
}

impl QueueProbe {
    pub(crate) fn new(name: &'static str) -> Self {
        Self(enabled().then(|| {
            Arc::new(Stats {
                name,
                queued: AtomicUsize::new(0),
                high_water: AtomicUsize::new(0),
                count: AtomicU64::new(0),
                ages: std::array::from_fn(|_| AtomicU64::new(0)),
            })
        }))
    }
    pub(crate) fn track<T>(&self, value: T) -> Timed<T> {
        let ticket = self.0.as_ref().map(|stats| {
            let queued = stats.queued.fetch_add(1, Ordering::Relaxed) + 1;
            stats.high_water.fetch_max(queued, Ordering::Relaxed);
            Ticket {
                stats: stats.clone(),
                since: Instant::now(),
            }
        });
        Timed {
            value,
            _ticket: ticket,
        }
    }
}

impl Drop for Ticket {
    fn drop(&mut self) {
        let micros = self.since.elapsed().as_micros().min(u64::MAX as u128) as u64;
        let bucket = micros.max(1).ilog2().min(31) as usize;
        self.stats.ages[bucket].fetch_add(1, Ordering::Relaxed);
        self.stats.count.fetch_add(1, Ordering::Relaxed);
        self.stats.queued.fetch_sub(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_accounting_includes_dropped_and_consumed_items() {
        let stats = Arc::new(Stats {
            name: "test",
            queued: AtomicUsize::new(0),
            high_water: AtomicUsize::new(0),
            count: AtomicU64::new(0),
            ages: std::array::from_fn(|_| AtomicU64::new(0)),
        });
        let probe = QueueProbe(Some(stats.clone()));
        let first = probe.track(7);
        let second = probe.track(9);
        assert_eq!(first.value, 7);
        drop(first);
        drop(second);
        assert_eq!(stats.queued.load(Ordering::Relaxed), 0);
        assert_eq!(stats.high_water.load(Ordering::Relaxed), 2);
        assert_eq!(stats.count.load(Ordering::Relaxed), 2);
    }
}
