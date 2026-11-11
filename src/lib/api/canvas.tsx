import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { binaryResponse, fetchRaw, need, normalizeHex, num, opt, parseHttpUrl } from "./helpers";

/* ------------------------------------------------------------------ */
/* Font & render                                                        */
/* ------------------------------------------------------------------ */

type Weight = 400 | 500 | 600 | 700 | 800;
type Font = { name: string; data: Buffer; weight: Weight; style: "normal" };

const FONT_FILES: [string, string, Weight][] = [
  ["Inter", "inter-latin-400-normal.woff", 400],
  ["Inter", "inter-latin-600-normal.woff", 600],
  ["Inter", "inter-latin-700-normal.woff", 700],
  ["Inter", "inter-latin-800-normal.woff", 800],
  ["Inter", "inter-latin-ext-400-normal.woff", 400],
  ["Inter", "inter-latin-ext-700-normal.woff", 700],
  ["Narrow", "archivo-narrow-latin-500-normal.woff", 500],
  ["Narrow", "archivo-narrow-latin-700-normal.woff", 700],
  ["Mono", "jetbrains-mono-latin-400-normal.woff", 400],
  ["Mono", "jetbrains-mono-latin-700-normal.woff", 700],
];

let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    fontsPromise = Promise.all(
      FONT_FILES.map(async ([name, file, weight]) => ({ name, weight, style: "normal" as const, data: await readFile(path.join(dir, file)) })),
    );
    fontsPromise.catch(() => {
      fontsPromise = null;
    });
  }
  return fontsPromise;
}

async function render(node: ReactElement, width: number, height: number): Promise<Response> {
  let buf: ArrayBuffer;
  try {
    const fonts = await loadFonts();
    buf = await new ImageResponse(node, { width, height, fonts, emoji: "twemoji" }).arrayBuffer();
  } catch (e) {
    console.error("[canvas]", e);
    if (e instanceof Error && /fetch failed/i.test(e.message)) throw new HttpError(502, "Gagal memuat aset emoji dari CDN. Coba lagi, atau kirim teks tanpa emoji.");
    throw new HttpError(500, "Gagal merender gambar. Periksa teks atau URL gambar yang dikirim.");
  }
  if (!buf.byteLength) throw new HttpError(500, "Gagal merender gambar. Periksa teks atau URL gambar yang dikirim (gunakan JPG/PNG).");
  return binaryResponse(buf, "image/png", "public, max-age=86400");
}

/* ------------------------------------------------------------------ */
/* Util                                                                 */
/* ------------------------------------------------------------------ */

/** Unduh gambar dari URL pengguna lalu jadikan data URI agar bisa ditanam ke kanvas. */
async function loadImage(raw: string, maxBytes = 3_000_000): Promise<string> {
  const u = parseHttpUrl(raw);
  const res = await fetchRaw(
    u.toString(),
    { headers: { accept: "image/png,image/jpeg,image/gif,image/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; YanxzAPI/1.0)" } },
    10000,
  );
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(type)) throw new HttpError(400, "URL gambar harus mengarah langsung ke file PNG, JPG, GIF, atau WebP.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new HttpError(400, `Ukuran gambar terlalu besar (maks ${Math.round(maxBytes / 1e6)} MB).`);
  if (buf.length < 32) throw new HttpError(400, "File gambar kosong atau rusak.");
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function optImage(sp: URLSearchParams, name: string): Promise<string | null> {
  const raw = opt(sp, name);
  return raw ? loadImage(raw) : null;
}

function hashNum(s: string) {
  let h = 7;
  for (const c of s) h = (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => Array.from(p)[0].toUpperCase())
    .join("");
}

function Avatar({ src, name, size, ring }: { src: string | null; name: string; size: number; ring?: string }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...(ring ? { border: `${Math.max(3, Math.round(size / 28))}px solid ${ring}` } : {}),
  };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} width={size} height={size} style={{ ...style, objectFit: "cover" }} />;
  }
  return (
    <div style={{ ...style, background: `hsl(${hashNum(name) % 360}, 55%, 45%)`, color: "#fff", fontSize: size * 0.4, fontWeight: 700 }}>
      {initials(name) || "?"}
    </div>
  );
}

/** Perkiraan jumlah baris teks setelah dibungkus, untuk menghitung tinggi kanvas. */
function wrapLines(text: string, perLine: number): number {
  let lines = 0;
  for (const para of text.split("\n")) {
    let cur = 0;
    let n = 1;
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const len = Array.from(w).length;
      if (len > perLine) {
        n += Math.floor((cur + len) / perLine);
        cur = (cur + len) % perLine;
      } else if (cur && cur + 1 + len > perLine) {
        n++;
        cur = len;
      } else {
        cur += (cur ? 1 : 0) + len;
      }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

/** Ukuran huruf terbesar agar `text` muat di kotak w x h. `ratio` = rata-rata lebar huruf / ukuran huruf. */
function fitFont(text: string, w: number, h: number, ratio: number, lineHeight: number, max: number, min: number): number {
  const longest = Math.max(...text.split(/\s+/).map((x) => Array.from(x).length), 1);
  for (let size = max; size > min; size -= 2) {
    const perLine = Math.floor(w / (size * ratio));
    if (perLine < 1 || longest > perLine) continue;
    if (wrapLines(text, perLine) * size * lineHeight <= h) return size;
  }
  return min;
}

const wibTime = () =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date());

const cleanText = (s: string) => s.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "");

const fill: CSSProperties = { width: "100%", height: "100%", display: "flex" };

/* ------------------------------------------------------------------ */
/* Kartu welcome / goodbye                                              */
/* ------------------------------------------------------------------ */

async function greetingCard(sp: URLSearchParams, kind: "welcome" | "goodbye") {
  const name = need(sp, "name", 40);
  const group = opt(sp, "group", "Grup Kita").slice(0, 50);
  const count = opt(sp, "count").replace(/[^\d]/g, "").slice(0, 7);
  const [avatar, bg] = await Promise.all([optImage(sp, "avatar"), optImage(sp, "background")]);
  const accent = normalizeHex(opt(sp, "color"), kind === "welcome" ? "#ff7a45" : "#7aa2ff");
  const heading = kind === "welcome" ? "SELAMAT DATANG" : "SELAMAT TINGGAL";
  const sub = kind === "welcome" ? `di ${group}` : `dari ${group}`;
  const foot = count ? (kind === "welcome" ? `Member ke-${count}` : `Tersisa ${count} member`) : kind === "welcome" ? "Semoga betah ya!" : "Sampai jumpa lagi!";
  return render(
    <div style={{ ...fill, position: "relative", fontFamily: "Inter", color: "#fff", background: "#14110e" }}>
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={bg} width={1024} height={450} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", background: `linear-gradient(135deg, #1b1512 0%, #241a15 45%, ${accent}55 130%)` }} />
      )}
      <div style={{ position: "absolute", inset: 0, display: "flex", background: bg ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)" }} />
      <div style={{ position: "absolute", top: -160, right: -120, width: 460, height: 460, borderRadius: 460, display: "flex", background: `radial-gradient(circle, ${accent}66, ${accent}00 70%)` }} />
      <div style={{ ...fill, position: "relative", alignItems: "center", padding: "0 64px", gap: 48 }}>
        <Avatar src={avatar} name={name} size={230} ring={accent} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 6, color: accent }}>{heading}</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: name.length > 18 ? 52 : 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{name}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 30, color: "#d8cfc4" }}>{sub}</div>
          <div style={{ display: "flex", marginTop: 26 }}>
            <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 22, fontWeight: 600 }}>{foot}</div>
          </div>
        </div>
      </div>
    </div>,
    1024,
    450,
  );
}

const greetingParams = (kind: "welcome" | "goodbye") => [
  { name: "name", required: true, description: "Nama member.", example: "Yanxz" },
  { name: "group", description: "Nama grup.", example: "Yanxz Community" },
  { name: "count", description: kind === "welcome" ? "Urutan member (angka)." : "Sisa jumlah member (angka).", example: "128" },
  { name: "avatar", description: "URL foto profil (JPG/PNG). Kosongkan untuk avatar inisial.", example: "" },
  { name: "background", description: "URL gambar latar (opsional).", example: "" },
  { name: "color", description: "Warna aksen hex.", example: kind === "welcome" ? "ff7a45" : "7aa2ff" },
];

/* ------------------------------------------------------------------ */
/* Ikon kecil (SVG)                                                     */
/* ------------------------------------------------------------------ */

function Signal({ color }: { color: string }) {
  return (
    <svg width="36" height="24" viewBox="0 0 36 24">
      <rect x="0" y="16" width="6" height="8" rx="1.5" fill={color} />
      <rect x="10" y="11" width="6" height="13" rx="1.5" fill={color} />
      <rect x="20" y="6" width="6" height="18" rx="1.5" fill={color} />
      <rect x="30" y="0" width="6" height="24" rx="1.5" fill={color} />
    </svg>
  );
}

function Battery({ level, color }: { level: number; color: string }) {
  const w = Math.round(38 * (level / 100));
  return (
    <svg width="54" height="26" viewBox="0 0 54 26">
      <rect x="1" y="1" width="46" height="24" rx="7" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="2" />
      <rect x="5" y="5" width={w} height="16" rx="4" fill={level <= 20 ? "#ff453a" : color} />
      <rect x="49.5" y="9" width="3.5" height="8" rx="1.5" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

function MenuRow({ label, danger, last, children }: { label: string; danger?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", height: 78, borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.09)", color: danger ? "#ff453a" : "#fff", fontSize: 31 }}>
      <div style={{ display: "flex" }}>{label}</div>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={danger ? "#ff453a" : "#fff"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Endpoint                                                             */
/* ------------------------------------------------------------------ */

export const canvasEndpoints: Endpoint[] = [
  {
    category: "canvas", slug: "brat", kind: "image",
    title: "Brat",
    description: "Stiker teks gaya brat: huruf rapat, sedikit buram, ukuran menyesuaikan panjang teks. Hasil PNG 512×512.",
    params: [
      { name: "text", required: true, description: "Teks (maks 250 karakter).", example: "aku capek jadi orang baik" },
      { name: "tema", description: "putih (default), hijau, atau hitam.", example: "putih" },
      { name: "blur", description: "false untuk mematikan efek buram.", example: "true" },
    ],
    handler: async ({ sp }) => {
      const text = cleanText(need(sp, "text", 250)).replace(/\s+/g, " ").trim().toLowerCase();
      const tema = opt(sp, "tema", "putih").toLowerCase();
      const [bg, fg] = tema === "hijau" || tema === "green" ? ["#8ace00", "#000000"] : tema === "hitam" || tema === "black" ? ["#000000", "#ffffff"] : ["#ffffff", "#000000"];
      const blur = opt(sp, "blur", "true") !== "false";
      const pad = 26;
      const size = fitFont(text, 512 - pad * 2, 512 - pad * 2, 0.46, 1.04, 230, 26);
      const words = text.split(" ");
      return render(
        <div style={{ ...fill, background: bg, padding: pad }}>
          <div
            style={{
              ...fill,
              flexWrap: "wrap",
              alignContent: "space-between",
              justifyContent: words.length > 1 ? "space-between" : "center",
              alignItems: "center",
              columnGap: size * 0.24,
              fontFamily: "Narrow",
              fontWeight: 500,
              fontSize: size,
              lineHeight: 1.04,
              color: fg,
              ...(blur ? { filter: `blur(${Math.max(1.2, size / 60).toFixed(1)}px)` } : {}),
            }}
          >
            {words.map((w, i) => (
              <div key={i} style={{ display: "flex" }}>
                {w}
              </div>
            ))}
          </div>
        </div>,
        512,
        512,
      );
    },
  },
  {
    category: "canvas", slug: "iqc", kind: "image",
    title: "iPhone Quoted Chat (IQC)",
    description: "Tangkapan layar ala iPhone: satu pesan chat yang sedang ditekan lama, lengkap dengan status bar, bar reaksi, dan menu.",
    params: [
      { name: "text", required: true, description: "Isi pesan (maks 500 karakter).", example: "besok jadi kan? jangan php lagi ya" },
      { name: "jam", description: "Jam di status bar & pesan (HH:MM). Default jam sekarang (WIB).", example: "21:07" },
      { name: "baterai", description: "Persentase baterai 1–100. Default 82.", example: "82" },
      { name: "operator", description: "Nama operator. Default Telkomsel.", example: "Telkomsel" },
      { name: "reaksi", description: "false untuk menyembunyikan bar reaksi emoji.", example: "true" },
    ],
    handler: async ({ sp }) => {
      const text = cleanText(need(sp, "text", 500)).trim();
      const jamRaw = opt(sp, "jam");
      const jam = /^\d{1,2}[:.]\d{2}$/.test(jamRaw) ? jamRaw.replace(".", ":") : wibTime();
      const battery = Math.round(num(sp, "baterai", 82, 1, 100));
      const carrier = opt(sp, "operator", "Telkomsel").slice(0, 14);
      const showReactions = opt(sp, "reaksi", "true") !== "false";
      const W = 828;
      const fontSize = 35;
      const perLine = 31;
      const lines = Math.min(wrapLines(text, perLine), 24);
      const bubbleH = lines * Math.round(fontSize * 1.32) + 76;
      const H = 130 + (showReactions ? 118 : 0) + bubbleH + 30 + 78 * 5 + 90;
      const reactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
      return render(
        <div style={{ ...fill, flexDirection: "column", fontFamily: "Inter", color: "#fff", background: "linear-gradient(180deg, #0c0c0e 0%, #17171a 55%, #0e0e10 100%)" }}>
          {/* status bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 100, padding: "22px 52px 0" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>{jam}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{carrier}</div>
              <Signal color="#fff" />
              <div style={{ display: "flex", fontSize: 27, fontWeight: 700 }}>5G</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 600 }}>{battery}</div>
                <Battery level={battery} color="#fff" />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "30px 36px 0" }}>
            {/* bar reaksi */}
            {showReactions ? (
              <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", gap: 20, height: 88, padding: "0 26px", borderRadius: 44, background: "#232326" }}>
                {reactions.map((r) => (
                  <div key={r} style={{ display: "flex", fontSize: 44, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                    {r}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 26, background: "#3a3a3e", fontSize: 38, color: "#9c9ca3", lineHeight: 1 }}>+</div>
              </div>
            ) : null}
            {/* gelembung pesan */}
            <div style={{ display: "flex", alignSelf: "flex-start", maxWidth: 640, minWidth: 190, marginTop: showReactions ? 30 : 0, padding: "18px 24px 16px", borderRadius: 26, borderBottomLeftRadius: 8, background: "#262629", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize, lineHeight: 1.32, whiteSpace: "pre-wrap" }}>{text}</div>
              <div style={{ display: "flex", alignSelf: "flex-end", marginTop: 4, fontSize: 22, color: "rgba(255,255,255,0.5)" }}>{jam}</div>
            </div>
            {/* menu */}
            <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", width: 470, marginTop: 30, borderRadius: 26, background: "#232326", overflow: "hidden" }}>
              <MenuRow label="Balas">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a6 6 0 0 1 6 6v4" />
              </MenuRow>
              <MenuRow label="Teruskan">
                <path d="M15 14l5-5-5-5" />
                <path d="M20 9H10a6 6 0 0 0-6 6v4" />
              </MenuRow>
              <MenuRow label="Salin">
                <rect x="9" y="9" width="11" height="11" rx="2.5" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </MenuRow>
              <MenuRow label="Beri Bintang">
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
              </MenuRow>
              <MenuRow label="Hapus" danger last>
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </MenuRow>
            </div>
          </div>
        </div>,
        W,
        Math.min(H, 2200),
      );
    },
  },
  {
    category: "canvas", slug: "wmp", kind: "image",
    title: "Windows Media Player",
    description: "Kartu \"sedang diputar\" bergaya jendela Windows Media Player klasik: sampul, judul, artis, dan bilah durasi.",
    params: [
      { name: "title", required: true, description: "Judul lagu.", example: "Lagu Favoritku" },
      { name: "artist", description: "Nama artis.", example: "Yanxz" },
      { name: "image", description: "URL sampul album (JPG/PNG). Opsional.", example: "" },
      { name: "current", description: "Posisi putar (m:ss). Default 1:12.", example: "1:12" },
      { name: "duration", description: "Durasi total (m:ss). Default 3:45.", example: "3:45" },
    ],
    handler: async ({ sp }) => {
      const title = need(sp, "title", 70);
      const artist = opt(sp, "artist", "Artis tidak dikenal").slice(0, 60);
      const cover = await optImage(sp, "image");
      const toSec = (s: string, fb: number) => {
        const m = /^(\d{1,3}):([0-5]\d)$/.exec(s);
        return m ? Number(m[1]) * 60 + Number(m[2]) : fb;
      };
      const fmt = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
      const dur = Math.max(1, toSec(opt(sp, "duration"), 225));
      const cur = Math.min(dur, toSec(opt(sp, "current"), 72));
      const pct = Math.round((cur / dur) * 100);
      const hue = hashNum(title) % 360;
      const ctl = (child: ReactNode, size = 46) => (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size, background: "linear-gradient(180deg, #5d6f86, #2b3646)", border: "1px solid #101722" }}>{child}</div>
      );
      return render(
        <div style={{ ...fill, padding: 22, background: "linear-gradient(135deg, #1d5fa8, #0a2a55)", fontFamily: "Inter" }}>
          <div style={{ ...fill, flexDirection: "column", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.55)", boxShadow: "0 18px 50px rgba(0,0,0,0.55)" }}>
            {/* title bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 46, padding: "0 8px 0 14px", background: "linear-gradient(180deg, #cfe3f7 0%, #9fc3e8 48%, #86b2e0 52%, #a9cdf0 100%)", color: "#0d1b2e" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 12, background: "linear-gradient(135deg, #ff9a2e, #e2531c)" }}>
                  <svg width="11" height="11" viewBox="0 0 10 10">
                    <path d="M2 1l7 4-7 4z" fill="#fff" />
                  </svg>
                </div>
                <div style={{ display: "flex", fontSize: 17, fontWeight: 600 }}>Windows Media Player</div>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {["#dfe9f5", "#dfe9f5", "#e04a3a"].map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: i === 2 ? 46 : 30, height: 24, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,0.3)", color: i === 2 ? "#fff" : "#1b2b40", fontSize: 14, fontWeight: 700 }}>
                    {i === 1 ? <div style={{ display: "flex", width: 11, height: 9, border: "2px solid #1b2b40" }} /> : i === 0 ? "–" : "x"}
                  </div>
                ))}
              </div>
            </div>
            {/* now playing */}
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 36, padding: "0 44px", background: "radial-gradient(circle at 30% 20%, #1c2a3d 0%, #070b12 70%)", color: "#fff" }}>
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img src={cover} width={230} height={230} style={{ objectFit: "cover", borderRadius: 6, border: "2px solid rgba(255,255,255,0.35)" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 230, height: 230, borderRadius: 6, border: "2px solid rgba(255,255,255,0.35)", background: `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${(hue + 70) % 360},75%,30%))` }}>
                  <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l11-2v13" />
                    <circle cx="6.5" cy="18" r="2.5" />
                    <circle cx="17.5" cy="16" r="2.5" />
                  </svg>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", fontSize: 17, letterSpacing: 3, color: "#7fb4ff", fontWeight: 600 }}>SEDANG DIPUTAR</div>
                <div style={{ display: "flex", marginTop: 12, fontSize: title.length > 28 ? 34 : 44, fontWeight: 700, lineHeight: 1.12 }}>{title}</div>
                <div style={{ display: "flex", marginTop: 12, fontSize: 25, color: "#b8c6d9" }}>{artist}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginTop: 26, height: 44 }}>
                  {Array.from({ length: 26 }, (_, i) => (
                    <div key={i} style={{ display: "flex", width: 8, height: 8 + (((hashNum(title) >>> (i % 13)) + i * 17) % 36), borderRadius: 2, background: "linear-gradient(180deg, #8fd0ff, #2f7fe0)" }} />
                  ))}
                </div>
              </div>
            </div>
            {/* kontrol */}
            <div style={{ display: "flex", flexDirection: "column", padding: "14px 26px 16px", background: "linear-gradient(180deg, #3b4658 0%, #1a212d 55%, #10151d 100%)", color: "#dfe7f2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ display: "flex", fontSize: 17, width: 52 }}>{fmt(cur)}</div>
                <div style={{ display: "flex", flex: 1, height: 10, borderRadius: 5, background: "#0a0e14", border: "1px solid #4a586c" }}>
                  <div style={{ display: "flex", width: `${pct}%`, height: "100%", borderRadius: 5, background: "linear-gradient(180deg, #9fe07a, #3fa52c)" }} />
                </div>
                <div style={{ display: "flex", fontSize: 17, width: 52, justifyContent: "flex-end" }}>{fmt(dur)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 12 }}>
                {ctl(
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="#e8eef7" />
                  </svg>,
                )}
                {ctl(
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    <path d="M19 5v14l-9-7zM6 5h2.5v14H6z" fill="#e8eef7" />
                  </svg>,
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 74, height: 74, borderRadius: 37, background: "radial-gradient(circle at 50% 30%, #8fd0ff, #1f6fd6 65%, #0f3f8c)", border: "2px solid #cfe6ff" }}>
                  <svg width="30" height="30" viewBox="0 0 24 24">
                    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="#fff" />
                  </svg>
                </div>
                {ctl(
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    <path d="M5 5v14l9-7zM15.5 5H18v14h-2.5z" fill="#e8eef7" />
                  </svg>,
                )}
                {ctl(
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e8eef7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10v4h4l5 4V6L8 10H4z" fill="#e8eef7" />
                    <path d="M16.5 9a4 4 0 0 1 0 6" />
                  </svg>,
                )}
              </div>
            </div>
          </div>
        </div>,
        900,
        560,
      );
    },
  },
  {
    category: "canvas", slug: "ktp", kind: "image",
    title: "Kartu Identitas Parodi (KTP)",
    description: "Kartu identitas tiruan untuk lucu-lucuan. Selalu diberi tanda SPESIMEN besar dan bukan dokumen resmi.",
    params: [
      { name: "nama", required: true, description: "Nama lengkap.", example: "Budi Santoso" },
      { name: "nik", description: "Nomor (16 digit). Default acak.", example: "" },
      { name: "ttl", description: "Tempat, tanggal lahir.", example: "Jakarta, 17-08-2001" },
      { name: "jk", description: "Jenis kelamin.", example: "Laki-laki" },
      { name: "alamat", description: "Alamat.", example: "Jl. Mawar No. 7" },
      { name: "provinsi", description: "Provinsi.", example: "DKI Jakarta" },
      { name: "kota", description: "Kota/kabupaten.", example: "Jakarta Selatan" },
      { name: "agama", description: "Agama.", example: "Islam" },
      { name: "pekerjaan", description: "Pekerjaan.", example: "Pelajar/Mahasiswa" },
      { name: "foto", description: "URL pas foto (JPG/PNG). Opsional.", example: "" },
    ],
    handler: async ({ sp }) => {
      const nama = need(sp, "nama", 40).toUpperCase();
      const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
      const nik = opt(sp, "nik").replace(/\D/g, "").slice(0, 16) || rnd(16);
      const provinsi = opt(sp, "provinsi", "DKI Jakarta").slice(0, 30).toUpperCase();
      const kota = opt(sp, "kota", "Jakarta Selatan").slice(0, 30).toUpperCase();
      const foto = await optImage(sp, "foto");
      const rows: [string, string][] = [
        ["Nama", nama],
        ["Tempat/Tgl Lahir", opt(sp, "ttl", "Jakarta, 17-08-2001").slice(0, 34).toUpperCase()],
        ["Jenis Kelamin", opt(sp, "jk", "Laki-laki").slice(0, 12).toUpperCase()],
        ["Alamat", opt(sp, "alamat", "Jl. Mawar No. 7").slice(0, 36).toUpperCase()],
        ["Agama", opt(sp, "agama", "Islam").slice(0, 16).toUpperCase()],
        ["Status Perkawinan", "BELUM KAWIN"],
        ["Pekerjaan", opt(sp, "pekerjaan", "Pelajar/Mahasiswa").slice(0, 26).toUpperCase()],
        ["Kewarganegaraan", "WNI"],
        ["Berlaku Hingga", "SEUMUR HIDUP"],
      ];
      const mark: CSSProperties = { display: "flex", fontSize: 104, fontWeight: 800, letterSpacing: 8, color: "rgba(220,20,30,0.3)", whiteSpace: "nowrap" };
      return render(
        <div style={{ ...fill, position: "relative", flexDirection: "column", fontFamily: "Inter", color: "#10202e", background: "linear-gradient(135deg, #bfe0f5 0%, #8fc4e8 45%, #c9e6f7 100%)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 22 }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>PROVINSI {provinsi}</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>{kota}</div>
          </div>
          <div style={{ display: "flex", flex: 1, padding: "14px 36px 0", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ display: "flex", width: 110, fontSize: 30, fontWeight: 700 }}>NIK</div>
                <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>:</div>
                <div style={{ display: "flex", marginLeft: 14, fontFamily: "Mono", fontSize: 36, fontWeight: 700, letterSpacing: 1 }}>{nik}</div>
              </div>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: "flex", fontSize: 21, lineHeight: 1.58 }}>
                  <div style={{ display: "flex", width: 218 }}>{k}</div>
                  <div style={{ display: "flex", width: 16 }}>:</div>
                  <div style={{ display: "flex", flex: 1, fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 236 }}>
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img src={foto} width={220} height={282} style={{ objectFit: "cover", border: "2px solid #35576f" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", width: 220, height: 282, background: "#d9534f", border: "2px solid #35576f", overflow: "hidden" }}>
                  <svg width="200" height="230" viewBox="0 0 200 230">
                    <circle cx="100" cy="80" r="52" fill="#f3d9c4" />
                    <path d="M10 230c0-58 40-88 90-88s90 30 90 88z" fill="#22303c" />
                  </svg>
                </div>
              )}
              <div style={{ display: "flex", marginTop: 8, fontSize: 17 }}>{kota}</div>
              <div style={{ display: "flex", marginTop: 6, fontSize: 24, fontWeight: 600, color: "#1c3550" }}>{nama.split(" ")[0].toLowerCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 46, background: "#b3121c", color: "#fff", fontSize: 21, fontWeight: 700, letterSpacing: 2 }}>
            KARTU PARODI • SPESIMEN • BUKAN DOKUMEN RESMI
          </div>
          {/* tanda air */}
          <div style={{ position: "absolute", left: -200, top: -60, width: 1400, height: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, transform: "rotate(-20deg)" }}>
            <div style={mark}>SPESIMEN SPESIMEN</div>
            <div style={mark}>SPESIMEN SPESIMEN</div>
            <div style={mark}>SPESIMEN SPESIMEN</div>
          </div>
        </div>,
        1000,
        630,
      );
    },
  },
  {
    category: "canvas", slug: "quote", kind: "image",
    title: "Quote Chat (QC)",
    description: "Gelembung chat dengan foto profil dan nama, latar transparan 512×512. Cocok dijadikan stiker.",
    params: [
      { name: "text", required: true, description: "Isi pesan (maks 300 karakter).", example: "Hidup itu seperti kode, kadang error tanpa alasan." },
      { name: "name", description: "Nama pengirim.", example: "Yanxz" },
      { name: "avatar", description: "URL foto profil (JPG/PNG). Opsional.", example: "" },
      { name: "color", description: "Warna nama (hex). Default otomatis.", example: "" },
    ],
    handler: async ({ sp }) => {
      const text = cleanText(need(sp, "text", 300)).trim();
      const name = opt(sp, "name", "Anonim").slice(0, 28);
      const avatar = await optImage(sp, "avatar");
      const color = normalizeHex(opt(sp, "color"), "") || `hsl(${hashNum(name) % 360}, 85%, 68%)`;
      const size = fitFont(text, 330, 300, 0.56, 1.3, 46, 18);
      return render(
        <div style={{ ...fill, alignItems: "center", justifyContent: "center", fontFamily: "Inter", padding: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, maxWidth: 484 }}>
            <Avatar src={avatar} name={name} size={76} />
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 390, padding: "16px 24px 20px", borderRadius: 30, borderBottomLeftRadius: 8, background: "#1f2c34", color: "#fff" }}>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 700, color }}>{name}</div>
              <div style={{ display: "flex", marginTop: 6, fontSize: size, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>{text}</div>
            </div>
          </div>
        </div>,
        512,
        512,
      );
    },
  },
  {
    category: "canvas", slug: "welcome", kind: "image",
    title: "Welcome Card",
    description: "Kartu sambutan member baru untuk grup WhatsApp/Discord, lengkap dengan foto profil dan nama grup.",
    params: greetingParams("welcome"),
    handler: ({ sp }) => greetingCard(sp, "welcome"),
  },
  {
    category: "canvas", slug: "goodbye", kind: "image",
    title: "Goodbye Card",
    description: "Kartu perpisahan untuk member yang keluar grup.",
    params: greetingParams("goodbye"),
    handler: ({ sp }) => greetingCard(sp, "goodbye"),
  },
  {
    category: "canvas", slug: "rank", kind: "image",
    title: "Rank Card",
    description: "Kartu level/XP untuk sistem leveling bot: foto profil, level, peringkat, dan progres XP.",
    params: [
      { name: "name", required: true, description: "Nama pengguna.", example: "Yanxz" },
      { name: "level", description: "Level saat ini.", example: "12" },
      { name: "rank", description: "Peringkat.", example: "3" },
      { name: "xp", description: "XP saat ini.", example: "740" },
      { name: "maxxp", description: "XP untuk naik level.", example: "1000" },
      { name: "avatar", description: "URL foto profil (JPG/PNG). Opsional.", example: "" },
      { name: "color", description: "Warna aksen hex.", example: "ff7a45" },
    ],
    handler: async ({ sp }) => {
      const name = need(sp, "name", 32);
      const level = Math.round(num(sp, "level", 1, 0, 99999));
      const rank = Math.round(num(sp, "rank", 1, 1, 9999999));
      const maxxp = Math.max(1, Math.round(num(sp, "maxxp", 1000, 1, 1e9)));
      const xp = Math.min(maxxp, Math.round(num(sp, "xp", 0, 0, 1e9)));
      const avatar = await optImage(sp, "avatar");
      const accent = normalizeHex(opt(sp, "color"), "#ff7a45");
      const pct = Math.max(2, Math.round((xp / maxxp) * 100));
      const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : String(n));
      return render(
        <div style={{ ...fill, padding: 22, background: "#0f0d0b", fontFamily: "Inter", color: "#fff" }}>
          <div style={{ ...fill, alignItems: "center", gap: 36, padding: "0 40px", borderRadius: 26, background: `linear-gradient(120deg, #1d1814 0%, #241c17 60%, ${accent}40 140%)`, border: "1px solid rgba(255,255,255,0.1)" }}>
            <Avatar src={avatar} name={name} size={180} ring={accent} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ display: "flex", fontSize: name.length > 16 ? 38 : 50, fontWeight: 800, letterSpacing: -1 }}>{name}</div>
                <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div style={{ display: "flex", fontSize: 22, color: "#b5aa9e" }}>RANK</div>
                    <div style={{ display: "flex", fontSize: 46, fontWeight: 800 }}>#{rank}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div style={{ display: "flex", fontSize: 22, color: accent }}>LEVEL</div>
                    <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: accent }}>{level}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 26, height: 34, borderRadius: 17, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ display: "flex", width: `${pct}%`, height: "100%", borderRadius: 17, background: `linear-gradient(90deg, ${accent}, #ffd08a)` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 24, color: "#cfc5ba" }}>
                <div style={{ display: "flex" }}>{Math.round((xp / maxxp) * 100)}% menuju level {level + 1}</div>
                <div style={{ display: "flex", fontWeight: 700 }}>
                  {short(xp)} / {short(maxxp)} XP
                </div>
              </div>
            </div>
          </div>
        </div>,
        934,
        300,
      );
    },
  },
  {
    category: "canvas", slug: "ship", kind: "image",
    title: "Ship / Love Meter",
    description: "Kartu kecocokan dua nama dengan persentase cinta. Nama yang sama selalu menghasilkan angka yang sama.",
    params: [
      { name: "name1", required: true, description: "Nama pertama.", example: "Budi" },
      { name: "name2", required: true, description: "Nama kedua.", example: "Ani" },
      { name: "avatar1", description: "URL foto pertama (opsional).", example: "" },
      { name: "avatar2", description: "URL foto kedua (opsional).", example: "" },
      { name: "persen", description: "Paksa persentase 0–100 (opsional).", example: "" },
    ],
    handler: async ({ sp }) => {
      const a = need(sp, "name1", 24);
      const b = need(sp, "name2", 24);
      const [av1, av2] = await Promise.all([optImage(sp, "avatar1"), optImage(sp, "avatar2")]);
      const forced = opt(sp, "persen");
      const pct = forced && Number.isFinite(Number(forced)) ? Math.min(100, Math.max(0, Math.round(Number(forced)))) : hashNum([a.toLowerCase(), b.toLowerCase()].sort().join("♥")) % 101;
      const label = pct >= 85 ? "Jodoh banget!" : pct >= 65 ? "Cocok nih" : pct >= 40 ? "Lumayan, usaha lagi" : pct >= 20 ? "Temenan aja ya" : "Mending cari yang lain";
      return render(
        <div style={{ ...fill, flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter", color: "#fff", background: "linear-gradient(135deg, #3a0d24 0%, #7a1638 50%, #c2274f 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 230 }}>
              <Avatar src={av1} name={a} size={170} ring="#ffd1dc" />
              <div style={{ display: "flex", marginTop: 14, fontSize: 30, fontWeight: 700 }}>{a}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 190, height: 190, position: "relative" }}>
              <svg width="190" height="190" viewBox="0 0 24 24" style={{ position: "absolute", top: 0, left: 0 }}>
                <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4.5 6.5 4.5c2 0 3.6 1 5.5 3 1.9-2 3.5-3 5.5-3 3.5 0 5.6 3.5 4.1 7.1C19.5 16.4 12 21 12 21z" fill="#ff4d6d" />
              </svg>
              <div style={{ display: "flex", fontSize: 52, fontWeight: 800, marginTop: -12 }}>{pct}%</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 230 }}>
              <Avatar src={av2} name={b} size={170} ring="#ffd1dc" />
              <div style={{ display: "flex", marginTop: 14, fontSize: 30, fontWeight: 700 }}>{b}</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 26, padding: "10px 28px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 26, fontWeight: 600 }}>{label}</div>
        </div>,
        900,
        400,
      );
    },
  },
  {
    category: "canvas", slug: "meme", kind: "image",
    title: "Meme Generator",
    description: "Tempel teks atas dan bawah bergaya meme klasik di atas gambar apa pun. Hasil PNG 600×600.",
    params: [
      { name: "image", required: true, description: "URL gambar (JPG/PNG).", example: "https://picsum.photos/600" },
      { name: "top", description: "Teks atas.", example: "ketika deploy hari jumat" },
      { name: "bottom", description: "Teks bawah.", example: "dan langsung error" },
    ],
    handler: async ({ sp }) => {
      const img = await loadImage(need(sp, "image", 1000));
      const top = opt(sp, "top").slice(0, 90).toUpperCase();
      const bottom = opt(sp, "bottom").slice(0, 90).toUpperCase();
      if (!top && !bottom) throw new HttpError(400, "Isi minimal salah satu parameter 'top' atau 'bottom'.");
      const style = (t: string): CSSProperties => ({
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 18px",
        fontSize: fitFont(t, 560, 150, 0.66, 1.08, 64, 26),
        fontWeight: 800,
        lineHeight: 1.08,
        color: "#fff",
        WebkitTextStroke: "3px #000",
        textShadow: "3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000",
      });
      return render(
        <div style={{ ...fill, position: "relative", fontFamily: "Inter", background: "#000" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={img} width={600} height={600} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
          <div style={{ ...fill, position: "relative", flexDirection: "column", justifyContent: "space-between", padding: "18px 0 22px" }}>
            <div style={style(top || " ")}>{top}</div>
            <div style={style(bottom || " ")}>{bottom}</div>
          </div>
        </div>,
        600,
        600,
      );
    },
  },
  {
    category: "canvas", slug: "carbon", kind: "image",
    title: "Code Snippet (Carbon)",
    description: "Ubah potongan kode menjadi gambar rapi bergaya jendela editor gelap dengan nomor baris.",
    params: [
      { name: "code", required: true, description: "Kode (maks 3000 karakter, 60 baris).", example: "const res = await fetch('/api/random/quote');\nconsole.log(await res.json());" },
      { name: "title", description: "Nama file di judul jendela.", example: "index.js" },
    ],
    handler: async ({ sp }) => {
      const raw = sp.get("code");
      if (!raw || !raw.trim()) throw new HttpError(400, "Parameter 'code' wajib diisi.");
      if (raw.length > 3000) throw new HttpError(400, "Parameter 'code' terlalu panjang (maks 3000 karakter).");
      const lines = cleanText(raw.replace(/\\n/g, "\n")).replace(/\t/g, "  ").split("\n").slice(0, 60);
      const title = opt(sp, "title", "snippet").slice(0, 40);
      const longest = Math.max(...lines.map((l) => l.length), 20);
      const fontSize = 22;
      const W = Math.min(1600, Math.max(640, Math.round(longest * fontSize * 0.6) + 200));
      const H = lines.length * 34 + 170;
      return render(
        <div style={{ ...fill, padding: 36, background: "linear-gradient(135deg, #ff7a45, #b83d7a 60%, #4a3aa8)", fontFamily: "Mono" }}>
          <div style={{ ...fill, flexDirection: "column", borderRadius: 16, background: "#14161c", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", height: 52, padding: "0 20px", gap: 10, background: "#1c1f27" }}>
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                <div key={c} style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: c }} />
              ))}
              <div style={{ display: "flex", flex: 1, justifyContent: "center", marginRight: 62, fontSize: 17, color: "#8b93a6" }}>{title}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "18px 0" }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "flex", height: 34, alignItems: "center", fontSize }}>
                  <div style={{ display: "flex", width: 62, justifyContent: "flex-end", paddingRight: 20, color: "#4b5263" }}>{i + 1}</div>
                  <div style={{ display: "flex", whiteSpace: "pre", color: /^\s*(\/\/|#|--)/.test(l) ? "#6b7386" : "#e6e9f0" }}>{l || " "}</div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        W,
        H,
      );
    },
  },
];
