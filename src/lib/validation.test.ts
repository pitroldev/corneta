import { describe, it, expect } from "vitest";
import {
  sanitizeStreamKey,
  sanitizeApiKey,
  sanitizeToken,
  sanitizeIngestUrl,
  sanitizeHost,
} from "./validation";

const KEY = "AIza" + "B".repeat(35);

describe("sanitizeStreamKey", () => {
  it("trims a plain key", () => {
    expect(sanitizeStreamKey("  live_123  ")).toEqual({
      key: "live_123",
      strippedUrl: false,
    });
  });
  it("extracts a key from a complete pasted URL", () => {
    expect(sanitizeStreamKey("rtmp://live.twitch.tv/app/live_123").key).toBe(
      "live_123",
    );
  });
  it("preserves query parameters such as Twitch bandwidth tests", () => {
    expect(
      sanitizeStreamKey("rtmp://live.twitch.tv/app/live_9?bwtest=true").key,
    ).toBe("live_9?bwtest=true");
  });
  it("rejects server-only URLs and reports strippedUrl", () => {
    const r = sanitizeStreamKey(
      "rtmp://live.twitch.tv/app",
      "rtmp://live.twitch.tv/app",
    );
    expect(r).toEqual({ key: "", strippedUrl: true });
  });
});

describe("sanitizeApiKey", () => {
  it("extracts fixed-format API keys from pasted content", () => {
    expect(sanitizeApiKey(KEY)).toBe(KEY);
    expect(sanitizeApiKey("key=" + KEY + "&x")).toBe(KEY);
    expect(sanitizeApiKey(`"${KEY}"`)).toBe(KEY);
    expect(
      sanitizeApiKey("https://console.cloud.google.com/x?key=" + KEY),
    ).toBe(KEY);
  });
  it("strips quotes and whitespace when no API key matches", () => {
    expect(sanitizeApiKey('  "abc def"  ')).toBe("abcdef");
  });
});

describe("sanitizeToken", () => {
  it("strips Bearer prefixes, quotes, labels and query wrappers", () => {
    expect(sanitizeToken("Bearer eyJ.a.b")).toBe("eyJ.a.b");
    expect(sanitizeToken('"abc123"')).toBe("abc123");
    expect(sanitizeToken("Your Socket API Token: abc123")).toBe("abc123");
    expect(sanitizeToken("https://sockets.streamlabs.com/?token=abc")).toBe(
      "abc",
    );
  });
});

describe("sanitizeIngestUrl / sanitizeHost", () => {
  it("strips ingest whitespace and quotes and rejects bare schemes", () => {
    expect(sanitizeIngestUrl("  rtmp://x/app  ")).toBe("rtmp://x/app");
    expect(sanitizeIngestUrl("rtmp://")).toBe("");
  });
  it("extracts only the hostname from a pasted URL", () => {
    expect(sanitizeHost("localhost")).toBe("localhost");
    expect(sanitizeHost("rtmp://localhost:1935/live")).toBe("localhost");
    expect(sanitizeHost("127.0.0.1:1935")).toBe("127.0.0.1");
  });
});
