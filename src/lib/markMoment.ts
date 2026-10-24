import { accountProvider } from "../platforms";
import type { I18n, MessageKey } from "./i18n";
import { joinNames } from "./readiness";
import { toast } from "./toast";
import type { PlatformMark } from "./types";

const WARNING_KEYS: Record<
  Exclude<PlatformMark["outcome"], "marked">,
  MessageKey
> = {
  unavailable: "golive.toast.marker.unavailable",
  reconnect: "golive.toast.marker.reconnect",
  failed: "golive.toast.marker.failed",
};

export interface MarkFeedback {
  success: string;
  warnings: string[];
}

// Portuguese copy takes the name with its preposition ("da Twitch"); English uses the plain name.
function platformLabel(id: string, locale: I18n["locale"]): string {
  const provider = accountProvider(id);
  if (!provider) return id;
  return locale === "pt-BR" ? provider.pt.of : provider.name;
}

export function markFeedback(
  marks: readonly PlatformMark[],
  { t, locale }: Pick<I18n, "t" | "locale">,
): MarkFeedback {
  const marked = marks
    .filter((mark) => mark.outcome === "marked")
    .map((mark) => platformLabel(mark.platform, locale));
  return {
    success: marked.length
      ? t("golive.toast.markerSavedOn", { platforms: joinNames(marked, t) })
      : t("golive.toast.markerSaved"),
    warnings: marks.flatMap(({ platform, outcome }) =>
      outcome === "marked"
        ? []
        : [
            t(WARNING_KEYS[outcome], {
              platform: platformLabel(platform, locale),
            }),
          ],
    ),
  };
}

export function announceMark(
  marks: readonly PlatformMark[],
  i18n: Pick<I18n, "t" | "locale">,
): void {
  const { success, warnings } = markFeedback(marks, i18n);
  toast.success(success);
  for (const warning of warnings) toast.info(warning);
}
