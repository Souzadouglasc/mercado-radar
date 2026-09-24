import { ImageResponse } from "next/og";

// OG image default (1200x630) — verde profundo + radar + R$.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c3b24",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 28,
              background: "#178a4c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            R$
          </div>
          <div style={{ fontSize: 84, fontWeight: 800 }}>MercadoRadar</div>
        </div>
        <div style={{ marginTop: 24, fontSize: 36, opacity: 0.85 }}>
          Compare preços nos mercados da região e economize
        </div>
      </div>
    ),
    { ...size },
  );
}
