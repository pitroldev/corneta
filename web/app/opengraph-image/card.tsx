import { ImageResponse } from "next/og";
import type { Locale } from "@/lib/i18n";
import { SOCIAL_IMAGE_SIZE } from "@/lib/social-image";

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

const destinations = [
  { name: "Twitch", color: "#9146FF", ink: "#ffffff" },
  { name: "YouTube", color: "#FF0000", ink: "#ffffff" },
  { name: "Kick", color: "#53FC18", ink: "#100b07" },
];

export function socialCard(locale: Locale) {
  const copy = COPY[locale];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "48px 60px",
        color: "#fcf3e3",
        background: "#100b07",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 54,
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              border: "2px solid #2a1c00",
              background: "#ffb323",
              boxShadow: "5px 5px 0 0 #2a1c00",
              transform: "rotate(-6deg)",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M3.4 9.1 L13 5.9 V18.1 L3.4 14.9 Z" fill="#2a1c00" />
              <rect
                x="4.7"
                y="13.9"
                width="2.5"
                height="4.6"
                rx="1.1"
                fill="#2a1c00"
              />
              <path
                d="M15.6 8.4a5 5 0 0 1 0 7.2M17.8 6.4a8 8 0 0 1 0 11.2"
                stroke="#2a1c00"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1 }}>
            Corneta
          </span>
        </div>

        <div
          style={{
            display: "flex",
            padding: "9px 14px",
            color: "#2a1c00",
            borderRadius: 5,
            background: "#ffb323",
            boxShadow: "4px 4px 0 0 #2a1c00",
            fontSize: 18,
            fontWeight: 900,
            transform: "rotate(2deg)",
          }}
        >
          {copy.badge}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: 48,
        }}
      >
        <div style={{ width: 610, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 78, fontWeight: 900, letterSpacing: -3 }}>
            {copy.line1}
          </span>
          <div style={{ display: "flex", marginBlock: 8 }}>
            <span
              style={{
                display: "flex",
                padding: "4px 16px 12px",
                color: "#2a1c00",
                background: "#ffb323",
                boxShadow: "9px 9px 0 0 #ff5a36",
                fontSize: 74,
                fontWeight: 900,
                letterSpacing: -3,
                transform: "rotate(-1.4deg)",
              }}
            >
              {copy.line2}
            </span>
          </div>
          <span style={{ fontSize: 78, fontWeight: 900, letterSpacing: -3 }}>
            {copy.line3}
          </span>
        </div>

        <div
          style={{
            width: 396,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 22,
            borderRadius: 14,
            background: "#1a130c",
            boxShadow: "8px 8px 0 0 #0b0805",
          }}
        >
          <span
            style={{
              color: "#8c7a60",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            {copy.panel}
          </span>

          {destinations.map((destination) => (
            <div
              key={destination.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 7,
                background: "#221a10",
                fontSize: 20,
                fontWeight: 800,
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
                  color: "#56e39b",
                  fontSize: 14,
                  fontWeight: 900,
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
              padding: "15px 18px",
              color: "#2a1c00",
              borderRadius: 7,
              background: "#ff5a36",
              boxShadow: "5px 5px 0 0 #fcf3e3",
              fontSize: 21,
              fontWeight: 900,
            }}
          >
            {copy.cta}
          </div>
        </div>
      </div>
    </div>,
    SOCIAL_IMAGE_SIZE,
  );
}
