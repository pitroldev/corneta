import { DISPLAY_FONT } from "./fonts";

export const CARD_COLORS = {
  night: "#100b07",
  panel: "#1a130c",
  row: "#221a10",
  cream: "#fcf3e3",
  muted: "#8c7a60",
  brass: "#ffb323",
  brassInk: "#2a1c00",
  coral: "#ff5a36",
  live: "#56e39b",
} as const;

export const DESTINATIONS = [
  { name: "Twitch", color: "#9146FF" },
  { name: "YouTube", color: "#FF0000" },
  { name: "Kick", color: "#53FC18" },
] as const;

export function BrandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 54,
          height: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          border: `2px solid ${CARD_COLORS.brassInk}`,
          background: CARD_COLORS.brass,
          boxShadow: `5px 5px 0 0 ${CARD_COLORS.brassInk}`,
          transform: "rotate(-6deg)",
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path
            d="M3.4 9.1 L13 5.9 V18.1 L3.4 14.9 Z"
            fill={CARD_COLORS.brassInk}
          />
          <rect
            x="4.7"
            y="13.9"
            width="2.5"
            height="4.6"
            rx="1.1"
            fill={CARD_COLORS.brassInk}
          />
          <path
            d="M15.6 8.4a5 5 0 0 1 0 7.2M17.8 6.4a8 8 0 0 1 0 11.2"
            stroke={CARD_COLORS.brassInk}
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 40,
          lineHeight: 1,
          letterSpacing: -0.5,
          paddingTop: 6,
        }}
      >
        Corneta
      </span>
    </div>
  );
}

export function Badge({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "9px 14px",
        color: CARD_COLORS.brassInk,
        borderRadius: 5,
        background: CARD_COLORS.brass,
        boxShadow: `4px 4px 0 0 ${CARD_COLORS.brassInk}`,
        fontSize: 18,
        letterSpacing: 0.5,
        transform: "rotate(2deg)",
      }}
    >
      {children}
    </div>
  );
}
