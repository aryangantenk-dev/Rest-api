import { ImageResponse } from "next/og";
import { endpoints } from "@/lib/api/registry";
import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} — REST API Gratis Tanpa API Key`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ImageResponse tidak membaca variabel CSS, jadi warna merek ditulis langsung di sini.
const ink = "#0F172A";
const paper = "#F8FAFC";
const green = "#22C55E";
const greenText = "#14763A";
const muted = "#475569";
const line = "#D5DCE5";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: paper, color: ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, background: green, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="38" height="38" viewBox="0 0 32 32" fill="none">
              <path d="M9 8l7 9v7M23 8l-7 9" stroke={ink} strokeWidth="3.5" strokeLinecap="square" />
            </svg>
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, display: "flex" }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>{endpoints.length} endpoint REST API. Gratis, tanpa API key.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: muted, display: "flex" }}>AI, downloader, canvas, data BMKG, Al-Qur&apos;an, komik, anime, dan film dalam satu base URL.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", borderTop: `2px solid ${line}`, paddingTop: 28, fontSize: 28 }}>
          <div style={{ display: "flex", color: greenText, fontWeight: 700, marginRight: 18 }}>GET</div>
          <div style={{ display: "flex" }}>/api/random/quote</div>
        </div>
      </div>
    ),
    size,
  );
}
