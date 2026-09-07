//! Verify the exact installer with the public key shipped in the app.
//! Streams the installer; never loads the whole NSIS into memory.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{error::Error, fs::File, io::Read, path::Path};

fn verify(
    mut input: impl Read,
    key: &PublicKey,
    signature: &Signature,
) -> Result<(), Box<dyn Error>> {
    let mut verifier = key.verify_stream(signature)?;
    let mut buffer = [0_u8; 65_536];
    loop {
        let size = input.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        verifier.update(&buffer[..size]);
    }
    verifier.finalize()?;
    Ok(())
}

fn bounded_file(path: &Path) -> Result<String, Box<dyn Error>> {
    let mut text = String::new();
    File::open(path)?.take(16_385).read_to_string(&mut text)?;
    if text.len() > 16_384 {
        return Err("metadata too large".into());
    }
    Ok(text)
}

fn run() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err("expected installer, signature and tauri.conf.json".into());
    }
    let config: serde_json::Value = serde_json::from_str(&bounded_file(Path::new(&args[2]))?)?;
    let encoded_key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("missing updater public key")?;
    let key = PublicKey::decode(std::str::from_utf8(&STANDARD.decode(encoded_key.trim())?)?)?;
    let encoded_signature = bounded_file(Path::new(&args[1]))?;
    let signature = Signature::decode(std::str::from_utf8(
        &STANDARD.decode(encoded_signature.trim())?,
    )?)?;
    verify(File::open(&args[0])?, &key, &signature)
}

fn main() {
    if run().is_err() {
        eprintln!(
            "Invalid updater signature, incompatible key or unreadable artifact. Release blocked."
        );
        std::process::exit(1);
    }
    println!("Installer signature verified with the application's public key.");
}

#[cfg(test)]
mod tests {
    use super::*;

    // Public test vector from minisign-verify; no private signing key.
    fn vector() -> (PublicKey, Signature) {
        let key =
            PublicKey::from_base64("RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3")
                .unwrap();
        let signature = Signature::decode(
            "untrusted comment: signature from minisign secret key\n\
             RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\n\
             trusted comment: timestamp:1633700835\tfile:test\tprehashed\n\
             wLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==",
        ).unwrap();
        (key, signature)
    }

    #[test]
    fn accepts_valid_signed_bytes() {
        let (key, signature) = vector();
        assert!(verify(&b"test"[..], &key, &signature).is_ok());
    }

    #[test]
    fn rejects_tampered_or_truncated_bytes() {
        let (key, signature) = vector();
        assert!(verify(&b"tesT"[..], &key, &signature).is_err());
        assert!(verify(&b"tes"[..], &key, &signature).is_err());
    }
}
