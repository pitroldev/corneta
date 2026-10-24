import { ImageResponse } from "next/og";
import type { Locale } from "@/lib/i18n";
import { SOCIAL_IMAGE_SIZE } from "@/lib/social-image";
import { cardFonts, DISPLAY_FONT, LABEL_FONT } from "./fonts";
import { Badge, BrandMark, CARD_COLORS, DESTINATIONS } from "./parts";

const COPY: Record<
  Locale,
  Record<
    "badge" | "line1" | "line2" | "line3" | "panel" | "live" | "cta",
    string
  >
> = {
  "pt-BR": {
    badge: "MULTISTREAM LOCAL · WINDOWS",
    line1: "Uma live.",
    line2: "Várias comunidades.",
    line3: "Tudo no seu controle.",
    panel: "1 SINAL DO OBS · 3 SAÍDAS",
    live: "NO AR",
    cta: "Baixar grátis para Windows",
  },
  en: {
    badge: "LOCAL MULTISTREAM · WINDOWS",
    line1: "One stream.",
    line2: "Many communities.",
    line3: "You stay in control.",
    panel: "1 OBS SIGNAL · 3 OUTPUTS",
    live: "LIVE",
    cta: "Download free for Windows",
  },
};

const headline = {
  fontFamily: DISPLAY_FONT,
  fontSize: 66,
  lineHeight: 1.05,
  letterSpacing: -1.5,
} as const;

export async function socialCard(locale: Locale) {
  const copy = COPY[locale];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "48px 60px",
        color: CARD_COLORS.cream,
        background: CARD_COLORS.night,
        fontFamily: LABEL_FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BrandMark />
        <Badge>{copy.badge}</Badge>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: 36,
        }}
      >
        <div style={{ width: 648, display: "flex", flexDirection: "column" }}>
          <span style={headline}>{copy.line1}</span>
          <div style={{ display: "flex", marginBlock: 10 }}>
            <span
              style={{
                ...headline,
                display: "flex",
                padding: "10px 16px 2px",
                color: CARD_COLORS.brassInk,
                background: CARD_COLORS.brass,
                boxShadow: `9px 9px 0 0 ${CARD_COLORS.coral}`,
                fontSize: 60,
                transform: "rotate(-1.4deg)",
              }}
            >
              {copy.line2}
            </span>
          </div>
          <span style={headline}>{copy.line3}</span>
        </div>

        <div
          style={{
            width: 396,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 22,
            borderRadius: 14,
            background: CARD_COLORS.panel,
            boxShadow: "8px 8px 0 0 #0b0805",
          }}
        >
          <span
            style={{
              color: CARD_COLORS.muted,
              fontSize: 15,
              letterSpacing: 2,
            }}
          >
            {copy.panel}
          </span>

          {DESTINATIONS.map((destination) => (
            <div
              key={destination.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 7,
                background: CARD_COLORS.row,
                fontSize: 20,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  display: "flex",
                  borderRadius: 5,
                  background: destination.color,
                }}
              />
              {destination.name}
              <span
                style={{
                  marginLeft: "auto",
                  color: CARD_COLORS.live,
                  fontSize: 14,
                  letterSpacing: 1,
                }}
              >
                {copy.live}
              </span>
            </div>
          ))}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 4,
              padding: "14px 18px 10px",
              color: CARD_COLORS.brassInk,
              borderRadius: 7,
              background: CARD_COLORS.coral,
              boxShadow: `5px 5px 0 0 ${CARD_COLORS.cream}`,
              fontFamily: DISPLAY_FONT,
              fontSize: 24,
              lineHeight: 1,
            }}
          >
            {copy.cta}
          </div>
        </div>
      </div>
    </div>,
    { ...SOCIAL_IMAGE_SIZE, fonts: await cardFonts() },
  );
}
