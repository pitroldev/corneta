import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sitemap from "./sitemap";

describe("sitemap editorial", () => {
  it("publica as Fases 1, 2 e 3 completas sem inventar traduções", async () => {
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    const phaseOnePaths = [
      "/guides/multistream/obs-multistream",
      "/help/getting-started/first-stream",
      "/help/streaming-software/automatic-obs-setup",
      "/help/platforms/manage-platform",
      "/help/platforms/streaming-keys-and-urls",
      "/help/quality/quality-modes",
      "/guides/multistream/twitch-youtube-simultaneously",
      "/guides/quality/multistream-upload-speed",
      "/guides/quality/why-stream-lags",
      "/help/reports-and-data/export-safe-diagnostic",
      "/guides/multistream/local-vs-cloud",
      "/guides/multistream/twitch-youtube-kick",
    ];

    const phaseTwoPaths = [
      "/guides/quality/twitch-youtube-kick-bitrate",
      "/guides/quality/dropped-frames",
      "/guides/multistream/one-platform-disconnected",
      "/guides/multistream/simulcasting-rules",
      "/guides/operations/unified-chat-rules",
      "/guides/security/protect-stream-key",
      "/guides/quality/live-stream-encoders",
      "/guides/quality/copy-vs-transcode",
      "/guides/operations/obs-closed-during-stream",
      "/guides/operations/analyze-stream-drop",
      "/help/quality/test-upload",
      "/help/troubleshooting/stream-statuses",
      "/help/quality/stream-metrics",
      "/help/streaming-software/brb-screen",
      "/help/quality/auto-bitrate",
      "/help/chat-and-alerts/unified-chat-setup",
      "/help/chat-and-alerts/obs-browser-source-overlay",
      "/help/reports-and-data/post-live-report",
      "/help/troubleshooting/obs-not-found",
      "/help/troubleshooting/platform-reconnecting",
    ];

    const phaseThreePaths = [
      "/guides/comparisons/restream-alternative",
      "/guides/multistream/horizontal-and-vertical-live",
      "/guides/operations/chat-alerts-obs",
      "/guides/quality/multistream-low-end-pc",
      "/guides/quality/resolution-and-fps",
      "/guides/quality/streaming-glossary",
      "/guides/comparisons/multistream-tools",
    ];

    const publishedPhasePaths = [
      ...phaseOnePaths,
      ...phaseTwoPaths,
      ...phaseThreePaths,
    ];
    expect(paths).toEqual(expect.arrayContaining(publishedPhasePaths));
    expect(
      paths.filter((path) => publishedPhasePaths.includes(path)),
    ).toHaveLength(publishedPhasePaths.length);
    expect(paths).toContain("/guides");
    expect(paths).toContain("/help");
    expect(paths).not.toContain("/en/guides/multistream/obs-multistream");
    expect(paths).not.toContain("/help/obs/automatic-obs-setup");
    expect(paths).not.toContain("/guides/obs/why-stream-lags");
    expect(paths).toContain("/");
    expect(paths).toContain("/en");
  });
});
