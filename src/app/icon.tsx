import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ff6b3d", borderRadius: 18 }}>
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
          <path d="M9 9l7 8.5V24M23 9l-7 8.5" stroke="#14110e" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
