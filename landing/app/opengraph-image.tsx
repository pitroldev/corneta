import { ImageResponse } from "next/og";

export const alt = "Corneta — uma live, todo mundo ouvindo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "76px",
        color: "#fff8e8",
        background: "#100b07",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -190,
          width: 570,
          height: 570,
          display: "flex",
          border: "42px solid rgba(255,179,35,.16)",
          borderRadius: "999px",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", width: 920 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: "#ffb323",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 4,
          }}
        >
          <span style={{ width: 18, height: 18, background: "#ff5634" }} />
          CORNETA · MULTISTREAM LOCAL
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 40,
            fontSize: 108,
            fontWeight: 900,
            lineHeight: 0.86,
            letterSpacing: -6,
          }}
        >
          <span>UMA LIVE.</span>
          <span
            style={{
              color: "#100b07",
              background: "#ffb323",
              padding: "6px 18px 12px",
            }}
          >
            TODO MUNDO
          </span>
          <span>OUVINDO.</span>
        </div>
      </div>
    </div>,
    size,
  );
}
