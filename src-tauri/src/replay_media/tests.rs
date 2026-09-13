use std::io::{Seek, SeekFrom, Write};
use std::sync::atomic::Ordering;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use super::*;

const LARGE_FILE_BYTES: u64 = 12 * 1024 * 1024 * 1024;

struct Fixture(PathBuf);

impl Fixture {
    fn new(size: u64) -> Self {
        let root =
            std::env::temp_dir().join(format!("corneta-replay-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).expect("Create isolated replay fixture directory");
        let path = root.join("synthetic.mp4");
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .expect("Create synthetic recording");
        if size > 1024 * 1024 {
            mark_sparse(&file);
        }
        file.set_len(size).expect("Set synthetic recording size");
        if size >= 8 {
            file.write_all(b"headTEST").unwrap();
            file.seek(SeekFrom::End(-8)).unwrap();
            file.write_all(b"tailTEST").unwrap();
        }
        Self(path)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        let _ = std::fs::remove_dir(self.0.parent().unwrap());
    }
}

#[cfg(windows)]
fn mark_sparse(file: &File) {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Ioctl::FSCTL_SET_SPARSE;
    use windows::Win32::System::IO::DeviceIoControl;

    let mut returned = 0;
    // SAFETY: the live file owns this handle; the synchronous call uses a valid output counter.
    unsafe {
        DeviceIoControl(
            HANDLE(file.as_raw_handle()),
            FSCTL_SET_SPARSE,
            None,
            0,
            None,
            0,
            Some(&mut returned),
            None,
        )
    }
    .expect("Synthetic large-file tests require sparse-file support");
}

#[cfg(unix)]
fn mark_sparse(_file: &File) {}

struct Reply {
    status: u16,
    headers: HashMap<String, String>,
    body: BufReader<TcpStream>,
}

async fn request(server: &Server, path: &str, method: &str, extra: &str) -> Reply {
    let mut socket = TcpStream::connect(&server.authority).await.unwrap();
    socket
        .write_all(
            format!(
                "{method} {path} HTTP/1.1\r\nHost: {}\r\n{extra}Connection: close\r\n\r\n",
                server.authority
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    receive(BufReader::new(socket)).await
}

async fn receive(mut body: BufReader<TcpStream>) -> Reply {
    let mut line = String::new();
    body.read_line(&mut line).await.unwrap();
    let status = line.split_whitespace().nth(1).unwrap().parse().unwrap();
    let mut headers = HashMap::new();
    loop {
        line.clear();
        body.read_line(&mut line).await.unwrap();
        if line == "\r\n" {
            break;
        }
        let (name, value) = line.trim_end().split_once(':').unwrap();
        headers.insert(name.to_ascii_lowercase(), value.trim().to_owned());
    }
    Reply {
        status,
        headers,
        body,
    }
}

fn route(server: &Server, url: &str) -> String {
    format!("/replay/{}", server.token(url).unwrap())
}

fn grant_for(server: &Server, url: &str) -> Arc<Grant> {
    server.find(server.token(url).unwrap()).unwrap()
}

async fn drained(grant: &Grant) {
    tokio::time::timeout(Duration::from_secs(5), async {
        while grant.active_requests.load(Ordering::Relaxed) != 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("Disconnected replay requests release their read permits");
}

#[test]
fn byte_ranges_preserve_large_offsets_and_http_bounds() {
    let cases = [
        ("bytes=0-7", Some((0, 8, true))),
        ("bytes=4294967296-4294967303", Some((4294967296, 8, true))),
        ("bytes=-8", Some((LARGE_FILE_BYTES - 8, 8, true))),
        ("bytes=12884901880-", Some((LARGE_FILE_BYTES - 8, 8, true))),
        (
            "bytes=12884901880-99999999999",
            Some((LARGE_FILE_BYTES - 8, 8, true)),
        ),
        ("bytes=-99999999999", Some((0, LARGE_FILE_BYTES, true))),
        ("bytes=0-0,8-9", Some((0, LARGE_FILE_BYTES, false))),
        ("items=0-7", Some((0, LARGE_FILE_BYTES, false))),
        ("bytes=12884901888-", None),
        ("bytes=9-8", None),
        ("bytes=-0", None),
        ("bytes=+1-2", None),
        ("bytes=18446744073709551616-", None),
        ("bytes=nope", None),
    ];
    for (input, expected) in cases {
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_str(input).unwrap());
        let actual = range::parse(&headers, LARGE_FILE_BYTES)
            .ok()
            .map(|range| (range.start, range.len, range.partial));
        assert_eq!(
            actual, expected,
            "Unexpected byte range interpretation: {input}"
        );
    }
}

#[tokio::test]
async fn large_head_and_tail_ranges_read_only_requested_bytes() {
    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let path = route(&server, &url);
    let grant = grant_for(&server, &url);

    let mut head = request(&server, &path, "HEAD", "Range: bytes=0-7\r\n").await;
    assert_eq!(
        head.status, 200,
        "HEAD ignores Range and never reads file bytes"
    );
    assert_eq!(head.headers["content-length"], LARGE_FILE_BYTES.to_string());
    let mut body = Vec::new();
    head.body.read_to_end(&mut body).await.unwrap();
    assert!(body.is_empty());
    assert_eq!(grant.stats().bytes_read, 0);

    for (range, expected, start) in [
        ("bytes=0-7", b"headTEST", 0),
        ("bytes=-8", b"tailTEST", LARGE_FILE_BYTES - 8),
    ] {
        let mut response = request(&server, &path, "GET", &format!("Range: {range}\r\n")).await;
        assert_eq!(response.status, 206);
        assert_eq!(response.headers["content-length"], "8");
        assert_eq!(
            response.headers["content-range"],
            format!("bytes {start}-{}/{LARGE_FILE_BYTES}", start + 7)
        );
        let mut body = Vec::new();
        response.body.read_to_end(&mut body).await.unwrap();
        assert_eq!(body, expected);
    }
    drained(&grant).await;
    assert_eq!(grant.stats().bytes_read, 16);
    assert_eq!(grant.stats().file_bytes, LARGE_FILE_BYTES);
    assert_eq!(grant.stats().peak_buffered_bytes, 8);
    server.release(&url);
}

#[tokio::test]
async fn no_range_starts_a_12_gib_response_without_reading_the_whole_file() {
    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let grant = grant_for(&server, &url);
    let mut response = tokio::time::timeout(
        Duration::from_secs(5),
        request(&server, &route(&server, &url), "GET", ""),
    )
    .await
    .expect("A large replay starts responding without a whole-file scan");
    assert_eq!(response.status, 200);
    assert_eq!(
        response.headers["content-length"],
        LARGE_FILE_BYTES.to_string()
    );
    assert!(!response.headers.contains_key("content-range"));
    let mut first = [0; 8];
    response.body.read_exact(&mut first).await.unwrap();
    assert_eq!(&first, b"headTEST");
    drop(response);
    drained(&grant).await;
    let stats = grant.stats();
    assert!(
        stats.bytes_read < 32 * 1024 * 1024,
        "Disconnect must stop disk reads after bounded socket read-ahead, read {} bytes",
        stats.bytes_read
    );
    assert_eq!(stats.peak_buffered_bytes, stream::READ_BUFFER_BYTES as u64);
    assert_eq!(stats.range_requests, 0);
    let stopped_at = stats.bytes_read;
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(grant.stats().bytes_read, stopped_at);
    server.release(&url);
}

#[tokio::test]
async fn malformed_or_unsatisfiable_ranges_do_not_read_media() {
    let fixture = Fixture::new(16);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let grant = grant_for(&server, &url);
    for range in ["bytes=16-", "bytes=-0", "bytes=invalid"] {
        let response = request(
            &server,
            &route(&server, &url),
            "GET",
            &format!("Range: {range}\r\n"),
        )
        .await;
        assert_eq!(response.status, 416);
        assert_eq!(response.headers["content-range"], "bytes */16");
    }
    assert_eq!(grant.stats().bytes_read, 0);
    server.release(&url);
}

#[tokio::test]
async fn capability_urls_reject_external_origins_traversal_and_revoked_access() {
    let fixture = Fixture::new(16);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let path = route(&server, &url);
    for extra in [
        "Origin: https://evil.example\r\n",
        "Origin: null\r\n",
        "Origin: http://tauri.localhost.evil.example\r\n",
        "Referer: https://evil.example/player\r\n",
        "Host: attacker.example\r\n",
    ] {
        let response = request(&server, &path, "GET", extra).await;
        assert!(
            matches!(response.status, 400 | 403),
            "Unexpected response for rejected request: {}",
            response.status
        );
    }
    for path in [
        "/replay/../../secret.mp4",
        "/replay/%2e%2e%2fsecret",
        "/replay/guess",
        "/replay/0000000000000000000000000000000000000000000000000000000000000000",
    ] {
        assert_eq!(request(&server, path, "GET", "").await.status, 404);
    }
    let response = request(&server, &path, "HEAD", "Origin: http://tauri.localhost\r\n").await;
    assert_eq!(response.status, 200);
    assert_eq!(
        response.headers["access-control-allow-origin"],
        "http://tauri.localhost"
    );
    assert_eq!(request(&server, &path, "POST", "").await.status, 405);
    let grant = grant_for(&server, &url);
    server.release(&format!("{url}?invalid"));
    assert!(!grant.revoked.load(Ordering::Acquire));
    server.release(&url);
    assert!(grant.revoked.load(Ordering::Acquire));
    assert_eq!(request(&server, &path, "GET", "").await.status, 404);
    assert_eq!(grant.stats().bytes_read, 0);
}

#[tokio::test]
async fn grant_count_is_bounded_and_idle_access_expires() {
    let fixture = Fixture::new(16);
    let server = Server::start().await.unwrap();
    let mut urls = Vec::new();
    for _ in 0..MAX_GRANTS {
        urls.push(server.grant(fixture.0.clone()).await.unwrap());
    }
    assert!(server.grant(fixture.0.clone()).await.is_err());
    let first = grant_for(&server, &urls[0]);
    *first.last_used.lock().unwrap() = Instant::now() - GRANT_IDLE_TTL - Duration::from_secs(1);
    assert!(server.find(server.token(&urls[0]).unwrap()).is_none());
    assert!(first.revoked.load(Ordering::Acquire));
    let replacement = server.grant(fixture.0.clone()).await.unwrap();
    assert_ne!(replacement, urls[0]);
    for url in urls {
        server.release(&url);
    }
    server.release(&replacement);
}

#[tokio::test]
async fn empty_files_return_zero_length_without_attempting_reads() {
    let fixture = Fixture::new(0);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let response = request(&server, &route(&server, &url), "GET", "").await;
    assert_eq!(response.status, 200);
    assert_eq!(response.headers["content-length"], "0");
    let response = request(&server, &route(&server, &url), "GET", "Range: bytes=0-\r\n").await;
    assert_eq!(response.status, 416);
    assert_eq!(grant_for(&server, &url).stats().bytes_read, 0);
    server.release(&url);
}

#[tokio::test]
async fn concurrent_ranges_do_not_share_a_sequential_file_cursor() {
    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let path = route(&server, &url);
    for _ in 0..16 {
        let (mut head, mut tail) = tokio::join!(
            request(&server, &path, "GET", "Range: bytes=0-7\r\n"),
            request(&server, &path, "GET", "Range: bytes=-8\r\n")
        );
        let mut first = [0; 8];
        let mut last = [0; 8];
        head.body.read_exact(&mut first).await.unwrap();
        tail.body.read_exact(&mut last).await.unwrap();
        assert_eq!(&first, b"headTEST");
        assert_eq!(&last, b"tailTEST");
    }
    server.release(&url);
}

#[tokio::test]
async fn releasing_access_stops_the_stream_before_another_read() {
    use futures_core::Stream;
    use std::future::poll_fn;

    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let grant = grant_for(&server, &url);
    let global = server.slots.clone().try_acquire_owned().unwrap();
    let local = grant.slots.clone().try_acquire_owned().unwrap();
    let mut body = Box::pin(stream::FileStream::new(
        grant.clone(),
        0,
        LARGE_FILE_BYTES,
        global,
        local,
        Arc::default(),
    ));
    let first = poll_fn(|cx| body.as_mut().poll_next(cx))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(first.len(), stream::READ_BUFFER_BYTES);
    assert_eq!(grant.stats().bytes_read, stream::READ_BUFFER_BYTES as u64);
    server.release(&url);
    let next = poll_fn(|cx| body.as_mut().poll_next(cx)).await.unwrap();
    assert_eq!(
        next.unwrap_err().kind(),
        std::io::ErrorKind::PermissionDenied
    );
    assert!(poll_fn(|cx| body.as_mut().poll_next(cx)).await.is_none());
    drop(body);
    drained(&grant).await;
    assert_eq!(grant.stats().bytes_read, stream::READ_BUFFER_BYTES as u64);
    assert_eq!(server.slots.available_permits(), MAX_ACTIVE_REQUESTS);
}

#[tokio::test]
async fn simultaneous_read_limits_fail_fast_without_disk_reads() {
    let fixture = Fixture::new(16);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let grant = grant_for(&server, &url);
    let local = grant
        .slots
        .clone()
        .acquire_many_owned(MAX_REQUESTS_PER_GRANT as u32)
        .await
        .unwrap();
    let response = request(&server, &route(&server, &url), "GET", "").await;
    assert_eq!(response.status, 429);
    assert_eq!(grant.stats().bytes_read, 0);
    drop(local);
    let global = server
        .slots
        .clone()
        .acquire_many_owned(MAX_ACTIVE_REQUESTS as u32)
        .await
        .unwrap();
    let response = request(&server, &route(&server, &url), "GET", "").await;
    assert_eq!(response.status, 429);
    assert_eq!(grant.stats().bytes_read, 0);
    drop(global);
    server.release(&url);
}

#[tokio::test]
async fn replacement_of_a_path_does_not_change_an_open_capability() {
    let fixture = Fixture::new(16);
    let server = Server::start().await.unwrap();
    let url = server.grant(fixture.0.clone()).await.unwrap();
    let replacement = fixture.0.with_extension("replacement.mp4");
    std::fs::write(&replacement, b"new file content").unwrap();
    std::fs::rename(&replacement, &fixture.0).unwrap();
    let mut response = request(
        &server,
        &route(&server, &url),
        "GET",
        "Range: bytes=0-7\r\n",
    )
    .await;
    let mut first = [0; 8];
    response.body.read_exact(&mut first).await.unwrap();
    assert_eq!(
        &first, b"headTEST",
        "A capability remains pinned to its originally authorized file"
    );
    server.release(&url);
}

#[test]
fn host_and_origin_allowlists_match_complete_authorities() {
    let mut headers = HeaderMap::new();
    headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:1234"));
    assert!(trusted_headers(&headers, "127.0.0.1:1234"));
    assert!(!trusted_headers(&headers, "127.0.0.1:12345"));
    for origin in [
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost",
    ] {
        headers.insert(header::ORIGIN, HeaderValue::from_static(origin));
        assert!(trusted_headers(&headers, "127.0.0.1:1234"));
    }
    for origin in [
        "http://localhost:9999",
        "http://tauri.localhost:80",
        "http://tauri.localhost/",
        "https://corneta.live",
        "null",
    ] {
        headers.insert(header::ORIGIN, HeaderValue::from_static(origin));
        assert!(!trusted_headers(&headers, "127.0.0.1:1234"));
    }
    headers.insert(
        header::ORIGIN,
        HeaderValue::from_static("http://localhost:1420"),
    );
    assert_eq!(
        trusted_headers(&headers, "127.0.0.1:1234"),
        cfg!(debug_assertions)
    );
}

#[tokio::test]
async fn revocation_frees_backpressured_slots_and_files_while_clients_keep_sockets_open() {
    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    for revoke_path in [false, true] {
        let mut clients = Vec::new();
        let mut urls = Vec::new();
        let mut grants = Vec::new();
        for _ in 0..MAX_ACTIVE_REQUESTS {
            let url = server.grant(fixture.0.clone()).await.unwrap();
            grants.push(Arc::downgrade(&grant_for(&server, &url)));
            let response = request(&server, &route(&server, &url), "GET", "").await;
            assert_eq!(response.status, 200);
            clients.push(response);
            urls.push(url);
        }
        assert_eq!(server.slots.available_permits(), 0);
        let read_bytes = || {
            grants
                .iter()
                .filter_map(Weak::upgrade)
                .map(|grant| grant.stats().bytes_read)
                .sum::<u64>()
        };
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let before = read_bytes();
                tokio::time::sleep(Duration::from_millis(100)).await;
                if before > 0 && read_bytes() == before {
                    break;
                }
            }
        })
        .await
        .expect("Unread clients eventually backpressure bounded socket buffers");

        if revoke_path {
            server.revoke_path(&fixture.0);
        } else {
            for url in &urls {
                server.release(url);
            }
        }
        tokio::time::timeout(Duration::from_secs(5), async {
            while server.slots.available_permits() != MAX_ACTIVE_REQUESTS
                || grants.iter().any(|grant| grant.strong_count() != 0)
            {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await.expect("Revocation closes stalled responses and frees their file handles without client activity");
        assert_eq!(
            clients.len(),
            MAX_ACTIVE_REQUESTS,
            "Clients remained connected and unread until native resources were freed"
        );
        let fresh = server.grant(fixture.0.clone()).await.unwrap();
        let response = request(
            &server,
            &route(&server, &fresh),
            "GET",
            "Range: bytes=0-7\r\n",
        )
        .await;
        assert_eq!(
            response.status, 206,
            "New playback is not starved by released clients"
        );
        server.release(&fresh);
        drop(clients);
    }
}

#[tokio::test]
async fn releasing_a_completed_grant_does_not_abort_a_reused_connection() {
    let fixture = Fixture::new(LARGE_FILE_BYTES);
    let server = Server::start().await.unwrap();
    let first = server.grant(fixture.0.clone()).await.unwrap();
    let second = server.grant(fixture.0.clone()).await.unwrap();
    let first_grant = grant_for(&server, &first);
    let second_grant = grant_for(&server, &second);
    let mut socket = TcpStream::connect(&server.authority).await.unwrap();
    socket
        .write_all(
            format!(
                "GET {} HTTP/1.1\r\nHost: {}\r\nRange: bytes=0-7\r\n\r\n",
                route(&server, &first),
                server.authority
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut response = receive(BufReader::new(socket)).await;
    assert_eq!(response.status, 206);
    let mut bytes = [0; 8];
    response.body.read_exact(&mut bytes).await.unwrap();
    drained(&first_grant).await;
    response
        .body
        .get_mut()
        .write_all(
            format!(
                "GET {} HTTP/1.1\r\nHost: {}\r\n\r\n",
                route(&server, &second),
                server.authority
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let response = receive(response.body).await;
    assert_eq!(response.status, 200);
    server.release(&first);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(
        second_grant.stats().active_requests,
        1,
        "A completed grant cannot cancel a different replay on the same keepalive connection"
    );
    server.release(&second);
    drained(&second_grant).await;
    drop(response);
}
