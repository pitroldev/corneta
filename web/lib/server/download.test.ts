import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "../../app/download/route";
import { RELEASES_URL } from "../download";

const installerUrl =
  "https://github.com/pitroldev/corneta/releases/download/v0.8.1/Corneta_0.8.1_x64-setup.exe";
const manifest = {
  version: "0.8.1",
  platforms: { "windows-x86_64": { url: installerUrl, signature: "test" } },
};
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  fetcher.mockReset();
  fetcher.mockImplementation(async () => Response.json(manifest));
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function expectFallback() {
  const response = await GET();
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(RELEASES_URL);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("");
}

describe("stable installer download redirect", () => {
  it("uses the exact published installer without downloading or proxying it", async () => {
    const response = await GET();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(installerUrl);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=300",
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(await response.text()).toBe("");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `${RELEASES_URL}/download/latest.json`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("follows a new release without a rebuild or a configured asset alias", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_PRIMARY_CTA_URL",
      `${RELEASES_URL}/download/Corneta-Setup.exe`,
    );
    const nextInstaller = installerUrl.replaceAll("0.8.1", "0.9.0");
    fetcher.mockResolvedValueOnce(Response.json(manifest));
    fetcher.mockResolvedValueOnce(
      Response.json({
        version: "0.9.0",
        platforms: { "windows-x86_64": { url: nextInstaller } },
      }),
    );
    expect((await GET()).headers.get("location")).toBe(installerUrl);
    expect((await GET()).headers.get("location")).toBe(nextInstaller);
  });

  it.each([
    "https://example.com/Corneta.exe",
    "http://github.com/pitroldev/corneta/releases/download/v0.8.1/Corneta.exe",
    "https://github.com/another/project/releases/download/v0.8.1/Corneta.exe",
    installerUrl.replace("github.com", "secret@github.com"),
    `${installerUrl}?download=1`,
    `${installerUrl}#download`,
    `${RELEASES_URL}/download/Corneta-Setup.exe`,
    installerUrl.replace("/v0.8.1/", "/v0.8.0/"),
    installerUrl.replace(".exe", ".msi"),
    installerUrl.replace("Corneta_", "%2fCorneta_"),
    installerUrl.replace("Corneta_", "%0d%0aCorneta_"),
  ])(
    "falls back instead of redirecting to an invalid installer: %s",
    async (url) => {
      fetcher.mockResolvedValueOnce(
        Response.json({
          ...manifest,
          platforms: { "windows-x86_64": { url } },
        }),
      );
      await expectFallback();
    },
  );

  it.each([
    null,
    [],
    {},
    { ...manifest, version: null },
    { ...manifest, version: 8.1 },
    { ...manifest, platforms: null },
    { ...manifest, platforms: [] },
    { ...manifest, platforms: { "windows-aarch64": { url: installerUrl } } },
    { ...manifest, platforms: { "windows-x86_64": null } },
    { ...manifest, platforms: { "windows-x86_64": { url: {} } } },
  ])(
    "falls back for a malformed or unsupported manifest: %j",
    async (value) => {
      fetcher.mockResolvedValueOnce(Response.json(value));
      await expectFallback();
    },
  );

  it.each([404, 429, 503])(
    "falls back on upstream HTTP %i without reading its body",
    async (status) => {
      const cancel = vi.fn();
      fetcher.mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status }),
      );
      await expectFallback();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("falls back on a network failure", async () => {
    fetcher.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expectFallback();
  });

  it.each(["", "{", "<html>Unavailable</html>"])(
    "falls back on invalid JSON: %j",
    async (body) => {
      fetcher.mockResolvedValueOnce(new Response(body));
      await expectFallback();
    },
  );

  it("bounds chunked manifests and cancels an oversized response", async () => {
    const cancel = vi.fn();
    fetcher.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(32_768));
          },
          cancel,
        }),
      ),
    );
    await expectFallback();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not wait indefinitely for a stalled manifest body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetcher.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
    const result = expectFallback();
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
