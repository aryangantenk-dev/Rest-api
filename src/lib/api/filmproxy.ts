import { inflateSync } from "node:zlib";
import { HttpError } from "./types";

/**
 * Penerus permintaan ke situs film yang menolak IP server Vercel.
 * Ada dua perantara dengan antarmuka yang sama (GET /fetch?url=..., header x-proxy-key):
 *  - "film"  : VPS ber-IP Indonesia untuk LK21 (scripts/film-proxy/install.sh),
 *              env FILM_PROXY_URL + FILM_PROXY_KEY.
 *  - "sanka" : Supabase Edge Function untuk API Sankanime (supabase/functions/film-proxy),
 *              env SANKA_PROXY_URL + SANKA_PROXY_KEY.
 */
export type ProxyVia = "film" | "sanka";
export type ProxyOpts = { accept?: string; referer?: string; origin?: boolean; xhr?: boolean; timeoutMs?: number; via?: ProxyVia };
export type ProxyResult = { status: number; finalUrl: string; type: string; text: string };

const PROXY: Record<ProxyVia, { url: string; key: string; label: string; down: string }> = {
  film: { url: "FILM_PROXY_URL", key: "FILM_PROXY_KEY", label: "Server perantara film", down: "Server perantara film (VPS) tidak bisa dihubungi. Pastikan VPS dan layanan film-proxy masih hidup." },
  sanka: { url: "SANKA_PROXY_URL", key: "SANKA_PROXY_KEY", label: "Server perantara Sankanime", down: "Server perantara Sankanime tidak bisa dihubungi." },
};

export function proxyConfigured(via: ProxyVia = "film"): boolean {
  return !!(process.env[PROXY[via].url] && process.env[PROXY[via].key]);
}

export async function viaProxy(url: string, opts: ProxyOpts = {}): Promise<ProxyResult> {
  const cfg = PROXY[opts.via ?? "film"];
  const base = (process.env[cfg.url] || "").trim().replace(/\/+$/, "");
  const key = (process.env[cfg.key] || "").trim();
  if (!base || !key) throw new HttpError(503, `Endpoint ini belum aktif: ${cfg.url} dan ${cfg.key} belum diatur di server.`);

  const qs = new URLSearchParams({ url });
  if (opts.accept) qs.set("accept", opts.accept);
  if (opts.referer) qs.set("referer", opts.referer);
  if (opts.origin) qs.set("origin", "1");
  if (opts.xhr) qs.set("xhr", "1");

  let res: Response;
  try {
    res = await fetch(`${base}/fetch?${qs}`, {
      headers: { "x-proxy-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 28000),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new HttpError(504, `${cfg.label} terlalu lama merespons.`);
    throw new HttpError(502, cfg.down);
  }
  const upstream = res.headers.get("x-upstream-status");
  if (!upstream) {
    // Jawaban berasal dari proxy itu sendiri, bukan dari situs sumber.
    if (res.status === 401) throw new HttpError(502, `Kunci ${cfg.label.toLowerCase()} tidak cocok (${cfg.key}).`);
    if (res.status === 400) throw new HttpError(502, `${cfg.label} menolak alamat sumber (di luar daftar izin).`);
    if (res.status === 504) throw new HttpError(504, "Situs sumber terlalu lama merespons.");
    throw new HttpError(502, `${cfg.label} gagal mengambil halaman sumber.`);
  }
  return { status: res.status, finalUrl: res.headers.get("x-final-url") || url, type: res.headers.get("content-type") || "", text: await res.text() };
}

const CHALLENGE = /just a moment|attention required|cf-chl|challenges\.cloudflare\.com/i;

/** Ambil halaman HTML/JSON lewat proxy; lempar HttpError yang jelas bila ditolak. */
export async function proxyText(url: string, opts: ProxyOpts = {}, source = "Situs sumber"): Promise<ProxyResult> {
  const r = await viaProxy(url, opts);
  if (r.status === 404 || /\/404\.html(\?|$)/.test(r.finalUrl)) throw new HttpError(404, "Halaman tidak ditemukan di situs sumber.");
  if (r.status === 403 || r.status === 429 || r.status === 503 || (r.status !== 200 && CHALLENGE.test(r.text.slice(0, 6000)))) {
    throw new HttpError(502, `${source} menolak permintaan dari server perantara (HTTP ${r.status}).`);
  }
  if (r.status < 200 || r.status >= 300) throw new HttpError(502, `${source} merespons dengan status ${r.status}.`);
  return r;
}

/**
 * Backend Sankanime membungkus sebagian jawabannya sebagai { "_encsankaa": "<base64url dari zlib(JSON)>" }.
 * Fungsi ini mengembalikan JSON aslinya (atau objeknya sendiri bila tidak dibungkus).
 */
export function sankaDecode(text: string): unknown {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new HttpError(502, "Sankanime mengirim jawaban yang bukan JSON.");
  }
  const enc = (d as { _encsankaa?: unknown } | null)?._encsankaa;
  if (typeof enc !== "string") return d;
  try {
    return JSON.parse(inflateSync(Buffer.from(enc, "base64url")).toString("utf8"));
  } catch {
    throw new HttpError(502, "Jawaban Sankanime tidak bisa dibuka (format penyandiannya berubah).");
  }
}
