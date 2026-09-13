use axum::http::{header, HeaderMap};

#[derive(Debug, PartialEq)]
pub(super) struct ByteRange {
    pub start: u64,
    pub len: u64,
    pub partial: bool,
}

pub(super) fn parse(headers: &HeaderMap, size: u64) -> Result<ByteRange, ()> {
    let whole = ByteRange {
        start: 0,
        len: size,
        partial: false,
    };
    let Some(value) = headers.get(header::RANGE) else {
        return Ok(whole);
    };
    // No validators are advertised, so an If-Range condition cannot match.
    if headers.contains_key(header::IF_RANGE) {
        return Ok(whole);
    }
    let raw = value.to_str().map_err(|_| ())?;
    let Some(bytes) = raw.strip_prefix("bytes=") else {
        return Ok(whole);
    };
    // RFC 9110 permits ignoring Range; multipart responses are unnecessary for the player.
    if bytes.contains(',') {
        return Ok(whole);
    }
    let (start, end) = bytes.trim().split_once('-').ok_or(())?;
    if size == 0 {
        return Err(());
    }
    let (start, end) = if start.is_empty() {
        let suffix = number(end)?;
        if suffix == 0 {
            return Err(());
        }
        (size.saturating_sub(suffix), size - 1)
    } else {
        let start = number(start)?;
        let end = if end.is_empty() {
            size - 1
        } else {
            number(end)?.min(size - 1)
        };
        if start >= size || end < start {
            return Err(());
        }
        (start, end)
    };
    Ok(ByteRange {
        start,
        len: end - start + 1,
        partial: true,
    })
}

fn number(value: &str) -> Result<u64, ()> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(());
    }
    value.parse().map_err(|_| ())
}
