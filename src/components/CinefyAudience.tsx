import { memo } from "react";
import {
  audienceStartedAt,
  audienceStatusText,
  embeddedAudienceText,
} from "../lib/audience";
import { useI18n } from "../lib/i18n";
import type { ViewerItem } from "../lib/types";
import { PlatformGlyph } from "./ui";

export const CinefyAudience = memo(function CinefyAudience({
  items,
}: {
  items: readonly ViewerItem[];
}) {
  const { t, fmt } = useI18n();
  const channels = items.filter(
    (item) => item.platform === "cinefy" && item.audienceStatus,
  );
  if (!channels.length) return null;
  return (
    <div
      className="max-h-32 space-y-2 overflow-y-auto border-t border-border-soft px-3 py-2 text-xs text-ink-muted"
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The bounded scroll region must be keyboard reachable.
      tabIndex={0}
      aria-label={t("audience.cinefy")}
    >
      {channels.map((item) => {
        const startedAt = audienceStartedAt(item.startedAt, { t, fmt });
        return (
          <div key={item.source} className="flex min-w-0 items-start gap-2">
            <PlatformGlyph id="cinefy" size={18} />
            <div className="min-w-0 flex-1">
              <p className="break-words leading-relaxed">
                <strong className="text-ink">{item.source}</strong>
                {" · "}
                {item.audienceStatus === "live" && item.viewers !== null
                  ? t("chat.viewers.count", { n: fmt.num(item.viewers) })
                  : (embeddedAudienceText(item, { t, fmt }) ??
                    audienceStatusText(item, t))}
              </p>
              {item.title ? (
                <p className="truncate" title={item.title}>
                  {item.title}
                </p>
              ) : null}
              {startedAt ? (
                <p className="leading-relaxed">{startedAt}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
});
