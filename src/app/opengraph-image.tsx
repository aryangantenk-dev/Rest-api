import { ImageResponse } from "next/og";

export const alt = "Yanxz API — REST API Gratis Tanpa API Key";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0b0a09", color: "#f3ede4", position: "relative" }}>
        <div style={{ position: "absolute", top: -200, left: -120, width: 700, height: 700, borderRadius: 700, background: "radial-gradient(circle, rgba(255,107,61,0.55), rgba(255,107,61,0) 65%)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -260, right: -100, width: 640, height: 640, borderRadius: 640, background: "radial-gradient(circle, rgba(255,180,84,0.35), rgba(255,180,84,0) 65%)", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#ff6b3d", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
              <path d="M9 9l7 8.5V24M23 9l-7 8.5" stroke="#14110e" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, display: "flex" }}>yanxz.api</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, display: "flex", flexWrap: "wrap" }}>REST API gratis untuk developer.</div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#a69e92", display: "flex" }}>Tanpa API key · AI · QR Code · Cuaca · Al-Qur&apos;an · dan lebih banyak</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#8be3b5" }}>
          <div style={{ display: "flex", padding: "10px 22px", border: "1px solid rgba(255,238,220,0.2)", borderRadius: 999 }}>GET /api/random/quote</div>
          <div style={{ display: "flex", padding: "10px 22px", border: "1px solid rgba(255,238,220,0.2)", borderRadius: 999 }}>GET /api/info/cuaca</div>
        </div>
      </div>
    ),
    size,
  );
}
