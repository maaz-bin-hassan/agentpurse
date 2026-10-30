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
          background: "#f4efe6",
          color: "#1c1712",
          padding: "72px",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: "0.16em", color: "#8a5a12" }}>AGENTIC COMMERCE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 84, lineHeight: 0.95, letterSpacing: "-0.04em" }}>AgentPurse</div>
          <div style={{ fontSize: 32, maxWidth: 820 }}>
            Agents can ask to spend. They cannot be the ones who decide.
          </div>
        </div>
        <div style={{ fontSize: 24 }}>PayPal charges the merchant. The purse does not hold the money.</div>
      </div>
    ),
    size,
  );
}
