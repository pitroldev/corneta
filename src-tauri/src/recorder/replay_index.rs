use std::io::{Read, Seek, SeekFrom};

const MAX_ATOMS: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum IndexLayout {
    Ready,
    Fragmented,
    AtEnd,
}

struct Atom {
    kind: [u8; 4],
    payload: u64,
    end: u64,
}

fn atom(reader: &mut (impl Read + Seek), start: u64, limit: u64) -> Result<Atom, ()> {
    if limit.saturating_sub(start) < 8 {
        return Err(());
    }
    reader.seek(SeekFrom::Start(start)).map_err(|_| ())?;
    let mut header = [0; 8];
    reader.read_exact(&mut header).map_err(|_| ())?;
    let short_size = u32::from_be_bytes(header[..4].try_into().map_err(|_| ())?);
    let (size, header_size) = match short_size {
        0 => (limit - start, 8),
        1 => {
            if limit - start < 16 {
                return Err(());
            }
            let mut wide = [0; 8];
            reader.read_exact(&mut wide).map_err(|_| ())?;
            (u64::from_be_bytes(wide), 16)
        }
        size => (u64::from(size), 8),
    };
    let end = start.checked_add(size).ok_or(())?;
    if size < header_size || end > limit {
        return Err(());
    }
    Ok(Atom {
        kind: header[4..].try_into().map_err(|_| ())?,
        payload: start + header_size,
        end,
    })
}

fn fragmented_moov(reader: &mut (impl Read + Seek), moov: &Atom) -> Result<bool, ()> {
    let mut position = moov.payload;
    let mut movie_header = false;
    let mut track = false;
    for _ in 0..MAX_ATOMS {
        if position == moov.end {
            return if movie_header && track {
                Ok(false)
            } else {
                Err(())
            };
        }
        let child = atom(reader, position, moov.end)?;
        match &child.kind {
            b"mvex" => return Ok(true),
            b"mvhd" => movie_header = true,
            b"trak" => track = true,
            _ => {}
        }
        position = child.end;
    }
    Err(())
}

/// Skip media payloads and inspect only bounded container headers, even for multi-gigabyte files.
pub(super) fn inspect(reader: &mut (impl Read + Seek), bytes: u64) -> Result<IndexLayout, ()> {
    let mut position = 0;
    let mut movie = false;
    let mut media = false;
    let mut index_at_end = false;
    for _ in 0..MAX_ATOMS {
        if position == bytes {
            return if movie && media {
                Ok(if index_at_end {
                    IndexLayout::AtEnd
                } else {
                    IndexLayout::Ready
                })
            } else {
                Err(())
            };
        }
        let current = atom(reader, position, bytes)?;
        match &current.kind {
            b"moof" => return Ok(IndexLayout::Fragmented),
            b"moov" => {
                if movie {
                    return Err(());
                }
                if fragmented_moov(reader, &current)? {
                    return Ok(IndexLayout::Fragmented);
                }
                movie = true;
                index_at_end = media;
            }
            b"mdat" => media |= current.end > current.payload,
            _ => {}
        }
        position = current.end;
    }
    Err(())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn container(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut bytes = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
        bytes.extend(kind);
        bytes.extend(payload);
        bytes
    }

    fn moov() -> Vec<u8> {
        container(
            b"moov",
            &[container(b"mvhd", &[0; 16]), container(b"trak", &[0; 16])].concat(),
        )
    }

    fn layout(bytes: &[u8]) -> Result<IndexLayout, ()> {
        inspect(&mut Cursor::new(bytes), bytes.len() as u64)
    }

    #[test]
    fn identifies_ready_fragmented_and_trailing_indexes() {
        let media = container(b"mdat", &[1; 32]);
        assert_eq!(
            layout(&[moov(), media.clone()].concat()),
            Ok(IndexLayout::Ready)
        );
        assert_eq!(layout(&[media, moov()].concat()), Ok(IndexLayout::AtEnd));
        assert_eq!(
            layout(&container(b"moov", &container(b"mvex", &[]))),
            Ok(IndexLayout::Fragmented)
        );
        assert_eq!(
            layout(&container(b"moof", &[])),
            Ok(IndexLayout::Fragmented)
        );
    }

    #[test]
    fn rejects_truncated_overflowing_empty_and_unbounded_indexes() {
        assert_eq!(layout(&[]), Err(()));
        assert_eq!(layout(&[0; 7]), Err(()));
        assert_eq!(layout(&container(b"moov", &[])), Err(()));
        assert_eq!(layout(&[0, 0, 0, 4, b'm', b'd', b'a', b't']), Err(()));
        let mut wide = vec![0, 0, 0, 1, b'm', b'd', b'a', b't'];
        wide.extend(u64::MAX.to_be_bytes());
        assert_eq!(layout(&wide), Err(()));
        assert_eq!(
            layout(&container(b"free", &[]).repeat(MAX_ATOMS + 1)),
            Err(())
        );
    }

    struct SparseMedia {
        header: Cursor<Vec<u8>>,
        length: u64,
        read_bytes: usize,
    }

    impl Read for SparseMedia {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            let read = self.header.read(buffer)?;
            self.read_bytes += read;
            Ok(read)
        }
    }

    impl Seek for SparseMedia {
        fn seek(&mut self, seek: SeekFrom) -> std::io::Result<u64> {
            if let SeekFrom::End(offset) = seek {
                return self.header.seek(SeekFrom::Start(
                    self.length.checked_add_signed(offset).unwrap(),
                ));
            }
            self.header.seek(seek)
        }
    }

    #[test]
    fn inspects_twelve_gigabytes_without_reading_the_media_payload() {
        let mut header = moov();
        let media_bytes = 12 * 1024 * 1024 * 1024_u64;
        header.extend(1_u32.to_be_bytes());
        header.extend(b"mdat");
        header.extend(media_bytes.to_be_bytes());
        let length = header.len() as u64 - 16 + media_bytes;
        let mut file = SparseMedia {
            header: Cursor::new(header),
            length,
            read_bytes: 0,
        };
        assert_eq!(inspect(&mut file, length), Ok(IndexLayout::Ready));
        assert_eq!(file.read_bytes, 40);
    }
}
