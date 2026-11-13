import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { need, num, opt, parseHttpUrl } from "./helpers";

/*
  Endpoint yang diteruskan ke Xavrels MultiTools (xavrels-multitools.vercel.app).
  Situs itu meminta token sesi lebih dulu (POST /api/session), lalu token dikirim
  di header X-Session-Token pada setiap permintaan tool. Token berlaku sekitar
  10 menit dan disimpan di memori instance ini.
*/

const BASE = "https://xavrels-multitools.vercel.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS = { origin: BASE, referer: `${BASE}/`, "user-agent": UA };

let session: { token: string; expiresAt: number } | null = null;

/** fetch dengan batas waktu. Timer dilepas setelah header diterima, supaya isi respons bisa dialirkan. */
async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new HttpError(504, "Server sumber terlalu lama merespons.");
    throw new HttpError(502, "Gagal menghubungi server sumber.");
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && session && session.expiresAt > now + 30_000) return session.token;
  const res = await timedFetch(
    `${BASE}/api/session`,
    { method: "POST", headers: { ...BROWSER_HEADERS, accept: "application/json", "content-type": "application/json" }, body: "{}" },
    15000,
  );
  const data = (await res.json().catch(() => null)) as { ok?: boolean; token?: string; expiresIn?: number } | null;
  if (!res.ok || !data?.ok || !data.token) throw new HttpError(502, "Server sumber menolak membuat sesi. Coba lagi nanti.");
  session = { token: data.token, expiresAt: now + (data.expiresIn || 600) * 1000 };
  return data.token;
}

/** Ubah respons gagal dari sumber menjadi HttpError yang membawa pesan aslinya. */
async function upstreamError(res: Response): Promise<HttpError> {
  const data = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const raw = data?.error ?? data?.message;
  const msg = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 300) : "";
  if (res.status === 429) return new HttpError(429, msg || "Server sumber sedang membatasi permintaan. Coba lagi beberapa saat lagi.");
  if ([400, 404, 413, 415, 422].includes(res.status)) return new HttpError(400, msg || "Permintaan ditolak server sumber. Periksa lagi parameternya.");
  return new HttpError(502, msg ? `Server sumber: ${msg}` : `Server sumber merespons dengan status ${res.status}.`);
}

/** Panggil satu tool. Bila token ditolak (401), ambil token baru lalu ulangi sekali. */
async function call(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  const send = async (token: string) =>
    timedFetch(
      `${BASE}${path}`,
      { method: "POST", headers: { ...BROWSER_HEADERS, "content-type": "application/json", "x-session-token": token }, body: JSON.stringify(body) },
      timeoutMs,
    );
  let res = await send(await getToken());
  if (res.status === 401) res = await send(await getToken(true));
  if (!res.ok) throw await upstreamError(res);
  return res;
}

/** Tool yang hasilnya berkas gambar/video: alirkan langsung ke pemanggil tanpa ditampung di memori. */
async function media(path: string, body: Record<string, unknown>, expect: "image" | "video", timeoutMs: number): Promise<Response> {
  const res = await call(path, body, timeoutMs);
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith(`${expect}/`)) {
    // Sumber kadang membalas 200 berisi JSON galat, bukan berkasnya.
    if (type === "application/json") throw await upstreamError(new Response(res.body, { status: 502 }));
    throw new HttpError(502, "Server sumber mengirim respons yang tidak valid.");
  }
  return new Response(res.body, { headers: { "content-type": type, "cache-control": "public, max-age=600" } });
}

function wibClock(): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", ".");
}

/** Efek gambar hanya menerima tautan gambar publik; sumber yang mengunduhnya. */
function imageUrl(sp: URLSearchParams): string {
  return parseHttpUrl(need(sp, "url", 2000)).toString();
}

export const xavrelsEndpoints: Endpoint[] = [
  {
    category: "canvas", slug: "bratvid", kind: "video",
    title: "Brat Video",
    description: "Versi video dari stiker brat: teks muncul kata demi kata. Hasilnya berkas MP4, biasanya butuh 10–30 detik.",
    params: [{ name: "text", required: true, description: "Teks (maks 250 karakter).", example: "aku capek jadi orang baik" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 250).replace(/\s+/g, " ");
      return media("/api/brat-vid", { text }, "video", 55000);
    },
  },
  {
    category: "canvas", slug: "iqc2", kind: "image",
    title: "iPhone Quoted Chat v2",
    description: "Tangkapan layar chat ala iPhone versi kedua, dirender oleh layanan luar. Untuk versi bawaan yang lebih banyak pengaturannya, pakai /api/canvas/iqc.",
    params: [
      { name: "text", required: true, description: "Isi pesan (maks 500 karakter).", example: "besok jadi kan? jangan php lagi ya" },
      { name: "jam", description: "Jam di status bar (HH.MM atau HH:MM). Default jam sekarang (WIB).", example: "21.07" },
      { name: "baterai", description: "Persentase baterai 1–100. Default 82.", example: "82" },
    ],
    handler: async ({ sp }) => {
      const teks = need(sp, "text", 500);
      const jamRaw = opt(sp, "jam");
      const jam = /^\d{1,2}[:.]\d{2}$/.test(jamRaw) ? jamRaw.replace(":", ".") : wibClock();
      const batre = Math.round(num(sp, "baterai", 82, 1, 100));
      return media("/api/iqc-generator", { teks, jam, batre }, "image", 30000);
    },
  },
  {
    category: "image", slug: "blur", kind: "image",
    title: "Blur Gambar",
    description: "Beri efek buram halus pada sebuah gambar. Kirim tautan langsung ke gambarnya; hasilnya berkas gambar.",
    params: [{ name: "url", required: true, description: "Tautan langsung ke gambar (JPG, PNG, atau WebP) yang bisa diakses publik.", example: "https://picsum.photos/600" }],
    handler: async ({ sp }) => media("/api/to-blur", { url: imageUrl(sp) }, "image", 45000),
  },
  {
    category: "image", slug: "boom", kind: "image",
    title: "Efek Ledakan",
    description: "Hapus latar gambar secara otomatis lalu pasang efek ledakan di belakang objeknya. Paling bagus untuk foto dengan satu objek yang jelas.",
    params: [{ name: "url", required: true, description: "Tautan langsung ke gambar (JPG, PNG, atau WebP) yang bisa diakses publik.", example: "https://picsum.photos/600" }],
    handler: async ({ sp }) => media("/api/to-boom", { url: imageUrl(sp) }, "image", 45000),
  },
  {
    category: "search", slug: "ampreset", kind: "json",
    title: "Pencari Preset Alight Motion",
    description: "Cari preset Alight Motion yang dipakai sebuah video. Kirim tautan video TikTok atau YouTube; hasilnya data pembuat video dan daftar tautan preset bila ditemukan.",
    params: [{ name: "url", required: true, description: "Tautan video TikTok atau YouTube, misalnya https://vt.tiktok.com/… atau https://youtu.be/…" }],
    handler: async ({ sp }) => {
      const u = parseHttpUrl(need(sp, "url", 2000));
      if (!/(^|\.)(tiktok\.com|youtube\.com|youtu\.be)$/i.test(u.hostname)) throw new HttpError(400, "Parameter 'url' harus berupa tautan video TikTok atau YouTube.");
      const res = await call("/api/fpreset", { url: u.toString() }, 30000);
      const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: unknown; result?: unknown } & Record<string, unknown>) | null;
      if (!data) throw new HttpError(502, "Server sumber mengirim respons yang tidak valid.");
      if (!data.ok) throw new HttpError(502, typeof data.error === "string" && data.error ? `Server sumber: ${data.error.slice(0, 300)}` : "Server sumber gagal mencari preset untuk video ini.");
      if (data.result && typeof data.result === "object") return data.result;
      const { ok: _ok, ...rest } = data;
      void _ok;
      return rest;
    },
  },
];
