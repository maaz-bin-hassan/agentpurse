import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0f3d2e",
          color: "#f6f1e4",
          padding: "72px",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: "0.14em", color: "#b7cbbd" }}>AGENTPURSE</div>
        <div style={{ fontSize: 88, lineHeight: 1, letterSpacing: "-0.03em", maxWidth: 960 }}>
          Give your agents a checkbook, not your card.
        </div>
        <div style={{ fontSize: 26, color: "#b7cbbd" }}>PayPal charges the merchant. The purse does not hold the money.</div>
      </div>
    ),
    size,
  );
}
