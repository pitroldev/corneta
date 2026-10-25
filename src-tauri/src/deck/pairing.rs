//! Pairing: a single-use QR token, a code the streamer confirms on the PC, then a device secret.
//! The vault keeps only a digest of each secret, so reading it does not let anyone pose as the phone.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use base64::Engine;
use sha2::{Digest, Sha256};

pub const TOKEN_TTL: Duration = Duration::from_secs(120);
pub const REQUEST_TTL: Duration = Duration::from_secs(120);

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).expect("OS RNG unavailable");
    bytes
}

pub fn random_secret() -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random_bytes::<32>())
}

pub fn new_device_id() -> String {
    let bytes = random_bytes::<9>();
    format!(
        "dev_{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    )
    .replace('-', "_")
}

pub fn digest(secret: &str) -> String {
    let hash = Sha256::digest(secret.as_bytes());
    hash.iter().map(|b| format!("{b:02x}")).collect()
}

/// Constant-time on the digests: the comparison time says nothing about the stored value.
pub fn verify(secret: &str, verifier: &str) -> bool {
    let candidate = digest(secret);
    candidate.len() == verifier.len()
        && candidate
            .bytes()
            .zip(verifier.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

pub fn vault_key(device_id: &str) -> String {
    format!("deck_{device_id}")
}

/// Shown on the PC and in the device list: no control characters, short enough for one line.
pub fn device_name(raw: &str, fallback: &str) -> String {
    let clean: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(32)
        .collect();
    if clean.is_empty() {
        fallback.to_string()
    } else {
        clean
    }
}

pub struct Pending {
    pub name: String,
    pub conn: u64,
    pub expires: Instant,
}

#[derive(Default)]
pub struct Pairing {
    token: Option<(String, Instant)>,
    pending: HashMap<String, Pending>,
}

impl Pairing {
    /// A new QR replaces the previous one; only its digest is kept.
    pub fn issue(&mut self, now: Instant) -> String {
        let token = random_secret();
        self.token = Some((digest(&token), now + TOKEN_TTL));
        token
    }

    /// A token works once and only before it expires.
    pub fn redeem(&mut self, token: &str, now: Instant) -> bool {
        match self.token.take() {
            Some((stored, expires)) if now < expires && verify(token, &stored) => true,
            Some(other) if now < other.1 => {
                self.token = Some(other);
                false
            }
            _ => false,
        }
    }

    pub fn request(&mut self, name: String, conn: u64, now: Instant) -> (String, String) {
        let id = random_secret();
        let n = u16::from_le_bytes(random_bytes::<2>()) % 9000 + 1000;
        let code = n.to_string();
        self.pending.insert(
            id.clone(),
            Pending {
                name,
                conn,
                expires: now + REQUEST_TTL,
            },
        );
        (id, code)
    }

    pub fn take(&mut self, id: &str) -> Option<Pending> {
        self.pending.remove(id)
    }

    pub fn expire(&mut self, now: Instant) -> Vec<(String, Pending)> {
        let gone: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, p)| now >= p.expires)
            .map(|(id, _)| id.clone())
            .collect();
        gone.into_iter()
            .filter_map(|id| self.pending.remove(&id).map(|p| (id, p)))
            .collect()
    }

    /// Requests from a phone that closed the page.
    pub fn drop_conn(&mut self, conn: u64) -> Vec<String> {
        let gone: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, p)| p.conn == conn)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &gone {
            self.pending.remove(id);
        }
        gone
    }

    #[cfg(test)]
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_qr_token_works_once_and_only_while_fresh() {
        let now = Instant::now();
        let mut pairing = Pairing::default();
        let token = pairing.issue(now);
        assert!(!pairing.redeem("wrong", now));
        assert!(
            pairing.redeem(&token, now),
            "a wrong guess must not burn the token"
        );
        assert!(!pairing.redeem(&token, now), "single use");
        let token = pairing.issue(now);
        assert!(!pairing.redeem(&token, now + TOKEN_TTL));
        let first = pairing.issue(now);
        let _second = pairing.issue(now);
        assert!(
            !pairing.redeem(&first, now),
            "a new QR replaces the old one"
        );
    }

    #[test]
    fn requests_expire_and_leave_with_their_phone() {
        let now = Instant::now();
        let mut pairing = Pairing::default();
        let (a, code) = pairing.request("iPhone".into(), 1, now);
        assert_eq!(code.len(), 4);
        let (b, _) = pairing.request("Galaxy".into(), 2, now + Duration::from_secs(60));
        let expired = pairing.expire(now + REQUEST_TTL);
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].0, a);
        assert_eq!(pairing.drop_conn(2), vec![b.clone()]);
        assert!(pairing.take(&b).is_none());
        assert_eq!(pairing.pending_count(), 0);
    }

    #[test]
    fn secrets_are_checked_against_a_digest() {
        let secret = random_secret();
        assert_eq!(secret.len(), 43);
        let verifier = digest(&secret);
        assert_ne!(verifier, secret);
        assert!(verify(&secret, &verifier));
        assert!(!verify("other", &verifier));
        assert!(!verify(&secret, "short"));
        let id = new_device_id();
        assert!(id.starts_with("dev_") && id.len() == 16, "{id}");
        assert!(id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_'));
    }

    #[test]
    fn device_names_are_one_short_line() {
        assert_eq!(
            device_name("  iPhone\n do  Petro\u{7} ", "Celular"),
            "iPhone do Petro"
        );
        assert_eq!(device_name("   ", "Celular"), "Celular");
        assert_eq!(device_name(&"x".repeat(80), "Celular").len(), 32);
    }
}
