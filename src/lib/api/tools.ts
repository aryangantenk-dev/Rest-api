import crypto from "node:crypto";
import QRCode from "qrcode";
import { getStore } from "@/db/store";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { SITE_URL } from "@/lib/site";
import { binaryResponse, fetchJson, fetchRaw, need, normalizeHex, num, opt, parseHttpUrl } from "./helpers";

/* ---------- kalkulator aman (tanpa eval) ---------- */
function evaluate(expr: string): number {
  const src = expr.toLowerCase().replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".");
  let i = 0;
  const funcs: Record<string, (n: number) => number> = {
    sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  };
  const consts: Record<string, number> = { pi: Math.PI, e: Math.E };

  function parseExpr(): number {
    let v = parseTerm();
    while (src[i] === "+" || src[i] === "-") {
      const op = src[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parsePow();
    while (src[i] === "*" || src[i] === "/" || src[i] === "%") {
      const op = src[i++];
      const r = parsePow();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parsePow(): number {
    const base = parseUnary();
    if (src[i] === "^") {
      i++;
      return Math.pow(base, parsePow());
    }
    return base;
  }
  function parseUnary(): number {
    if (src[i] === "-") { i++; return -parseUnary(); }
    if (src[i] === "+") { i++; return parseUnary(); }
    return parseAtom();
  }
  function parseAtom(): number {
    if (src[i] === "(") {
      i++;
      const v = parseExpr();
      if (src[i] !== ")") throw new HttpError(400, "Tanda kurung tidak seimbang.");
      i++;
      return v;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const word = /^[a-z]+/.exec(src.slice(i));
    if (word) {
      i += word[0].length;
      if (word[0] in consts) return consts[word[0]];
      if (word[0] in funcs && src[i] === "(") {
        i++;
        const v = parseExpr();
        if (src[i] !== ")") throw new HttpError(400, "Tanda kurung tidak seimbang.");
        i++;
        return funcs[word[0]](v);
      }
    }
    throw new HttpError(400, "Ekspresi tidak valid.");
  }
  const result = parseExpr();
  if (i < src.length) throw new HttpError(400, "Ekspresi tidak valid.");
  return result;
}

/* ---------- konversi satuan ---------- */
const units: Record<string, Record<string, number>> = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  weight: { mg: 0.000001, g: 0.001, kg: 1, ton: 1000, oz: 0.0283495, lb: 0.453592 },
  data: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, w: 604800 },
};

function convertUnit(value: number, from: string, to: string) {
  from = from.toLowerCase();
  to = to.toLowerCase();
  if (["c", "f", "k"].includes(from) && ["c", "f", "k"].includes(to)) {
    const c = from === "c" ? value : from === "f" ? ((value - 32) * 5) / 9 : value - 273.15;
    const out = to === "c" ? c : to === "f" ? (c * 9) / 5 + 32 : c + 273.15;
    return { type: "temperature", result: out };
  }
  for (const [type, table] of Object.entries(units)) {
    if (from in table && to in table) return { type, result: (value * table[from]) / table[to] };
  }
  throw new HttpError(400, "Satuan tidak dikenali atau tidak sebanding. Contoh: km→mi, kg→lb, c→f, mb→gb, h→min.");
}

/* ---------- warna ---------- */
function hexToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/* ---------- user agent ---------- */
function parseUA(ua: string) {
  const browser =
    /Edg\/([\d.]+)/.exec(ua)?.[0].replace("Edg/", "Edge ") ??
    /OPR\/([\d.]+)/.exec(ua)?.[0].replace("OPR/", "Opera ") ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0].replace("/", " ") ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0].replace("/", " ") ??
    (/Version\/([\d.]+).*Safari/.exec(ua) ? `Safari ${/Version\/([\d.]+)/.exec(ua)?.[1]}` : null) ??
    "Tidak diketahui";
  const os = /Windows NT ([\d.]+)/.test(ua) ? "Windows"
    : /Android ([\d.]+)/.exec(ua)?.[0] ?? (/iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Tidak diketahui");
  const device = /Mobi|Android|iPhone/.test(ua) ? "mobile" : /iPad|Tablet/.test(ua) ? "tablet" : "desktop";
  const isBot = /bot|crawl|spider|curl|wget|python|axios|node-fetch/i.test(ua);
  return { browser, os, device, isBot };
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
}

const BASE62 = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function shortCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => BASE62[b % BASE62.length]).join("");
}

/** Ukuran viewport [lebar, tinggi] untuk tiap perangkat screenshot. */
const SHOT_DEVICES: Record<string, [number, number]> = {
  desktop: [1920, 1080],
  laptop: [1366, 768],
  tablet: [820, 1180],
  mobile: [390, 844],
};
const SHOT_ALIAS: Record<string, string> = {
  pc: "desktop", komputer: "desktop", hp: "mobile", ponsel: "mobile", phone: "mobile", android: "mobile", iphone: "mobile", ipad: "tablet", tab: "tablet",
};

export const toolsEndpoints: Endpoint[] = [
  {
    category: "tools", slug: "qrcode", kind: "image",
    title: "QR Code Generator",
    description: "Ubah teks atau tautan apa pun menjadi gambar QR Code PNG dengan warna dan ukuran yang bisa diatur.",
    params: [
      { name: "text", required: true, description: "Teks atau URL yang akan dijadikan QR.", example: SITE_URL },
      { name: "size", description: "Lebar gambar dalam piksel (128–1024).", example: "512" },
      { name: "dark", description: "Warna modul QR (hex tanpa #).", example: "111111" },
      { name: "light", description: "Warna latar (hex tanpa #).", example: "ffffff" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 1500);
      const buf = await QRCode.toBuffer(text, {
        width: num(sp, "size", 512, 128, 1024),
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: normalizeHex(opt(sp, "dark"), "#111111"), light: normalizeHex(opt(sp, "light"), "#ffffff") },
      });
      return binaryResponse(buf, "image/png");
    },
  },
  {
    category: "tools", slug: "screenshot", kind: "image",
    title: "Screenshot Website",
    description: "Ambil tangkapan layar halaman web seperti tampil di perangkat pilihan: desktop, laptop, tablet, atau mobile (HP). Hasilnya langsung berupa gambar.",
    params: [
      { name: "url", required: true, description: "Alamat website.", example: "https://nextjs.org" },
      {
        name: "device",
        description: "Perangkat: desktop (1920x1080), laptop (1366x768), tablet (820x1180), atau mobile (390x844). Default desktop.",
        example: "desktop",
        options: Object.keys(SHOT_DEVICES),
      },
    ],
    handler: async ({ sp }) => {
      const u = parseHttpUrl(need(sp, "url", 500));
      const raw = opt(sp, "device").toLowerCase().replace(/[^a-z]/g, "");
      let vw: number;
      let vh: number;
      if (!raw && opt(sp, "width")) {
        // Parameter lama: tetap dilayani supaya pemanggil lama tidak rusak.
        vw = Math.round(num(sp, "width", 1280, 320, 1920));
        vh = Math.round(vw * 0.5625);
      } else {
        const name = SHOT_ALIAS[raw] ?? (raw || "desktop");
        const dev = SHOT_DEVICES[name];
        if (!dev) throw new HttpError(400, `Parameter 'device' tidak dikenal. Pilihan: ${Object.keys(SHOT_DEVICES).join(", ")}.`);
        [vw, vh] = dev;
      }
      const res = await fetchRaw(`https://image.thum.io/get/viewportWidth/${vw}/width/${vw}/crop/${vh}/noanimate/${u.toString()}`, undefined, 30000);
      const buf = await res.arrayBuffer();
      return binaryResponse(buf, res.headers.get("content-type") ?? "image/png", "public, max-age=600");
    },
  },
  {
    category: "tools", slug: "shorturl", kind: "json",
    title: "Pemendek URL (yanz.api)",
    description: "Pemendek URL bawaan yanz.api. Hasilnya tautan pendek di domain ini yang langsung bisa dipakai dan dihitung kliknya. URL yang sama selalu mendapat kode yang sama.",
    params: [{ name: "url", required: true, description: "URL panjang yang akan dipendekkan.", example: "https://nextjs.org/docs/app/getting-started" }],
    handler: async ({ sp, origin }) => {
      const u = parseHttpUrl(need(sp, "url", 2000)).toString();
      const store = getStore();
      if (!store) throw new HttpError(503, "Pemendek URL belum aktif: database belum dikonfigurasi di server ini. Gunakan /api/tools/tinyurl sebagai alternatif.");
      let link: { code: string; hits: number } | null = null;
      try {
        // Kode acak bisa bertabrakan dengan milik URL lain; coba beberapa kali.
        for (let n = 0; n < 5 && !link; n++) link = await store.shorten(u, shortCode());
      } catch {
        throw new HttpError(503, "Database pemendek URL sedang tidak dapat dihubungi. Coba lagi nanti.");
      }
      if (!link) throw new HttpError(500, "Gagal membuat tautan pendek.");
      return { original: u, short: `${origin}/s/${link.code}`, code: link.code, hits: link.hits, provider: "yanz.api" };
    },
  },
  {
    category: "tools", slug: "tinyurl", kind: "json",
    title: "Pemendek URL (TinyURL)",
    description: "Pendekkan URL lewat layanan TinyURL (tinyurl.com). Bisa memakai alias kustom agar tautannya mudah diingat.",
    params: [
      { name: "url", required: true, description: "URL panjang yang akan dipendekkan.", example: "https://nextjs.org/docs/app/getting-started" },
      { name: "alias", description: "Alias kustom (5–30 karakter: huruf, angka, - atau _). Kosongkan untuk kode acak." },
    ],
    handler: async ({ sp }) => {
      const u = parseHttpUrl(need(sp, "url", 2000)).toString();
      const alias = opt(sp, "alias");
      if (alias && !/^[A-Za-z0-9_-]{5,30}$/.test(alias)) throw new HttpError(400, "Parameter 'alias' harus 5–30 karakter dan hanya berisi huruf, angka, '-' atau '_'.");
      let short: string;
      try {
        const res = await fetchRaw(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(u)}${alias ? `&alias=${encodeURIComponent(alias)}` : ""}`);
        short = (await res.text()).trim();
      } catch (e) {
        // TinyURL membalas 4xx bila alias sudah dipakai.
        if (alias && e instanceof HttpError && e.status === 502) throw new HttpError(409, `Alias '${alias}' ditolak TinyURL (kemungkinan sudah dipakai). Coba alias lain.`);
        throw e;
      }
      if (!/^https?:\/\/tinyurl\.com\/\S+$/i.test(short)) throw new HttpError(502, "TinyURL mengirim respons yang tidak valid.");
      return { original: u, short, code: short.split("/").pop(), provider: "tinyurl" };
    },
  },
  {
    category: "tools", slug: "translate", kind: "json",
    title: "Penerjemah",
    description: "Terjemahkan teks ke bahasa lain. Bahasa sumber dideteksi otomatis bila tidak diisi.",
    params: [
      { name: "text", required: true, description: "Teks yang diterjemahkan (maks 500 karakter).", example: "Selamat pagi, apa kabar?" },
      { name: "to", description: "Kode bahasa tujuan (en, id, ja, ar, ...). Default: en.", example: "en" },
      { name: "from", description: "Kode bahasa sumber. Default: deteksi otomatis.", example: "id" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 500);
      const to = opt(sp, "to", "en");
      const from = opt(sp, "from", "Autodetect");
      const data = await fetchJson<{ responseData?: { translatedText?: string }; responseStatus?: number | string; responseDetails?: string }>(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${to}`)}`,
      );
      if (!data.responseData?.translatedText || String(data.responseStatus) !== "200") {
        throw new HttpError(400, data.responseDetails || "Gagal menerjemahkan teks.");
      }
      return { text, from, to, translated: data.responseData.translatedText };
    },
  },
  {
    category: "tools", slug: "calc", kind: "json",
    title: "Kalkulator",
    description: "Hitung ekspresi matematika dengan aman. Mendukung + − × ÷ % ^, tanda kurung, sqrt, sin, cos, log, pi, dan lainnya.",
    params: [{ name: "expr", required: true, description: "Ekspresi matematika.", example: "(12+8)*3^2/sqrt(16)" }],
    handler: async ({ sp }) => {
      const expr = need(sp, "expr", 200);
      const result = evaluate(expr);
      if (!Number.isFinite(result)) throw new HttpError(400, "Hasil tidak terdefinisi.");
      return { expression: expr, result: Math.round(result * 1e10) / 1e10 };
    },
  },
  {
    category: "tools", slug: "convert", kind: "json",
    title: "Konversi Satuan",
    description: "Konversi panjang, berat, suhu, ukuran data, dan waktu dalam satu endpoint.",
    params: [
      { name: "value", required: true, description: "Nilai yang dikonversi.", example: "42" },
      { name: "from", required: true, description: "Satuan asal (km, kg, c, mb, h, ...).", example: "km" },
      { name: "to", required: true, description: "Satuan tujuan.", example: "mi" },
    ],
    handler: async ({ sp }) => {
      const value = num(sp, "value", NaN, -1e15, 1e15);
      if (Number.isNaN(value)) throw new HttpError(400, "Parameter 'value' wajib diisi.");
      const from = need(sp, "from", 10);
      const to = need(sp, "to", 10);
      const r = convertUnit(value, from, to);
      return { type: r.type, value, from, to, result: Math.round(r.result * 1e8) / 1e8 };
    },
  },
  {
    category: "tools", slug: "base64", kind: "json",
    title: "Base64",
    description: "Encode atau decode teks Base64 dengan dukungan UTF-8 penuh.",
    params: [
      { name: "text", required: true, description: "Teks input.", example: "Halo yanz.api" },
      { name: "mode", description: "encode atau decode. Default: encode.", example: "encode" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text");
      const mode = opt(sp, "mode", "encode").toLowerCase();
      if (mode === "decode") {
        if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(text)) throw new HttpError(400, "Input bukan Base64 yang valid.");
        return { mode, input: text, output: Buffer.from(text, "base64").toString("utf8") };
      }
      if (mode !== "encode") throw new HttpError(400, "mode harus 'encode' atau 'decode'.");
      return { mode, input: text, output: Buffer.from(text, "utf8").toString("base64") };
    },
  },
  {
    category: "tools", slug: "hash", kind: "json",
    title: "Hash Generator",
    description: "Hitung hash MD5, SHA-1, SHA-256, dan SHA-512 dari sebuah teks sekaligus.",
    params: [{ name: "text", required: true, description: "Teks yang di-hash.", example: "yanz" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text");
      const h = (a: string) => crypto.createHash(a).update(text).digest("hex");
      return { text, md5: h("md5"), sha1: h("sha1"), sha256: h("sha256"), sha512: h("sha512") };
    },
  },
  {
    category: "tools", slug: "password", kind: "json",
    title: "Password Generator",
    description: "Buat kata sandi acak yang kuat menggunakan generator kriptografis.",
    params: [
      { name: "length", description: "Panjang password (6–128). Default 16.", example: "20" },
      { name: "symbols", description: "Sertakan simbol: true / false. Default true.", example: "true" },
      { name: "count", description: "Jumlah password (1–20).", example: "3" },
    ],
    handler: async ({ sp }) => {
      const length = Math.round(num(sp, "length", 16, 6, 128));
      const count = Math.round(num(sp, "count", 1, 1, 20));
      const symbols = opt(sp, "symbols", "true") !== "false";
      const pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" + (symbols ? "!@#$%^&*()-_=+[]{}" : "");
      const gen = () => Array.from({ length }, () => pool[crypto.randomInt(pool.length)]).join("");
      const list = Array.from({ length: count }, gen);
      return { length, symbols, passwords: list };
    },
  },
  {
    category: "tools", slug: "uuid", kind: "json",
    title: "UUID v4",
    description: "Hasilkan satu atau banyak UUID versi 4.",
    params: [{ name: "count", description: "Jumlah UUID (1–50).", example: "5" }],
    handler: async ({ sp }) => {
      const count = Math.round(num(sp, "count", 1, 1, 50));
      return { count, uuids: Array.from({ length: count }, () => crypto.randomUUID()) };
    },
  },
  {
    category: "tools", slug: "color", kind: "json",
    title: "Konverter Warna",
    description: "Ubah kode HEX menjadi RGB dan HSL, lengkap dengan perkiraan kecerahan warna.",
    params: [{ name: "hex", required: true, description: "Kode warna hex (3 atau 6 digit).", example: "ff6b3d" }],
    handler: async ({ sp }) => {
      const hex = normalizeHex(need(sp, "hex", 8), "");
      if (!hex) throw new HttpError(400, "Kode hex tidak valid.");
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      const hsl = hexToHsl(r, g, b);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return {
        hex, rgb: { r, g, b }, rgbString: `rgb(${r}, ${g}, ${b})`, hsl, hslString: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
        isLight: luminance > 0.55, suggestedTextColor: luminance > 0.55 ? "#000000" : "#ffffff",
      };
    },
  },
  {
    category: "tools", slug: "json", kind: "json",
    title: "JSON Formatter",
    description: "Validasi JSON lalu rapikan (pretty) atau kecilkan (minify) ukurannya.",
    params: [
      { name: "json", required: true, description: "String JSON.", example: '{"nama":"yanz","fitur":[1,2,3]}' },
      { name: "indent", description: "Jumlah spasi indentasi (0–8). Default 2.", example: "2" },
    ],
    handler: async ({ sp }) => {
      const raw = need(sp, "json", 20000);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch (e) {
        throw new HttpError(400, `JSON tidak valid: ${e instanceof Error ? e.message : "kesalahan sintaks"}`);
      }
      const indent = Math.round(num(sp, "indent", 2, 0, 8));
      return { valid: true, formatted: JSON.stringify(parsed, null, indent), minified: JSON.stringify(parsed), bytes: { original: raw.length, minified: JSON.stringify(parsed).length } };
    },
  },
  {
    category: "tools", slug: "bmi", kind: "json",
    title: "Kalkulator BMI",
    description: "Hitung indeks massa tubuh beserta kategori dan rentang berat badan ideal.",
    params: [
      { name: "weight", required: true, description: "Berat badan (kg).", example: "65" },
      { name: "height", required: true, description: "Tinggi badan (cm).", example: "170" },
    ],
    handler: async ({ sp }) => {
      const w = num(sp, "weight", NaN, 1, 500), h = num(sp, "height", NaN, 30, 280);
      if (Number.isNaN(w) || Number.isNaN(h)) throw new HttpError(400, "Parameter 'weight' dan 'height' wajib diisi.");
      const m = h / 100;
      const bmi = w / (m * m);
      const category = bmi < 18.5 ? "Kurus" : bmi < 25 ? "Normal" : bmi < 30 ? "Gemuk" : "Obesitas";
      return { weight: w, height: h, bmi: Math.round(bmi * 10) / 10, category, idealWeight: { min: Math.round(18.5 * m * m * 10) / 10, max: Math.round(24.9 * m * m * 10) / 10 } };
    },
  },
  {
    category: "tools", slug: "age", kind: "json",
    title: "Kalkulator Usia",
    description: "Hitung usia tepat dalam tahun, bulan, hari, serta hitung mundur ke ulang tahun berikutnya.",
    params: [{ name: "birthdate", required: true, description: "Tanggal lahir format YYYY-MM-DD.", example: "2000-08-17" }],
    handler: async ({ sp }) => {
      const raw = need(sp, "birthdate", 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(400, "Format tanggal harus YYYY-MM-DD.");
      const b = new Date(`${raw}T00:00:00Z`);
      const now = new Date();
      if (Number.isNaN(b.getTime()) || b > now) throw new HttpError(400, "Tanggal lahir tidak valid.");
      let years = now.getUTCFullYear() - b.getUTCFullYear();
      let months = now.getUTCMonth() - b.getUTCMonth();
      let days = now.getUTCDate() - b.getUTCDate();
      if (days < 0) { months--; days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate(); }
      if (months < 0) { years--; months += 12; }
      let next = new Date(Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
      if (next <= now) next = new Date(Date.UTC(now.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
      return {
        birthdate: raw, age: { years, months, days },
        totalDays: Math.floor((now.getTime() - b.getTime()) / 86400000),
        nextBirthday: { date: next.toISOString().slice(0, 10), daysLeft: Math.ceil((next.getTime() - now.getTime()) / 86400000) },
        weekdayBorn: new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(b),
      };
    },
  },
  {
    category: "tools", slug: "ip", kind: "json",
    title: "Info IP Address",
    description: "Lihat lokasi, ISP, dan zona waktu sebuah IP. Kosongkan parameter untuk memeriksa IP milikmu.",
    params: [{ name: "ip", description: "Alamat IPv4/IPv6. Opsional.", example: "8.8.8.8" }],
    handler: async ({ sp, req }) => {
      const ip = opt(sp, "ip", clientIp(req));
      if (ip && !/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new HttpError(400, "Alamat IP tidak valid.");
      const d = await fetchJson<Record<string, unknown> & { success?: boolean; message?: string; connection?: unknown; timezone?: unknown }>(`https://ipwho.is/${ip}`);
      if (d.success === false) throw new HttpError(400, String(d.message ?? "IP tidak ditemukan."));
      return {
        ip: d.ip, type: d.type, continent: d.continent, country: d.country, countryCode: d.country_code, region: d.region, city: d.city,
        latitude: d.latitude, longitude: d.longitude, connection: d.connection, timezone: d.timezone,
      };
    },
  },
  {
    category: "tools", slug: "dns", kind: "json",
    title: "DNS Lookup",
    description: "Cek record DNS (A, AAAA, MX, TXT, NS, CNAME) dari domain mana pun.",
    params: [
      { name: "domain", required: true, description: "Nama domain.", example: "github.com" },
      { name: "type", description: "Jenis record. Default A.", example: "A" },
    ],
    handler: async ({ sp }) => {
      const domain = need(sp, "domain", 253).replace(/^https?:\/\//, "").split("/")[0];
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new HttpError(400, "Nama domain tidak valid.");
      const type = opt(sp, "type", "A").toUpperCase();
      if (!["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"].includes(type)) throw new HttpError(400, "Jenis record tidak didukung.");
      const d = await fetchJson<{ Status: number; Answer?: { name: string; type: number; TTL: number; data: string }[] }>(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
      );
      return { domain, type, found: !!d.Answer?.length, records: (d.Answer ?? []).map((a) => ({ name: a.name, ttl: a.TTL, value: a.data })) };
    },
  },
  {
    category: "tools", slug: "useragent", kind: "json",
    title: "User Agent Parser",
    description: "Uraikan string User-Agent menjadi browser, sistem operasi, dan jenis perangkat.",
    params: [{ name: "ua", description: "String User-Agent. Kosongkan untuk memakai milikmu.", example: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1" }],
    handler: async ({ sp, req }) => {
      const ua = opt(sp, "ua", req.headers.get("user-agent") ?? "");
      if (!ua) throw new HttpError(400, "User-Agent tidak tersedia.");
      return { ua, ...parseUA(ua) };
    },
  },
];
