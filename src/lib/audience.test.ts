import { describe, expect, it } from "vitest";
import {
  audienceStartedAt,
  audienceStatusText,
  audienceTooltip,
  audienceTotal,
  embeddedAudienceText,
  showAudience,
} from "./audience";
import { buildI18n } from "./i18n/core";
import { pt } from "./i18n/pt";
import { en } from "./i18n/en";
import type { ViewerItem, Viewers } from "./types";

const native: ViewerItem = {
  platform: "cinefy",
  source: "Cinefy channel",
  viewers: 0,
  live: true,
  audienceStatus: "live",
};
const embedded: ViewerItem = {
  ...native,
  viewers: null,
  audienceStatus: "embedded",
  audienceOrigin: "twitch",
};
const snapshot = (items: ViewerItem[]): Viewers => ({
  items,
  total: items.reduce((total, item) => total + (item.viewers ?? 0), 0),
  anyLive: items.some((item) => item.live),
});

describe.each([
  {
    locale: "pt-BR" as const,
    dictionary: pt,
    excluded: "audiência não somada",
    unavailable: "indisponível",
  },
  {
    locale: "en" as const,
    dictionary: en,
    excluded: "excluded from the total",
    unavailable: "unavailable",
  },
])(
  "audience presentation ($locale)",
  ({ locale, dictionary, excluded, unavailable }) => {
    const i18n = buildI18n(locale, dictionary);
    it("shows a measured zero and distinguishes it from an unavailable count", () => {
      expect(showAudience(snapshot([native]))).toBe(true);
      expect(audienceTotal(snapshot([native]), i18n.fmt)).toBe("0");
      const missing = {
        ...native,
        live: false,
        viewers: null,
        audienceStatus: "unavailable",
      } as const;
      expect(showAudience(snapshot([missing]))).toBe(true);
      expect(audienceTotal(snapshot([missing]), i18n.fmt)).toBe("—");
      expect(audienceTooltip([missing], i18n)).toContain(unavailable);
    });
    it("identifies an embedded platform without presenting its count as Cinefy audience", () => {
      expect(audienceTotal(snapshot([embedded]), i18n.fmt)).toBe("—");
      expect(audienceStatusText(embedded, i18n.t)).toContain("Twitch");
      expect(audienceTooltip([embedded], i18n)).toContain(excluded);
      expect(audienceTooltip([embedded], i18n)).not.toContain(": 0");
    });
    it("keeps native counts and external notices together in a mixed tooltip", () => {
      const twitch = {
        ...native,
        platform: "twitch",
        source: "Twitch channel",
        viewers: 123,
        audienceStatus: undefined,
      } as const;
      expect(audienceTotal(snapshot([twitch, embedded]), i18n.fmt)).toBe("123");
      const text = audienceTooltip([twitch, embedded], i18n);
      expect(text).toContain("Twitch channel: 123");
      expect(text).toContain(excluded);
    });
    it("keeps an unknown embedded origin explicit", () => {
      expect(
        audienceStatusText(
          { audienceStatus: "embedded", audienceOrigin: "external" },
          i18n.t,
        ),
      ).toContain(excluded);
    });
    it("shows a reported embedded count only as external audience", () => {
      const item = { ...embedded, embeddedViewers: 1115 };
      expect(audienceTotal(snapshot([item]), i18n.fmt)).toBe("—");
      const text = embeddedAudienceText(item, i18n);
      expect(text).toContain("Twitch");
      expect(text).toContain(i18n.fmt.num(1115));
      expect(text).toContain(excluded);
      expect(audienceTooltip([item], i18n)).toContain(text);
      expect(
        embeddedAudienceText({ ...native, embeddedViewers: 999 }, i18n),
      ).toBeNull();
      expect(
        embeddedAudienceText({ ...embedded, embeddedViewers: -1 }, i18n),
      ).toBeNull();
      expect(
        embeddedAudienceText(
          { ...embedded, embeddedViewers: Number.NaN },
          i18n,
        ),
      ).toBeNull();
    });
    it("labels a partial count instead of implying the unavailable channel has no viewers", () => {
      const known = { ...native, source: "Known channel", viewers: 100 };
      const unknown = {
        ...native,
        viewers: null,
        audienceStatus: "unavailable",
      } as const;
      expect(audienceTotal(snapshot([known, unknown]), i18n.fmt)).toBe("≥ 100");
      expect(audienceTooltip([known, unknown], i18n)).toContain(
        i18n.t("audience.partial"),
      );
    });
    it("does not imply a live stream for an observed offline zero", () => {
      const offline = {
        ...native,
        live: false,
        audienceStatus: "offline",
      } as const;
      expect(audienceTotal(snapshot([offline]), i18n.fmt)).toBe("0");
      expect(audienceStatusText(offline, i18n.t)).toBe(
        i18n.t("audience.offline"),
      );
    });
    it("ignores missing or invalid start times", () => {
      expect(audienceStartedAt(undefined, i18n)).toBeNull();
      expect(audienceStartedAt("invalid", i18n)).toBeNull();
      expect(audienceStartedAt("2026-09-09T19:11:46Z", i18n)).not.toBeNull();
    });
    it("preserves the empty legacy counter state", () => {
      expect(showAudience({ total: 0, anyLive: false, items: [] })).toBe(false);
    });
  },
);
