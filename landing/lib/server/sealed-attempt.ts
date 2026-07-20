import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { ApiError } from "./http";

const encode = (value: Buffer) => value.toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url");

export function sealAttempt(payload: object, secret: string) {
  if (!secret) {
    throw new ApiError(
      503,
      "OAUTH_NOT_CONFIGURED",
      "OAuth ainda não está configurado no servidor.",
    );
  }
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return `${encode(iv)}.${encode(encrypted)}.${encode(cipher.getAuthTag())}`;
}

export function openAttempt<T>(token: unknown, secret: string) {
  if (typeof token !== "string" || token.length > 8_192) {
    throw new ApiError(400, "INVALID_ATTEMPT", "Tentativa OAuth inválida.");
  }
  try {
    const [ivPart, encryptedPart, tagPart, extra] = token.split(".");
    if (!ivPart || !encryptedPart || !tagPart || extra) throw new Error();
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, decode(ivPart));
    decipher.setAuthTag(decode(tagPart));
    const plain = Buffer.concat([
      decipher.update(decode(encryptedPart)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plain) as T;
  } catch {
    throw new ApiError(400, "INVALID_ATTEMPT", "Tentativa OAuth inválida.");
  }
}
