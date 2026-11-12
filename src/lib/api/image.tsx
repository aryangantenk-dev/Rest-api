import { ImageResponse } from "next/og";
import type { Endpoint } from "./types";
import { need, normalizeHex, num, opt } from "./helpers";

function hashHue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function contrast(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111111" : "#ffffff";
}

const cacheHeaders = { "cache-control": "public, max-age=86400" };

export const imageEndpoints: Endpoint[] = [
  {
    category: "image", slug: "placeholder", kind: "image",
    title: "Placeholder Image",
    description: "Gambar placeholder PNG dengan ukuran, warna, dan teks kustom untuk mockup desain.",
    params: [
      { name: "width", description: "Lebar (50–2000). Default 600.", example: "600" },
      { name: "height", description: "Tinggi (50–2000). Default 400.", example: "400" },
      { name: "text", description: "Teks di tengah. Default ukuran gambar.", example: "yanz.api" },
      { name: "bg", description: "Warna latar hex.", example: "1f1b18" },
      { name: "color", description: "Warna teks hex.", example: "ff7a45" },
    ],
    handler: async ({ sp }) => {
      const w = Math.round(num(sp, "width", 600, 50, 2000));
      const h = Math.round(num(sp, "height", 400, 50, 2000));
      const text = opt(sp, "text", `${w} × ${h}`).slice(0, 60);
      const bg = normalizeHex(opt(sp, "bg"), "#e5e0d8");
      const color = normalizeHex(opt(sp, "color"), contrast(bg));
      const size = Math.max(12, Math.min(h * 0.18, (w / Math.max(text.length, 4)) * 1.5));
      return new ImageResponse(
        (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color, fontSize: size, fontWeight: 700 }}>
            {text}
          </div>
        ),
        { width: w, height: h, headers: cacheHeaders },
      );
    },
  },
  {
    category: "image", slug: "avatar", kind: "image",
    title: "Avatar Inisial",
    description: "Avatar bulat dari inisial nama dengan warna otomatis yang konsisten untuk setiap nama.",
    params: [
      { name: "name", required: true, description: "Nama lengkap.", example: "Yanz Dev" },
      { name: "size", description: "Ukuran piksel (32–512). Default 256.", example: "256" },
      { name: "bg", description: "Warna latar hex. Default otomatis dari nama.", example: "" },
      { name: "rounded", description: "true untuk bulat penuh. Default true.", example: "true" },
    ],
    handler: async ({ sp }) => {
      const name = need(sp, "name", 80);
      const size = Math.round(num(sp, "size", 256, 32, 512));
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => Array.from(p)[0].toUpperCase()).join("");
      const bg = normalizeHex(opt(sp, "bg"), "") || `hsl(${hashHue(name)}, 55%, 42%)`;
      const fg = bg.startsWith("#") ? contrast(bg) : "#ffffff";
      const round = opt(sp, "rounded", "true") !== "false";
      return new ImageResponse(
        (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: fg, fontSize: size * 0.4, fontWeight: 700, borderRadius: round ? size : 0 }}>
            {initials}
          </div>
        ),
        { width: size, height: size, headers: cacheHeaders },
      );
    },
  },
  {
    category: "image", slug: "ttp", kind: "image",
    title: "Text to Picture",
    description: "Ubah teks menjadi gambar persegi 512×512 dengan huruf tebal, cocok untuk stiker dan status.",
    params: [
      { name: "text", required: true, description: "Teks (maks 120 karakter).", example: "Halo dunia!" },
      { name: "color", description: "Warna teks hex. Default ff6b3d.", example: "ff6b3d" },
      { name: "bg", description: "Warna latar hex. Default 111111.", example: "111111" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 120);
      const bg = normalizeHex(opt(sp, "bg"), "#111111");
      const color = normalizeHex(opt(sp, "color"), "#ff6b3d");
      const size = text.length < 8 ? 120 : text.length < 20 ? 84 : text.length < 50 ? 56 : 40;
      return new ImageResponse(
        (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: bg, color, fontSize: size, fontWeight: 800, textAlign: "center", lineHeight: 1.1 }}>
            {text}
          </div>
        ),
        { width: 512, height: 512, headers: cacheHeaders },
      );
    },
  },
  {
    category: "image", slug: "gradient", kind: "image",
    title: "Gradient Wallpaper",
    description: "Wallpaper gradien PNG. Seed yang sama selalu menghasilkan gambar yang sama.",
    params: [
      { name: "seed", description: "Teks seed. Default acak.", example: "yanz" },
      { name: "width", description: "Lebar (100–2000). Default 1200.", example: "1200" },
      { name: "height", description: "Tinggi (100–2000). Default 630.", example: "630" },
    ],
    handler: async ({ sp }) => {
      const seed = opt(sp, "seed", String(Math.random()));
      const w = Math.round(num(sp, "width", 1200, 100, 2000));
      const h = Math.round(num(sp, "height", 630, 100, 2000));
      const h1 = hashHue(seed), h2 = (h1 + 40 + (hashHue(seed + "x") % 80)) % 360, h3 = (h2 + 60) % 360;
      return new ImageResponse(
        (
          <div style={{ width: "100%", height: "100%", display: "flex", background: `linear-gradient(135deg, hsl(${h1},75%,55%), hsl(${h2},80%,50%) 55%, hsl(${h3},70%,35%))` }} />
        ),
        { width: w, height: h, headers: cacheHeaders },
      );
    },
  },
];
