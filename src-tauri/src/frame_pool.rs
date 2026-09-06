//! Recycle large video allocations only after the final immutable Bytes owner
//! releases them. Free capacity is bounded; startup does not preallocate delay RAM.
use bytes::Bytes;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex, Weak,
};

struct Inner {
    frame_size: usize,
    capacity: usize,
    free: Mutex<Vec<Vec<u8>>>,
    instrumented: bool,
    allocated: AtomicU64,
    reused: AtomicU64,
}

impl Drop for Inner {
    fn drop(&mut self) {
        if self.instrumented {
            log::info!(
                "perf/frame_pool: frame_bytes={} free_cap={} allocations={} reuses={}",
                self.frame_size,
                self.capacity,
                self.allocated.load(Ordering::Relaxed),
                self.reused.load(Ordering::Relaxed)
            );
        }
    }
}

#[derive(Clone)]
pub(crate) struct FramePool(Arc<Inner>);

pub(crate) struct Frame {
    bytes: Vec<u8>,
    pool: Weak<Inner>,
}

impl FramePool {
    pub(crate) fn new(frame_size: usize, capacity: usize) -> Self {
        Self(Arc::new(Inner {
            frame_size,
            capacity,
            free: Mutex::new(Vec::new()),
            instrumented: crate::queue_probe::enabled(),
            allocated: AtomicU64::new(0),
            reused: AtomicU64::new(0),
        }))
    }

    pub(crate) fn take(&self) -> Frame {
        let recycled = self.0.free.lock().unwrap().pop();
        if self.0.instrumented {
            if recycled.is_some() {
                &self.0.reused
            } else {
                &self.0.allocated
            }
            .fetch_add(1, Ordering::Relaxed);
        }
        // Never hold the recycling lock while allocating/zeroing a large frame.
        let bytes = recycled.unwrap_or_else(|| vec![0; self.0.frame_size]);
        Frame {
            bytes,
            pool: Arc::downgrade(&self.0),
        }
    }
}

impl Frame {
    pub(crate) fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.bytes
    }
    pub(crate) fn freeze(self) -> Bytes {
        Bytes::from_owner(self)
    }
}

impl AsRef<[u8]> for Frame {
    fn as_ref(&self) -> &[u8] {
        &self.bytes
    }
}

impl Drop for Frame {
    fn drop(&mut self) {
        if let Some(pool) = self.pool.upgrade() {
            if let Ok(mut free) = pool.free.lock() {
                if free.len() < pool.capacity {
                    free.push(std::mem::take(&mut self.bytes));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn last_shared_owner_controls_recycling_and_bytes_do_not_change() {
        let pool = FramePool::new(16, 2);
        let mut first = pool.take();
        first.as_mut_slice().fill(42);
        let bytes = first.freeze();
        let clone = bytes.clone();
        drop(bytes);
        let mut second = pool.take();
        second.as_mut_slice().fill(7);
        assert_eq!(clone.as_ref(), &[42; 16]);
        assert_eq!(pool.0.free.lock().unwrap().len(), 0);
        drop(clone);
        assert_eq!(pool.0.free.lock().unwrap().len(), 1);
        drop(second);
        assert_eq!(pool.0.free.lock().unwrap().len(), 2);
    }

    #[test]
    fn pool_is_bounded_and_can_die_before_its_frames() {
        let pool = FramePool::new(32, 2);
        let frames: Vec<_> = (0..20).map(|_| pool.take()).collect();
        drop(frames);
        assert_eq!(pool.0.free.lock().unwrap().len(), 2);
        let bytes = pool.take().freeze();
        drop(pool);
        assert_eq!(bytes.len(), 32);
        drop(bytes);
    }
}
