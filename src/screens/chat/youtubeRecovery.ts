import type { CornetaApi } from "../../lib/api";

export type YoutubeRecoveryStatus = Awaited<
  ReturnType<CornetaApi["youtubeBroadcastRecoveryStatus"]>
>;

export async function resolveYoutubeRecovery(
  api: Pick<
    CornetaApi,
    "youtubeRetryBroadcastCleanup" | "youtubeAcknowledgeUnknownBroadcast"
  >,
  status: YoutubeRecoveryStatus | null,
  confirmed: boolean,
  stopped: boolean,
): Promise<boolean> {
  if (!stopped || status === null || status === "none") return false;
  if (status === "unknown") {
    if (!confirmed) return false;
    await api.youtubeAcknowledgeUnknownBroadcast(true);
  } else {
    await api.youtubeRetryBroadcastCleanup();
  }
  return true;
}
