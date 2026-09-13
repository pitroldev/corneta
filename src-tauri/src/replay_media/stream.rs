use std::fs::File;
use std::io;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll};

use bytes::Bytes;
use futures_core::Stream;
use tokio::sync::OwnedSemaphorePermit;
use tokio::task::JoinHandle;

use super::{connection, Grant};

pub(super) const READ_BUFFER_BYTES: usize = 64 * 1024;
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

struct RequestGuard {
    grant: Arc<Grant>,
    id: u64,
    _global: OwnedSemaphorePermit,
    _local: OwnedSemaphorePermit,
}

impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Ok(mut connections) = self.grant.connections.lock() {
            connections.remove(&self.id);
        }
        self.grant.active_requests.fetch_sub(1, Ordering::Relaxed);
    }
}

pub(super) struct FileStream {
    guard: Arc<RequestGuard>,
    offset: u64,
    remaining: u64,
    pending: Option<JoinHandle<io::Result<Bytes>>>,
}

impl FileStream {
    pub fn new(
        grant: Arc<Grant>,
        offset: u64,
        remaining: u64,
        global: OwnedSemaphorePermit,
        local: OwnedSemaphorePermit,
        connection: Arc<connection::Control>,
    ) -> Self {
        grant.active_requests.fetch_add(1, Ordering::Relaxed);
        let id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut connections) = grant.connections.lock() {
            if grant.revoked.load(Ordering::Acquire) {
                connection.close();
            } else {
                connections.insert(id, Arc::downgrade(&connection));
            }
        } else {
            connection.close();
        }
        Self {
            guard: Arc::new(RequestGuard {
                grant,
                id,
                _global: global,
                _local: local,
            }),
            offset,
            remaining,
            pending: None,
        }
    }
}

impl Stream for FileStream {
    type Item = io::Result<Bytes>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.remaining == 0 {
            return Poll::Ready(None);
        }
        if self.guard.grant.revoked.load(Ordering::Acquire) {
            self.remaining = 0;
            return Poll::Ready(Some(Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Replay access was released",
            ))));
        }
        if self.pending.is_none() {
            let guard = self.guard.clone();
            let offset = self.offset;
            let len = self.remaining.min(READ_BUFFER_BYTES as u64) as usize;
            self.pending = Some(tokio::task::spawn_blocking(move || {
                if guard.grant.revoked.load(Ordering::Acquire) {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "Replay access was released",
                    ));
                }
                let mut buffer = vec![0; len];
                guard
                    .grant
                    .peak_buffered_bytes
                    .fetch_max(len as u64, Ordering::Relaxed);
                loop {
                    match read_at(&guard.grant.file, &mut buffer, offset) {
                        Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                        Err(_) => {
                            return Err(io::Error::other("Replay data could not be read"));
                        }
                        Ok(0) => {
                            return Err(io::Error::new(
                                io::ErrorKind::UnexpectedEof,
                                "Replay file changed during playback",
                            ));
                        }
                        Ok(read) => {
                            if let Ok(mut last_used) = guard.grant.last_used.lock() {
                                *last_used = std::time::Instant::now();
                            }
                            guard
                                .grant
                                .bytes_read
                                .fetch_add(read as u64, Ordering::Relaxed);
                            buffer.truncate(read);
                            return Ok(Bytes::from(buffer));
                        }
                    }
                }
            }));
        }
        let pending = self.pending.as_mut().expect("Replay read task exists");
        match std::future::Future::poll(Pin::new(pending), cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending = None;
                let result = result
                    .map_err(|_| io::Error::other("Replay read task failed"))
                    .and_then(|result| result);
                match &result {
                    Ok(bytes) => {
                        self.offset += bytes.len() as u64;
                        self.remaining -= bytes.len() as u64;
                    }
                    Err(_) => self.remaining = 0,
                }
                Poll::Ready(Some(result))
            }
        }
    }
}

impl Drop for FileStream {
    fn drop(&mut self) {
        if let Some(pending) = self.pending.take() {
            // A running disk read may finish one bounded chunk, retaining its permits until then.
            pending.abort();
        }
    }
}

#[cfg(windows)]
fn read_at(file: &File, buffer: &mut [u8], offset: u64) -> io::Result<usize> {
    use std::os::windows::fs::FileExt;
    file.seek_read(buffer, offset)
}

#[cfg(unix)]
fn read_at(file: &File, buffer: &mut [u8], offset: u64) -> io::Result<usize> {
    use std::os::unix::fs::FileExt;
    file.read_at(buffer, offset)
}
