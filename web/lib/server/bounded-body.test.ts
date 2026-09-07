import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedText } from "./bounded-body";
import { oauthTokens } from "./oauth-tokens";

afterEach(() => vi.useRealTimers());
describe("bounded OAuth streams", () => {
  it("decodes a multibyte character split between chunks", async () => {
    const bytes = new TextEncoder().encode("ação");
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    expect(await readBoundedText(stream, bytes.length)).toBe("ação");
  });
  it("cancels a chunked body as soon as it exceeds the limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(10));
      },
      cancel,
    });
    await expect(readBoundedText(stream, 15)).rejects.toThrow("BODY_TOO_LARGE");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("times out even if the sender never finishes", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = expect(
      readBoundedText(new ReadableStream({ cancel }), 10, 100),
    ).rejects.toThrow("BODY_TIMEOUT");
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("handles empty and invalid UTF-8 without leaking data", async () => {
    expect(await readBoundedText(null, 10)).toBe("");
    await expect(
      readBoundedText(new Response(new Uint8Array([255])).body, 10),
    ).rejects.toThrow();
  });
});

describe("OAuth token contract", () => {
  it("accepts a valid session and an optional rotated refresh token", () => {
    expect(
      oauthTokens({ access_token: "valid-test-token", expires_in: "3600" }),
    ).toEqual({
      accessToken: "valid-test-token",
      refreshToken: null,
      expiresIn: 3600,
    });
  });
  it.each([
    { access_token: {} },
    { access_token: " " },
    { access_token: "test", refresh_token: {} },
    { access_token: "test", expires_in: -1 },
    { access_token: "test", expires_in: true },
    { access_token: "test", expires_in: { toString: null } },
    { access_token: "test", expires_in: "Infinity" },
  ])("rejects a malformed session", (body) => {
    expect(() => oauthTokens(body)).toThrow(
      "A Kick não retornou uma sessão válida",
    );
  });
});
