import { describe, expect, it } from "vitest";
import {
  DeckCipher,
  PAIR_INFO,
  SESSION_INFO,
  chacha20Poly1305Open,
  chacha20Poly1305Seal,
  decodeB64Url,
  deriveDirectionKeys,
  encodeB64Url,
  generateX25519KeyPair,
  hkdfSha256,
  x25519,
  x25519SharedSecret,
} from "./crypto";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("deck pure-TS crypto primitives", () => {
  it("matches RFC 7748 section 6.1 X25519 test vector", () => {
    const alicePriv = hexToBytes(
      "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
    );
    const alicePub = hexToBytes(
      "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
    );
    const bobPriv = hexToBytes(
      "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb",
    );
    const bobPub = hexToBytes(
      "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
    );
    const expectedShared =
      "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742";

    const basepoint = new Uint8Array(32);
    basepoint[0] = 9;
    expect(bytesToHex(x25519(alicePriv, basepoint))).toBe(bytesToHex(alicePub));
    expect(bytesToHex(x25519(bobPriv, basepoint))).toBe(bytesToHex(bobPub));
    expect(bytesToHex(x25519SharedSecret(alicePriv, bobPub))).toBe(
      expectedShared,
    );
    expect(bytesToHex(x25519SharedSecret(bobPriv, alicePub))).toBe(
      expectedShared,
    );
  });

  it("matches RFC 5869 Appendix A.1 HKDF-SHA256 test vector", () => {
    const ikm = hexToBytes("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
    const salt = hexToBytes("000102030405060708090a0b0c");
    const info = hexToBytes("f0f1f2f3f4f5f6f7f8f9");
    const okm = hkdfSha256(salt, ikm, info, 42);
    expect(bytesToHex(okm)).toBe(
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
  });

  it("matches RFC 8439 section 2.8.2 ChaCha20-Poly1305 AEAD vector", () => {
    const key = hexToBytes(
      "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
    );
    const nonce = hexToBytes("070000004041424344454647");
    const aad = hexToBytes("50515253c0c1c2c3c4c5c6c7");
    const plaintext = new TextEncoder().encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    const expectedCt =
      "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6" +
      "3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36" +
      "92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc" +
      "3ff4def08e4b7a9de576d26586cec64b6116";
    const expectedTag = "1ae10b594f09e26a7e902ecbd0600691";

    const sealed = chacha20Poly1305Seal(key, nonce, plaintext, aad);
    expect(bytesToHex(sealed)).toBe(expectedCt + expectedTag);
    const opened = chacha20Poly1305Open(key, nonce, sealed, aad);
    expect(opened).toEqual(plaintext);
  });

  it("matches the exact Rust cross-language HKDF and frame vector", () => {
    const shared = new Uint8Array(32).fill(0x11);
    const deviceKey = new Uint8Array(32).fill(0x22);
    const clientPub = new Uint8Array(32).fill(0x33);
    const serverPub = new Uint8Array(32).fill(0x44);
    const { c2s, s2c } = deriveDirectionKeys(
      shared,
      deviceKey,
      clientPub,
      serverPub,
      SESSION_INFO,
    );
    expect(bytesToHex(c2s)).toBe(
      "551937f4d94d86074d61bc19389385bc109ccdfdd943282ddb16dee0ce5ecdf5",
    );
    expect(bytesToHex(s2c)).toBe(
      "c80ed18c2fa36cddf1451f2652aef7b54aaa6519f6a08bf1df8315f334fd703f",
    );
    const client = DeckCipher.forClient(c2s, s2c);
    const server = DeckCipher.forServer(c2s, s2c);
    const wire = client.seal('{"type":"cmd","action":"mark"}');
    expect(wire).toBe(
      '{"e":2,"n":0,"ct":"dsFmspU6ocbClD7DKyOgiBn0kWNJEEtcaP3XckSoTQ-9Bhqd0S09CGuVPskdew"}',
    );
    expect(server.open(wire)).toBe('{"type":"cmd","action":"mark"}');
  });

  it("works when window.crypto.subtle is undefined (plain HTTP LAN origin)", () => {
    const origCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: origCrypto.getRandomValues.bind(origCrypto),
        subtle: undefined,
      },
    });
    try {
      expect(globalThis.crypto.subtle).toBeUndefined();
      const alice = generateX25519KeyPair();
      const bob = generateX25519KeyPair();
      const sA = x25519SharedSecret(alice.privateKey, bob.publicKey);
      const sB = x25519SharedSecret(bob.privateKey, alice.publicKey);
      expect(sA).toEqual(sB);

      const token = new TextEncoder().encode("test-qr-token");
      const kA = deriveDirectionKeys(
        sA,
        token,
        alice.publicKey,
        bob.publicKey,
        PAIR_INFO,
      );
      const kB = deriveDirectionKeys(
        sB,
        token,
        alice.publicKey,
        bob.publicKey,
        PAIR_INFO,
      );
      const c = DeckCipher.forClient(kA.c2s, kA.s2c);
      const s = DeckCipher.forServer(kB.c2s, kB.s2c);
      const wire = c.seal('{"type":"pair","token":"test-qr-token"}');
      expect(wire).not.toContain("test-qr-token");
      expect(s.open(wire)).toBe('{"type":"pair","token":"test-qr-token"}');
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: origCrypto,
      });
    }
  });

  it("rejects replay, out-of-order, tampered ciphertext, and reflection", () => {
    const shared = new Uint8Array(32).fill(0x55);
    const key = new Uint8Array(32).fill(0x66);
    const cPub = new Uint8Array(32).fill(0x77);
    const sPub = new Uint8Array(32).fill(0x88);
    const { c2s, s2c } = deriveDirectionKeys(
      shared,
      key,
      cPub,
      sPub,
      SESSION_INFO,
    );
    const client = DeckCipher.forClient(c2s, s2c);
    const server = DeckCipher.forServer(c2s, s2c);

    const w0 = client.seal('{"type":"hello-auth","device":"d1"}');
    expect(server.open(w0)).toBe('{"type":"hello-auth","device":"d1"}');

    // Replay of frame 0 fails.
    expect(() => server.open(w0)).toThrow("Replay");

    // Reflection of frame 0 back to client (whose rxSeq is still 0) fails auth.
    expect(() => client.open(w0)).toThrow("Authentication failed");

    // Tampered ciphertext fails auth.
    const w1 = client.seal('{"type":"cmd","id":"c1","action":"mark"}');
    const frame = JSON.parse(w1) as { e: number; n: number; ct: string };
    const raw = decodeB64Url(frame.ct);
    raw[0] = raw[0]! ^ 1;
    const tampered = JSON.stringify({ ...frame, ct: encodeB64Url(raw) });
    expect(() => server.open(tampered)).toThrow("Authentication failed");

    // Skipping seq 1 to seq 2 fails ordering check.
    const w2 = client.seal('{"type":"cmd","id":"c2","action":"brb"}');
    expect(() => server.open(w2)).toThrow("Replay");
  });
});
