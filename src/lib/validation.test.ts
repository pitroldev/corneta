import { describe, it, expect } from "vitest";
import {
  sanitizeStreamKey,
  sanitizeApiKey,
  sanitizeToken,
  sanitizeIngestUrl,
  sanitizeHost,
} from "./validation";

const KEY = "AIza" + "B".repeat(35); // formato de chave do YouTube (39 chars)

describe("sanitizeStreamKey", () => {
  it("chave pura só é trimada", () => {
    expect(sanitizeStreamKey("  live_123  ")).toEqual({
      key: "live_123",
      strippedUrl: false,
    });
  });
  it("recorta a chave de uma URL colada inteira", () => {
    expect(sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123").key).toBe(
      "live_123",
    );
  });
  it("preserva a querystring (bandwidthtest da Twitch)", () => {
    expect(
      sanitizeStreamKey("rtmp://live.twitch.tv/app/live_9?bwtest=true").key,
    ).toBe("live_9?bwtest=true");
  });
  it("só o servidor (== ingestUrl) → sem chave, strippedUrl", () => {
    const r = sanitizeStreamKey(
      "rtmp://live.twitch.tv/app",
      "rtmp://live.twitch.tv/app",
    );
    expect(r).toEqual({ key: "", strippedUrl: true });
  });
});

describe("sanitizeApiKey", () => {
  it("extrai a AIza… de qualquer sujeira", () => {
    expect(sanitizeApiKey(KEY)).toBe(KEY);
    expect(sanitizeApiKey("key=" + KEY + "&x")).toBe(KEY);
    expect(sanitizeApiKey(`"${KEY}"`)).toBe(KEY);
    expect(
      sanitizeApiKey("https://console.cloud.google.com/x?key=" + KEY),
    ).toBe(KEY);
  });
  it("sem AIza: tira aspas e espaços", () => {
    expect(sanitizeApiKey('  "abc def"  ')).toBe("abcdef");
  });
});

describe("sanitizeToken", () => {
  it("tira Bearer, aspas, rótulo e query", () => {
    expect(sanitizeToken("Bearer eyJ.a.b")).toBe("eyJ.a.b");
    expect(sanitizeToken('"abc123"')).toBe("abc123");
    expect(sanitizeToken("Your Socket API Token: abc123")).toBe("abc123");
    expect(sanitizeToken("https://sockets.streamlabs.com/?token=abc")).toBe(
      "abc",
    );
  });
});

describe("sanitizeIngestUrl / sanitizeHost", () => {
  it("ingest: tira espaços/aspas; esquema só → vazio", () => {
    expect(sanitizeIngestUrl("  rtmp://x/app  ")).toBe("rtmp://x/app");
    expect(sanitizeIngestUrl("rtmp://")).toBe("");
  });
  it("host: URL inteira no campo de host → só o host", () => {
    expect(sanitizeHost("localhost")).toBe("localhost");
    expect(sanitizeHost("rtmp://localhost:1935/live")).toBe("localhost");
    expect(sanitizeHost("127.0.0.1:1935")).toBe("127.0.0.1");
  });
});
