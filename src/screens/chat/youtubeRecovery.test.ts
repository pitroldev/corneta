import { describe, expect, it, vi } from "vitest";
import { resolveYoutubeRecovery } from "./youtubeRecovery";

function mockRecovery() {
  return {
    youtubeRetryBroadcastCleanup: vi.fn(async () => {}),
    youtubeAcknowledgeUnknownBroadcast: vi.fn(
      async (_confirmed: boolean) => {},
    ),
  };
}

describe("YouTube recovery confirmation", () => {
  it.each([null, "none", "pending", "unknown"] as const)(
    "never recovers %s during a local stream",
    async (status) => {
      const api = mockRecovery();
      expect(await resolveYoutubeRecovery(api, status, true, false)).toBe(
        false,
      );
      expect(api.youtubeRetryBroadcastCleanup).not.toHaveBeenCalled();
      expect(api.youtubeAcknowledgeUnknownBroadcast).not.toHaveBeenCalled();
    },
  );
  it("requires explicit Studio confirmation only for an unknown creation", async () => {
    const api = mockRecovery();
    expect(await resolveYoutubeRecovery(api, "unknown", false, true)).toBe(
      false,
    );
    expect(api.youtubeAcknowledgeUnknownBroadcast).not.toHaveBeenCalled();
    expect(await resolveYoutubeRecovery(api, "unknown", true, true)).toBe(true);
    expect(
      api.youtubeAcknowledgeUnknownBroadcast,
    ).toHaveBeenCalledExactlyOnceWith(true);
    expect(api.youtubeRetryBroadcastCleanup).not.toHaveBeenCalled();
  });
  it("retries known broadcasts instead of forgetting their IDs", async () => {
    const api = mockRecovery();
    expect(await resolveYoutubeRecovery(api, "pending", false, true)).toBe(
      true,
    );
    expect(api.youtubeRetryBroadcastCleanup).toHaveBeenCalledOnce();
    expect(api.youtubeAcknowledgeUnknownBroadcast).not.toHaveBeenCalled();
  });
  it("propagates vault or remote failures rather than announcing recovery", async () => {
    const api = mockRecovery();
    api.youtubeRetryBroadcastCleanup.mockRejectedValueOnce(
      new Error("vault unavailable"),
    );
    await expect(
      resolveYoutubeRecovery(api, "pending", false, true),
    ).rejects.toThrow("vault unavailable");
  });
});
