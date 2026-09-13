use std::io;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};
use std::time::Duration;

use axum::extract::connect_info::Connected;
use axum::serve::{IncomingStream, Listener};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const MAX_CONNECTIONS: usize = 32;

#[derive(Default)]
pub(super) struct Control {
    closed: AtomicBool,
    reader: Mutex<Option<Waker>>,
    writer: Mutex<Option<Waker>>,
}

impl Control {
    pub fn close(&self) {
        self.closed.store(true, Ordering::Release);
        for slot in [&self.reader, &self.writer] {
            if let Ok(mut slot) = slot.lock() {
                if let Some(waker) = slot.take() {
                    waker.wake();
                }
            }
        }
    }

    fn register(&self, cx: &Context<'_>, write: bool) -> io::Result<()> {
        let slot = if write { &self.writer } else { &self.reader };
        let mut slot = slot
            .lock()
            .map_err(|_| io::Error::other("Replay connection is unavailable"))?;
        if self.closed.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionAborted,
                "Replay connection was released",
            ));
        }
        if slot
            .as_ref()
            .is_none_or(|waker| !waker.will_wake(cx.waker()))
        {
            *slot = Some(cx.waker().clone());
        }
        Ok(())
    }
}

pub(super) struct ReplayListener {
    listener: TcpListener,
    slots: Arc<Semaphore>,
}

impl ReplayListener {
    pub fn new(listener: TcpListener) -> Self {
        Self {
            listener,
            slots: Arc::new(Semaphore::new(MAX_CONNECTIONS)),
        }
    }
}

impl Listener for ReplayListener {
    type Io = ReplaySocket;
    type Addr = SocketAddr;

    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        loop {
            let permit = self
                .slots
                .clone()
                .acquire_owned()
                .await
                .expect("Replay connection semaphore remains open");
            match self.listener.accept().await {
                Ok((socket, peer)) => {
                    let _ = socket.set_nodelay(true);
                    return (
                        ReplaySocket {
                            socket,
                            control: Arc::default(),
                            _permit: permit,
                        },
                        peer,
                    );
                }
                Err(_) => {
                    drop(permit);
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.listener.local_addr()
    }
}

pub(super) struct ReplaySocket {
    socket: TcpStream,
    control: Arc<Control>,
    _permit: OwnedSemaphorePermit,
}

impl AsyncRead for ReplaySocket {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if let Err(error) = self.control.register(cx, false) {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.socket).poll_read(cx, buffer)
    }
}

impl AsyncWrite for ReplaySocket {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &[u8],
    ) -> Poll<io::Result<usize>> {
        if let Err(error) = self.control.register(cx, true) {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.socket).poll_write(cx, buffer)
    }

    fn poll_write_vectored(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffers: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        if let Err(error) = self.control.register(cx, true) {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.socket).poll_write_vectored(cx, buffers)
    }

    fn is_write_vectored(&self) -> bool {
        self.socket.is_write_vectored()
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        if let Err(error) = self.control.register(cx, true) {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.socket).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.socket).poll_shutdown(cx)
    }
}

#[derive(Clone)]
pub(super) struct Peer {
    pub address: SocketAddr,
    pub control: Arc<Control>,
}

impl Connected<IncomingStream<'_, ReplayListener>> for Peer {
    fn connect_info(stream: IncomingStream<'_, ReplayListener>) -> Self {
        Self {
            address: *stream.remote_addr(),
            control: stream.io().control.clone(),
        }
    }
}
