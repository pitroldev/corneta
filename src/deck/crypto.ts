/**
 * Application-layer session encryption for the LAN phone deck.
 *
 * Plain HTTP LAN origins (`http://192.168.x.x`) do not expose `crypto.subtle`,
 * so this module implements RFC 7748 (X25519), RFC 5869 (HKDF-SHA256), and
 * RFC 8439 (ChaCha20-Poly1305) in pure TypeScript using only
 * `crypto.getRandomValues`.
 */

const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

export const PAIR_INFO = TEXT_ENC.encode("corneta-deck-pair-v2");
export const SESSION_INFO = TEXT_ENC.encode("corneta-deck-session-v2");

const MAX_SAFE_SEQ = Number.MAX_SAFE_INTEGER;

export function encodeB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeB64Url(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) {
    throw new Error("Invalid base64url");
  }
  const pad = (4 - (str.length % 4)) % 4;
  const std = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// --- SHA-256 (FIPS 180-4) ---

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr32 = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padLen = (64 - ((data.length + 9) % 64)) % 64;
  const buf = new Uint8Array(data.length + 1 + padLen + 8);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(buf.length - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(off + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        rotr32(w[i - 15]!, 7) ^ rotr32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 =
        rotr32(w[i - 2]!, 17) ^ rotr32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockKey = new Uint8Array(64);
  blockKey.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + data.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = blockKey[i]! ^ 0x36;
    outer[i] = blockKey[i]! ^ 0x5c;
  }
  inner.set(data, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

export function hkdfSha256(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Uint8Array {
  const prk = hmacSha256(salt.length ? salt : new Uint8Array(32), ikm);
  const blocks = Math.ceil(length / 32);
  const out = new Uint8Array(blocks * 32);
  let prev: Uint8Array = new Uint8Array(0);
  for (let i = 1; i <= blocks; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev);
    input.set(info, prev.length);
    input[prev.length + info.length] = i;
    prev = hmacSha256(prk, input);
    out.set(prev, (i - 1) * 32);
  }
  return out.subarray(0, length);
}

// --- X25519 (RFC 7748) ---

const P25519 = (1n << 255n) - 19n;
const A24 = 121665n;

function modP(a: bigint): bigint {
  const r = a % P25519;
  return r >= 0n ? r : r + P25519;
}

function modPowP(base: bigint, exp: bigint): bigint {
  let result = 1n;
  let b = modP(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P25519;
    b = (b * b) % P25519;
    e >>= 1n;
  }
  return result;
}

function bytesToBigIntLE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    n = (n << 8n) | BigInt(bytes[i]!);
  }
  return n;
}

function bigIntToBytesLE(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = n;
  for (let i = 0; i < length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function x25519(
  scalarBytes: Uint8Array,
  uCoordBytes: Uint8Array,
): Uint8Array {
  if (scalarBytes.length !== 32 || uCoordBytes.length !== 32) {
    throw new Error("X25519 requires 32-byte inputs");
  }
  const kBytes = new Uint8Array(scalarBytes);
  kBytes[0] = kBytes[0]! & 248;
  kBytes[31] = (kBytes[31]! & 127) | 64;
  const k = bytesToBigIntLE(kBytes);

  const uBytes = new Uint8Array(uCoordBytes);
  uBytes[31] = uBytes[31]! & 127;
  const u = modP(bytesToBigIntLE(uBytes));

  const x1 = u;
  let x2 = 1n;
  let z2 = 0n;
  let x3 = u;
  let z3 = 1n;
  let swap = 0n;

  for (let t = 254n; t >= 0n; t--) {
    const kt = (k >> t) & 1n;
    swap ^= kt;
    if (swap === 1n) {
      [x2, x3] = [x3, x2];
      [z2, z3] = [z3, z2];
    }
    swap = kt;

    const A = modP(x2 + z2);
    const AA = modP(A * A);
    const B = modP(x2 - z2);
    const BB = modP(B * B);
    const E = modP(AA - BB);
    const C = modP(x3 + z3);
    const D = modP(x3 - z3);
    const DA = modP(D * A);
    const CB = modP(C * B);
    x3 = modP((DA + CB) * (DA + CB));
    z3 = modP(x1 * modP((DA - CB) * (DA - CB)));
    x2 = modP(AA * BB);
    z2 = modP(E * modP(AA + modP(A24 * E)));
  }
  if (swap === 1n) {
    x2 = x3;
    z2 = z3;
  }

  const out = modP(x2 * modPowP(z2, P25519 - 2n));
  return bigIntToBytesLE(out, 32);
}

const X25519_BASEPOINT = new Uint8Array(32);
X25519_BASEPOINT[0] = 9;

export interface X25519KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519(privateKey, X25519_BASEPOINT);
  return { privateKey, publicKey };
}

export function x25519SharedSecret(
  privateKey: Uint8Array,
  peerPublic: Uint8Array,
): Uint8Array {
  const shared = x25519(privateKey, peerPublic);
  let nonZero = 0;
  for (let i = 0; i < shared.length; i++) nonZero |= shared[i]!;
  if (nonZero === 0) {
    throw new Error("Low-order X25519 public key");
  }
  return shared;
}

// --- ChaCha20-Poly1305 (RFC 8439) ---

const rotl32 = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

function quarterRound(
  s: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
) {
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl32(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl32(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) >>> 0;
  s[d] = rotl32(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) >>> 0;
  s[b] = rotl32(s[b]! ^ s[c]!, 7);
}

function chacha20Block(
  key: Uint8Array,
  counter: number,
  nonce: Uint8Array,
): Uint8Array {
  const kv = new DataView(key.buffer, key.byteOffset, key.byteLength);
  const nv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const init = new Uint32Array(16);
  init[0] = 0x61707865;
  init[1] = 0x3320646e;
  init[2] = 0x79622d32;
  init[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) init[4 + i] = kv.getUint32(i * 4, true);
  init[12] = counter >>> 0;
  init[13] = nv.getUint32(0, true);
  init[14] = nv.getUint32(4, true);
  init[15] = nv.getUint32(8, true);

  const w = new Uint32Array(init);
  for (let i = 0; i < 10; i++) {
    quarterRound(w, 0, 4, 8, 12);
    quarterRound(w, 1, 5, 9, 13);
    quarterRound(w, 2, 6, 10, 14);
    quarterRound(w, 3, 7, 11, 15);
    quarterRound(w, 0, 5, 10, 15);
    quarterRound(w, 1, 6, 11, 12);
    quarterRound(w, 2, 7, 8, 13);
    quarterRound(w, 3, 4, 9, 14);
  }

  const out = new Uint8Array(64);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) {
    ov.setUint32(i * 4, (w[i]! + init[i]!) >>> 0, true);
  }
  return out;
}

function chacha20Xor(
  key: Uint8Array,
  counter: number,
  nonce: Uint8Array,
  input: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(input.length);
  let blk = counter;
  for (let off = 0; off < input.length; off += 64) {
    const ks = chacha20Block(key, blk++, nonce);
    const len = Math.min(64, input.length - off);
    for (let i = 0; i < len; i++) {
      out[off + i] = input[off + i]! ^ ks[i]!;
    }
  }
  return out;
}

const P1305 = (1n << 130n) - 5n;
const MASK128 = (1n << 128n) - 1n;

function poly1305Mac(otk: Uint8Array, msg: Uint8Array): Uint8Array {
  const rBytes = new Uint8Array(otk.subarray(0, 16));
  rBytes[3] = rBytes[3]! & 15;
  rBytes[7] = rBytes[7]! & 15;
  rBytes[11] = rBytes[11]! & 15;
  rBytes[15] = rBytes[15]! & 15;
  rBytes[4] = rBytes[4]! & 252;
  rBytes[8] = rBytes[8]! & 252;
  rBytes[12] = rBytes[12]! & 252;
  const r = bytesToBigIntLE(rBytes);
  const s = bytesToBigIntLE(otk.subarray(16, 32));

  let acc = 0n;
  for (let off = 0; off < msg.length; off += 16) {
    const chunk = msg.subarray(off, Math.min(off + 16, msg.length));
    const n = bytesToBigIntLE(chunk) | (1n << BigInt(chunk.length * 8));
    acc = ((acc + n) * r) % P1305;
  }
  acc = (acc + s) & MASK128;
  return bigIntToBytesLE(acc, 16);
}

function buildPolyInput(aad: Uint8Array, ct: Uint8Array): Uint8Array {
  const aadPad = (16 - (aad.length % 16)) % 16;
  const ctPad = (16 - (ct.length % 16)) % 16;
  const buf = new Uint8Array(aad.length + aadPad + ct.length + ctPad + 16);
  buf.set(aad, 0);
  buf.set(ct, aad.length + aadPad);
  const view = new DataView(buf.buffer);
  const lenOff = aad.length + aadPad + ct.length + ctPad;
  view.setUint32(lenOff, aad.length >>> 0, true);
  view.setUint32(lenOff + 4, Math.floor(aad.length / 0x100000000), true);
  view.setUint32(lenOff + 8, ct.length >>> 0, true);
  view.setUint32(lenOff + 12, Math.floor(ct.length / 0x100000000), true);
  return buf;
}

export function chacha20Poly1305Seal(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  const otk = chacha20Block(key, 0, nonce).subarray(0, 32);
  const ct = chacha20Xor(key, 1, nonce, plaintext);
  const tag = poly1305Mac(otk, buildPolyInput(aad, ct));
  const out = new Uint8Array(ct.length + 16);
  out.set(ct, 0);
  out.set(tag, ct.length);
  return out;
}

export function chacha20Poly1305Open(
  key: Uint8Array,
  nonce: Uint8Array,
  ctWithTag: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  if (ctWithTag.length < 16) {
    throw new Error("Ciphertext too short");
  }
  const ct = ctWithTag.subarray(0, ctWithTag.length - 16);
  const tag = ctWithTag.subarray(ctWithTag.length - 16);
  const otk = chacha20Block(key, 0, nonce).subarray(0, 32);
  const expected = poly1305Mac(otk, buildPolyInput(aad, ct));
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= tag[i]! ^ expected[i]!;
  if (diff !== 0) {
    throw new Error("Authentication failed");
  }
  return chacha20Xor(key, 1, nonce, ct);
}

// --- Deck Session Protocol ---

export function deriveDirectionKeys(
  shared: Uint8Array,
  authSecret: Uint8Array,
  clientPub: Uint8Array,
  serverPub: Uint8Array,
  info: Uint8Array,
): { c2s: Uint8Array; s2c: Uint8Array } {
  const salt = new Uint8Array(64);
  salt.set(clientPub, 0);
  salt.set(serverPub, 32);
  const ikm = new Uint8Array(shared.length + authSecret.length);
  ikm.set(shared, 0);
  ikm.set(authSecret, shared.length);
  const okm = hkdfSha256(salt, ikm, info, 64);
  return {
    c2s: new Uint8Array(okm.subarray(0, 32)),
    s2c: new Uint8Array(okm.subarray(32, 64)),
  };
}

function makeNonce(seq: number): Uint8Array {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  view.setUint32(4, Math.floor(seq / 0x100000000), false);
  view.setUint32(8, seq >>> 0, false);
  return nonce;
}

function makeAad(dir: "c2s" | "s2c", seq: number): Uint8Array {
  return TEXT_ENC.encode(`corneta-deck-v2:${dir}:${seq}`);
}

export class DeckCipher {
  private txSeq = 0;
  private rxSeq = 0;

  private constructor(
    private readonly txKey: Uint8Array,
    private readonly rxKey: Uint8Array,
    private readonly txDir: "c2s" | "s2c",
    private readonly rxDir: "c2s" | "s2c",
  ) {}

  static forClient(c2s: Uint8Array, s2c: Uint8Array): DeckCipher {
    return new DeckCipher(c2s, s2c, "c2s", "s2c");
  }

  static forServer(c2s: Uint8Array, s2c: Uint8Array): DeckCipher {
    return new DeckCipher(s2c, c2s, "s2c", "c2s");
  }

  seal(plaintext: string): string {
    if (this.txSeq >= MAX_SAFE_SEQ) {
      throw new Error("Nonce exhausted");
    }
    const seq = this.txSeq;
    const sealed = chacha20Poly1305Seal(
      this.txKey,
      makeNonce(seq),
      TEXT_ENC.encode(plaintext),
      makeAad(this.txDir, seq),
    );
    this.txSeq += 1;
    return JSON.stringify({ e: 2, n: seq, ct: encodeB64Url(sealed) });
  }

  open(wire: string): string {
    const parsed = JSON.parse(wire) as {
      e?: unknown;
      n?: unknown;
      ct?: unknown;
    };
    if (
      parsed.e !== 2 ||
      typeof parsed.n !== "number" ||
      !Number.isSafeInteger(parsed.n) ||
      typeof parsed.ct !== "string"
    ) {
      throw new Error("Invalid encrypted frame");
    }
    if (parsed.n !== this.rxSeq) {
      throw new Error("Replay or out-of-order frame");
    }
    if (this.rxSeq >= MAX_SAFE_SEQ) {
      throw new Error("Nonce exhausted");
    }
    const plain = chacha20Poly1305Open(
      this.rxKey,
      makeNonce(parsed.n),
      decodeB64Url(parsed.ct),
      makeAad(this.rxDir, parsed.n),
    );
    this.rxSeq += 1;
    return TEXT_DEC.decode(plain);
  }
}
