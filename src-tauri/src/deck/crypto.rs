//! Application-layer session encryption for the LAN phone deck.
//!
//! Browsers on plain HTTP LAN addresses (`http://192.168.x.x`) do not expose
//! `window.crypto.subtle`, so Deck sessions use an explicit ephemeral X25519 +
//! HKDF-SHA256 + ChaCha20-Poly1305 channel that runs in both Rust (`ring`) and
//! pure TypeScript without requiring TLS or WebCrypto.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, CHACHA20_POLY1305};
use ring::agreement::{self, EphemeralPrivateKey, UnparsedPublicKey, X25519};
use ring::hkdf::{self, HKDF_SHA256};
use ring::rand::SystemRandom;
use serde::{Deserialize, Serialize};

pub const PAIR_INFO: &[u8] = b"corneta-deck-pair-v2";
pub const SESSION_INFO: &[u8] = b"corneta-deck-session-v2";
const MAX_SAFE_SEQ: u64 = (1u64 << 53) - 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptoError {
    Rng,
    KeyExchange,
    Kdf,
    InvalidEncoding,
    InvalidFrame,
    ReplayOrOrder,
    AuthFailed,
    NonceExhausted,
}

#[derive(Serialize, Deserialize)]
struct WireFrame {
    e: u8,
    n: u64,
    ct: String,
}

pub struct EphemeralKeyPair {
    private: EphemeralPrivateKey,
    pub public: [u8; 32],
}

impl EphemeralKeyPair {
    pub fn generate() -> Result<Self, CryptoError> {
        let rng = SystemRandom::new();
        let private = EphemeralPrivateKey::generate(&X25519, &rng).map_err(|_| CryptoError::Rng)?;
        let pub_bytes = private
            .compute_public_key()
            .map_err(|_| CryptoError::KeyExchange)?;
        let public: [u8; 32] = pub_bytes
            .as_ref()
            .try_into()
            .map_err(|_| CryptoError::KeyExchange)?;
        Ok(Self { private, public })
    }

    pub fn agree(self, peer_public: &[u8; 32]) -> Result<[u8; 32], CryptoError> {
        let peer = UnparsedPublicKey::new(&X25519, peer_public);
        agreement::agree_ephemeral(self.private, &peer, |shared| {
            let mut out = [0u8; 32];
            out.copy_from_slice(shared);
            out
        })
        .map_err(|_| CryptoError::KeyExchange)
    }
}

struct OutputLen(usize);

impl hkdf::KeyType for OutputLen {
    fn len(&self) -> usize {
        self.0
    }
}

/// Derives `(c2s_key, s2c_key)` from the X25519 shared secret, the shared
/// authentication secret (QR token or long-term device key), and both ephemeral
/// public keys.
pub fn derive_direction_keys(
    shared: &[u8; 32],
    auth_secret: &[u8],
    client_pub: &[u8; 32],
    server_pub: &[u8; 32],
    info: &[u8],
) -> Result<([u8; 32], [u8; 32]), CryptoError> {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(client_pub);
    salt[32..].copy_from_slice(server_pub);

    let mut ikm = Vec::with_capacity(32 + auth_secret.len());
    ikm.extend_from_slice(shared);
    ikm.extend_from_slice(auth_secret);

    let prk = hkdf::Salt::new(HKDF_SHA256, &salt).extract(&ikm);
    let info_slice = [info];
    let okm = prk
        .expand(&info_slice, OutputLen(64))
        .map_err(|_| CryptoError::Kdf)?;
    let mut material = [0u8; 64];
    okm.fill(&mut material).map_err(|_| CryptoError::Kdf)?;

    let mut c2s = [0u8; 32];
    let mut s2c = [0u8; 32];
    c2s.copy_from_slice(&material[..32]);
    s2c.copy_from_slice(&material[32..]);
    Ok((c2s, s2c))
}

pub fn decode_key_32(b64: &str) -> Result<[u8; 32], CryptoError> {
    let raw = URL_SAFE_NO_PAD
        .decode(b64.as_bytes())
        .map_err(|_| CryptoError::InvalidEncoding)?;
    raw.try_into().map_err(|_| CryptoError::InvalidEncoding)
}

pub fn encode_b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn make_nonce(seq: u64) -> Nonce {
    let mut raw = [0u8; 12];
    raw[4..12].copy_from_slice(&seq.to_be_bytes());
    Nonce::assume_unique_for_key(raw)
}

fn make_aad(dir: &str, seq: u64) -> String {
    format!("corneta-deck-v2:{dir}:{seq}")
}

/// Stateful directional ChaCha20-Poly1305 session with strict monotonic counters.
pub struct DeckCipher {
    tx_key: LessSafeKey,
    rx_key: LessSafeKey,
    tx_dir: &'static str,
    rx_dir: &'static str,
    tx_seq: u64,
    rx_seq: u64,
}

impl DeckCipher {
    pub fn for_server(c2s: &[u8; 32], s2c: &[u8; 32]) -> Result<Self, CryptoError> {
        Ok(Self {
            tx_key: LessSafeKey::new(
                UnboundKey::new(&CHACHA20_POLY1305, s2c).map_err(|_| CryptoError::Kdf)?,
            ),
            rx_key: LessSafeKey::new(
                UnboundKey::new(&CHACHA20_POLY1305, c2s).map_err(|_| CryptoError::Kdf)?,
            ),
            tx_dir: "s2c",
            rx_dir: "c2s",
            tx_seq: 0,
            rx_seq: 0,
        })
    }

    #[cfg(test)]
    pub fn for_client(c2s: &[u8; 32], s2c: &[u8; 32]) -> Result<Self, CryptoError> {
        Ok(Self {
            tx_key: LessSafeKey::new(
                UnboundKey::new(&CHACHA20_POLY1305, c2s).map_err(|_| CryptoError::Kdf)?,
            ),
            rx_key: LessSafeKey::new(
                UnboundKey::new(&CHACHA20_POLY1305, s2c).map_err(|_| CryptoError::Kdf)?,
            ),
            tx_dir: "c2s",
            rx_dir: "s2c",
            tx_seq: 0,
            rx_seq: 0,
        })
    }

    pub fn seal(&mut self, plaintext: &str) -> Result<String, CryptoError> {
        if self.tx_seq >= MAX_SAFE_SEQ {
            return Err(CryptoError::NonceExhausted);
        }
        let seq = self.tx_seq;
        let aad = make_aad(self.tx_dir, seq);
        let mut buf = plaintext.as_bytes().to_vec();
        self.tx_key
            .seal_in_place_append_tag(make_nonce(seq), Aad::from(aad.as_bytes()), &mut buf)
            .map_err(|_| CryptoError::AuthFailed)?;
        self.tx_seq += 1;
        let frame = WireFrame {
            e: 2,
            n: seq,
            ct: URL_SAFE_NO_PAD.encode(&buf),
        };
        serde_json::to_string(&frame).map_err(|_| CryptoError::InvalidFrame)
    }

    pub fn open(&mut self, wire: &str) -> Result<String, CryptoError> {
        let frame: WireFrame = serde_json::from_str(wire).map_err(|_| CryptoError::InvalidFrame)?;
        if frame.e != 2 {
            return Err(CryptoError::InvalidFrame);
        }
        if frame.n != self.rx_seq {
            return Err(CryptoError::ReplayOrOrder);
        }
        if self.rx_seq >= MAX_SAFE_SEQ {
            return Err(CryptoError::NonceExhausted);
        }
        let mut buf = URL_SAFE_NO_PAD
            .decode(frame.ct.as_bytes())
            .map_err(|_| CryptoError::InvalidEncoding)?;
        let aad = make_aad(self.rx_dir, frame.n);
        let plain = self
            .rx_key
            .open_in_place(make_nonce(frame.n), Aad::from(aad.as_bytes()), &mut buf)
            .map_err(|_| CryptoError::AuthFailed)?;
        let text = std::str::from_utf8(plain)
            .map_err(|_| CryptoError::InvalidEncoding)?
            .to_string();
        self.rx_seq += 1;
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex_to_bytes(hex: &str) -> Vec<u8> {
        let clean: String = hex.chars().filter(|c| !c.is_whitespace()).collect();
        assert_eq!(clean.len() % 2, 0);
        (0..clean.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean[i..i + 2], 16).unwrap())
            .collect()
    }

    fn bytes_to_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn rfc8439_chacha20_poly1305_aead_vector() {
        let key = hex_to_bytes("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
        let nonce_bytes = hex_to_bytes("070000004041424344454647");
        let aad = hex_to_bytes("50515253c0c1c2c3c4c5c6c7");
        let plaintext = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let expected_ct = hex_to_bytes(
            "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6\
             3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36\
             92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc\
             3ff4def08e4b7a9de576d26586cec64b6116",
        );
        let expected_tag = hex_to_bytes("1ae10b594f09e26a7e902ecbd0600691");

        let aead_key = LessSafeKey::new(UnboundKey::new(&CHACHA20_POLY1305, &key).unwrap());
        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes).unwrap();
        let mut buf = plaintext.to_vec();
        aead_key
            .seal_in_place_append_tag(nonce, Aad::from(&aad), &mut buf)
            .unwrap();
        let mut expected = expected_ct;
        expected.extend_from_slice(&expected_tag);
        assert_eq!(buf, expected);
    }

    #[test]
    fn x25519_handshake_roundtrip_and_anti_replay() {
        let client_kp = EphemeralKeyPair::generate().unwrap();
        let server_kp = EphemeralKeyPair::generate().unwrap();
        let c_pub = client_kp.public;
        let s_pub = server_kp.public;
        let c_shared = client_kp.agree(&s_pub).unwrap();
        let s_shared = server_kp.agree(&c_pub).unwrap();
        assert_eq!(c_shared, s_shared);

        let device_key = [0x42u8; 32];
        let (c2s, s2c) =
            derive_direction_keys(&c_shared, &device_key, &c_pub, &s_pub, SESSION_INFO).unwrap();
        let (s_c2s, s_s2c) =
            derive_direction_keys(&s_shared, &device_key, &c_pub, &s_pub, SESSION_INFO).unwrap();
        assert_eq!(c2s, s_c2s);
        assert_eq!(s2c, s_s2c);
        assert_ne!(c2s, s2c, "directions must use distinct keys");

        let mut client = DeckCipher::for_client(&c2s, &s2c).unwrap();
        let mut server = DeckCipher::for_server(&c2s, &s2c).unwrap();

        let msg0 = r#"{"type":"hello-auth","device":"dev_test"}"#;
        let wire0 = client.seal(msg0).unwrap();
        assert!(!wire0.contains("hello-auth"));
        assert_eq!(server.open(&wire0).unwrap(), msg0);

        // Replaying frame 0 must fail.
        assert_eq!(server.open(&wire0), Err(CryptoError::ReplayOrOrder));

        // Tampered ciphertext must fail authentication.
        let wire1 = client
            .seal(r#"{"type":"cmd","id":"c1","action":"mark"}"#)
            .unwrap();
        let mut parsed: WireFrame = serde_json::from_str(&wire1).unwrap();
        let mut bytes = URL_SAFE_NO_PAD.decode(parsed.ct.as_bytes()).unwrap();
        bytes[0] ^= 0x01;
        parsed.ct = URL_SAFE_NO_PAD.encode(&bytes);
        let tampered = serde_json::to_string(&parsed).unwrap();
        assert_eq!(server.open(&tampered), Err(CryptoError::AuthFailed));

        // Reflecting a client frame at seq 0 back to the client must fail auth because directional keys differ.
        assert_eq!(client.open(&wire0), Err(CryptoError::AuthFailed));

        // Server-to-client direction works independently.
        let reply = r#"{"type":"state","pc":"TEST"}"#;
        let s_wire0 = server.seal(reply).unwrap();
        assert_eq!(client.open(&s_wire0).unwrap(), reply);
    }

    #[test]
    fn deterministic_cross_language_vector_matches_ts() {
        let shared = [0x11u8; 32];
        let device_key = [0x22u8; 32];
        let client_pub = [0x33u8; 32];
        let server_pub = [0x44u8; 32];
        let (c2s, s2c) =
            derive_direction_keys(&shared, &device_key, &client_pub, &server_pub, SESSION_INFO)
                .unwrap();
        // Exact vector asserted identically in src/deck/crypto.test.ts.
        assert_eq!(
            bytes_to_hex(&c2s),
            "551937f4d94d86074d61bc19389385bc109ccdfdd943282ddb16dee0ce5ecdf5"
        );
        assert_eq!(
            bytes_to_hex(&s2c),
            "c80ed18c2fa36cddf1451f2652aef7b54aaa6519f6a08bf1df8315f334fd703f"
        );
        let mut client = DeckCipher::for_client(&c2s, &s2c).unwrap();
        let mut server = DeckCipher::for_server(&c2s, &s2c).unwrap();
        let wire = client.seal(r#"{"type":"cmd","action":"mark"}"#).unwrap();
        assert_eq!(
            wire,
            r#"{"e":2,"n":0,"ct":"dsFmspU6ocbClD7DKyOgiBn0kWNJEEtcaP3XckSoTQ-9Bhqd0S09CGuVPskdew"}"#
        );
        assert_eq!(
            server.open(&wire).unwrap(),
            r#"{"type":"cmd","action":"mark"}"#
        );
    }
}
