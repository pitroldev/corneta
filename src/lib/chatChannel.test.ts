import { describe, it, expect } from "vitest";
import { normalizeChatChannel } from "./chatChannel";

const cases: [Parameters<typeof normalizeChatChannel>[0], string, string][] = [
  // Twitch → login
  ["twitch", "Pitrol", "pitrol"],
  ["twitch", "@Pitrol", "pitrol"],
  ["twitch", "#pitrol", "pitrol"],
  ["twitch", "https://www.twitch.tv/pitrol?tt=x", "pitrol"],
  ["twitch", "twitch.tv/popout/pitrol/chat", "pitrol"],
  ["twitch", "twitch.tv/moderator/pitrol", "pitrol"],
  ["twitch", "twitch.tv/pitrol/clip/FunnyName", "pitrol"],
  ["twitch", "João_Silva", "joao_silva"],
  ["twitch", "player.twitch.tv/?channel=pitrol&parent=x", "pitrol"],
  // Twitch — cagadas que viram "" (não conectar no canal errado)
  ["twitch", "https://www.twitch.tv/videos/123456789", ""],
  ["twitch", "https://clips.twitch.tv/AbstractSlipperyPancake-a1", ""],
  ["twitch", "https://www.twitch.tv/directory/game/x", ""],
  // Kick → slug
  ["kick", "@Pitrol", "pitrol"],
  ["kick", "https://kick.com/pitrol/videos", "pitrol"],
  ["kick", "https://kick.com", ""],
  ["kick", "kick.com", ""],
  // YouTube
  ["youtube", "@Pitrol?si=x", "@Pitrol"],
  ["youtube", "https://www.youtube.com/@Pitrol/live", "@Pitrol"],
  ["youtube", "@Fulano/live", "@Fulano"],
  [
    "youtube",
    "youtube.com/channel/UC1234567890123456789012/live",
    "UC1234567890123456789012",
  ],
  ["youtube", "youtube.com/c/SomeName", "youtube.com/c/SomeName"],
  [
    "youtube",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx",
    "dQw4w9WgXcQ",
  ],
  ["youtube", "https://youtu.be/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ"],
  [
    "youtube",
    "https://studio.youtube.com/video/dQw4w9WgXcQ/livestreaming",
    "dQw4w9WgXcQ",
  ],
  [
    "youtube",
    "https://www.youtube.com/embed/live_stream?channel=UCabcdefghijklmnopqrstuv",
    "UCabcdefghijklmnopqrstuv",
  ],
  ["youtube", "https://www.youtube.com/playlist?list=PLabc", ""],
  ["youtube", "Pitrol", "@Pitrol"],
  ["youtube", "fulano.tv", "@fulano.tv"],
  ["youtube", "dQw4w9WgXcQ", "dQw4w9WgXcQ"], // 11-char cru = vídeo (idempotente com a URL)
];

describe("normalizeChatChannel", () => {
  it.each(cases)("[%s] %s → %s", (p, input, want) => {
    const got = normalizeChatChannel(p, input);
    expect(got).toBe(want);
    // idempotência: normalizar o resultado dá o mesmo.
    expect(normalizeChatChannel(p, got)).toBe(got);
  });
});
