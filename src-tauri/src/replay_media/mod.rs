mod connection;
mod range;
mod stream;

use std::collections::HashMap;
use std::fs::File;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::Response;
use axum::Router;
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{OnceCell, Semaphore};

const MAX_GRANTS: usize = 32;
const MAX_ACTIVE_REQUESTS: usize = 8;
const MAX_REQUESTS_PER_GRANT: usize = 3;
const GRANT_IDLE_TTL: Duration = Duration::from_secs(12 * 60 * 60);

static SERVER: OnceCell<Server> = OnceCell::const_new();

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayReadStats {
    pub bytes_read: u64,
    pub requests: u64,
    pub active_requests: u64,
    /// Largest application read buffer for one request; excludes HTTP, OS and browser buffers.
    pub peak_buffered_bytes: u64,
    pub file_bytes: u64,
    pub range_requests: u64,
}

struct Grant {
    path: PathBuf,
    file: File,
    file_bytes: u64,
    last_used: Mutex<Instant>,
    revoked: AtomicBool,
    bytes_read: AtomicU64,
    requests: AtomicU64,
    active_requests: AtomicU64,
    peak_buffered_bytes: AtomicU64,
    range_requests: AtomicU64,
    slots: Arc<Semaphore>,
    connections: Mutex<HashMap<u64, Weak<connection::Control>>>,
}

impl Grant {
    fn revoke(&self) {
        self.revoked.store(true, Ordering::Release);
        let connections = self
            .connections
            .lock()
            .map(|mut connections| {
                connections
                    .drain()
                    .filter_map(|(_, connection)| connection.upgrade())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for connection in connections {
            // Wake socket I/O as well as the body: a backpressured client may never poll it again.
            connection.close();
        }
    }

    fn stats(&self) -> ReplayReadStats {
        ReplayReadStats {
            bytes_read: self.bytes_read.load(Ordering::Relaxed),
            requests: self.requests.load(Ordering::Relaxed),
            active_requests: self.active_requests.load(Ordering::Relaxed),
            peak_buffered_bytes: self.peak_buffered_bytes.load(Ordering::Relaxed),
            file_bytes: self.file_bytes,
            range_requests: self.range_requests.load(Ordering::Relaxed),
        }
    }
}

#[derive(Clone)]
struct Server {
    authority: String,
    grants: Arc<Mutex<HashMap<String, Arc<Grant>>>>,
    slots: Arc<Semaphore>,
}

impl Server {
    async fn start() -> Result<Self, String> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .map_err(|_| "Replay server could not bind to loopback")?;
        let address = listener
            .local_addr()
            .map_err(|_| "Replay server address is unavailable")?;
        let server = Self {
            authority: address.to_string(),
            grants: Arc::default(),
            slots: Arc::new(Semaphore::new(MAX_ACTIVE_REQUESTS)),
        };
        let app = Router::new().fallback(serve).with_state(server.clone());
        tokio::spawn(async move {
            if axum::serve(
                connection::ReplayListener::new(listener),
                app.into_make_service_with_connect_info::<connection::Peer>(),
            )
            .await
            .is_err()
            {
                log::warn!("Replay loopback server stopped unexpectedly");
            }
        });
        let grants = Arc::downgrade(&server.grants);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                let Some(grants) = grants.upgrade() else {
                    break;
                };
                if let Ok(mut grants) = grants.lock() {
                    prune(&mut grants);
                };
            }
        });
        Ok(server)
    }

    async fn grant(&self, path: PathBuf) -> Result<String, String> {
        let grant = tokio::task::spawn_blocking(move || {
            let path = std::fs::canonicalize(path)
                .map_err(|_| "Replay file location could not be resolved")?;
            let file = File::open(&path).map_err(|_| "Replay file could not be opened")?;
            let metadata = file
                .metadata()
                .map_err(|_| "Replay file metadata is unavailable")?;
            if !metadata.is_file() {
                return Err("Replay source is not a regular file");
            }
            Ok(Arc::new(Grant {
                path,
                file,
                file_bytes: metadata.len(),
                last_used: Mutex::new(Instant::now()),
                revoked: AtomicBool::new(false),
                bytes_read: AtomicU64::new(0),
                requests: AtomicU64::new(0),
                active_requests: AtomicU64::new(0),
                peak_buffered_bytes: AtomicU64::new(0),
                range_requests: AtomicU64::new(0),
                slots: Arc::new(Semaphore::new(MAX_REQUESTS_PER_GRANT)),
                connections: Mutex::new(HashMap::new()),
            }))
        })
        .await
        .map_err(|_| "Replay file preparation task failed")??;
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Replay access is unavailable")?;
        prune(&mut grants);
        if grants.len() >= MAX_GRANTS {
            return Err("Too many recordings are open; close another replay first".into());
        }
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        grants.insert(token.clone(), grant);
        Ok(format!("http://{}/replay/{token}", self.authority))
    }

    fn token<'a>(&self, url: &'a str) -> Option<&'a str> {
        let token = url.strip_prefix(&format!("http://{}/replay/", self.authority))?;
        valid_token(token).then_some(token)
    }

    fn find(&self, token: &str) -> Option<Arc<Grant>> {
        let mut grants = self.grants.lock().ok()?;
        prune(&mut grants);
        let grant = grants.get(token)?.clone();
        *grant.last_used.lock().ok()? = Instant::now();
        Some(grant)
    }

    fn release(&self, url: &str) {
        let Some(token) = self.token(url) else {
            return;
        };
        if let Ok(mut grants) = self.grants.lock() {
            if let Some(grant) = grants.remove(token) {
                grant.revoke();
            }
        }
    }

    fn revoke_path(&self, path: &Path) {
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Ok(mut grants) = self.grants.lock() {
            grants.retain(|_, grant| {
                if grant.path == path {
                    grant.revoke();
                    false
                } else {
                    true
                }
            });
        }
    }
}

// Authorization belongs to the command layer; the opened handle pins the authorized file identity.
pub async fn open(path: PathBuf) -> Result<String, String> {
    SERVER
        .get_or_try_init(Server::start)
        .await?
        .grant(path)
        .await
}

pub fn release(url: &str) {
    if let Some(server) = SERVER.get() {
        server.release(url);
    }
}

pub fn stats(url: &str) -> Result<ReplayReadStats, String> {
    let server = SERVER.get().ok_or("Replay server is not running")?;
    let token = server.token(url).ok_or("Invalid replay URL")?;
    server
        .find(token)
        .map(|grant| grant.stats())
        .ok_or_else(|| "Replay access has expired".into())
}

pub fn revoke_path(path: &Path) {
    if let Some(server) = SERVER.get() {
        server.revoke_path(path);
    }
}

fn prune(grants: &mut HashMap<String, Arc<Grant>>) {
    grants.retain(|_, grant| {
        let keep = grant
            .last_used
            .lock()
            .is_ok_and(|last| last.elapsed() < GRANT_IDLE_TTL);
        if !keep {
            grant.revoke();
        }
        keep
    });
}

fn valid_token(token: &str) -> bool {
    token.len() == 64 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn allowed_origin(origin: &str) -> bool {
    matches!(
        origin,
        "http://tauri.localhost" | "https://tauri.localhost" | "tauri://localhost"
    ) || cfg!(debug_assertions)
        && matches!(origin, "http://localhost:1420" | "http://127.0.0.1:1420")
}

fn trusted_headers(headers: &HeaderMap, authority: &str) -> bool {
    if headers.get_all(header::HOST).iter().count() != 1
        || headers
            .get(header::HOST)
            .and_then(|host| host.to_str().ok())
            != Some(authority)
    {
        return false;
    }
    if headers.get_all(header::ORIGIN).iter().count() > 1 {
        return false;
    }
    if let Some(origin) = headers.get(header::ORIGIN) {
        return origin.to_str().is_ok_and(allowed_origin);
    }
    if let Some(referer) = headers.get(header::REFERER) {
        let Ok(uri) = referer.to_str().unwrap_or_default().parse::<Uri>() else {
            return false;
        };
        let (Some(scheme), Some(host)) = (uri.scheme_str(), uri.authority()) else {
            return false;
        };
        return allowed_origin(&format!("{scheme}://{host}"));
    }
    // Media requests may omit Origin and Referer; the random capability remains mandatory.
    true
}

async fn serve(
    State(server): State<Server>,
    ConnectInfo(peer): ConnectInfo<connection::Peer>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !peer.address.ip().is_loopback() || !trusted_headers(&headers, &server.authority) {
        return empty(StatusCode::FORBIDDEN);
    }
    if method != Method::GET && method != Method::HEAD {
        let mut response = empty(StatusCode::METHOD_NOT_ALLOWED);
        response
            .headers_mut()
            .insert(header::ALLOW, HeaderValue::from_static("GET, HEAD"));
        return response;
    }
    let Some(token) = uri.path().strip_prefix("/replay/") else {
        return empty(StatusCode::NOT_FOUND);
    };
    if !valid_token(token) || uri.query().is_some() {
        return empty(StatusCode::NOT_FOUND);
    }
    let Some(grant) = server.find(token) else {
        return empty(StatusCode::NOT_FOUND);
    };
    grant.requests.fetch_add(1, Ordering::Relaxed);
    if headers.contains_key(header::RANGE) {
        grant.range_requests.fetch_add(1, Ordering::Relaxed);
    }
    let range_headers = if method == Method::HEAD {
        HeaderMap::new()
    } else {
        headers.clone()
    };
    let range = match range::parse(&range_headers, grant.file_bytes) {
        Ok(range) => range,
        Err(()) => {
            let mut response = empty(StatusCode::RANGE_NOT_SATISFIABLE);
            insert(
                response.headers_mut(),
                header::CONTENT_RANGE,
                format!("bytes */{}", grant.file_bytes),
            );
            return response;
        }
    };
    let body = if method == Method::HEAD || range.len == 0 {
        Body::empty()
    } else {
        let Ok(global) = server.slots.clone().try_acquire_owned() else {
            return empty(StatusCode::TOO_MANY_REQUESTS);
        };
        let Ok(local) = grant.slots.clone().try_acquire_owned() else {
            return empty(StatusCode::TOO_MANY_REQUESTS);
        };
        Body::from_stream(stream::FileStream::new(
            grant.clone(),
            range.start,
            range.len,
            global,
            local,
            peer.control,
        ))
    };
    let mut response = Response::new(body);
    *response.status_mut() = if range.partial {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let response_headers = response.headers_mut();
    response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response_headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    response_headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response_headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    response_headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    insert(
        response_headers,
        header::CONTENT_LENGTH,
        range.len.to_string(),
    );
    if range.partial {
        insert(
            response_headers,
            header::CONTENT_RANGE,
            format!(
                "bytes {}-{}/{}",
                range.start,
                range.start + range.len - 1,
                grant.file_bytes
            ),
        );
    }
    if let Some(origin) = headers.get(header::ORIGIN) {
        response_headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
        response_headers.insert(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges"),
        );
    }
    response
}

fn empty(status: StatusCode) -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = status;
    response
}

fn insert(headers: &mut HeaderMap, name: header::HeaderName, value: String) {
    headers.insert(
        name,
        HeaderValue::from_str(&value).expect("Numeric replay header is valid"),
    );
}

#[cfg(test)]
mod tests;
