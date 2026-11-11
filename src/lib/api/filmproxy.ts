import { HttpError } from "./types";

/**
 * Penerus permintaan lewat VPS (lihat scripts/film-proxy/install.sh).
 * Situs film menolak IP server Vercel, jadi permintaannya dititipkan ke VPS
 * ber-IP Indonesia. Atur FILM_PROXY_URL dan FILM_PROXY_KEY di environment.
 */
export type ProxyOpts = { accept?: string; referer?: string; origin?: boolean; xhr?: boolean; timeoutMs?: number };
export type ProxyResult = { status: number; finalUrl: string; type: string; text: string };

export function proxyConfigured(): boolean {
  return !!(process.env.FILM_PROXY_URL && process.env.FILM_PROXY_KEY);
}

export async function viaProxy(url: string, opts: ProxyOpts = {}): Promise<ProxyResult> {
  const base = (process.env.FILM_PROXY_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.FILM_PROXY_KEY || "").trim();
  if (!base || !key) throw new HttpError(503, "Endpoint film belum aktif: FILM_PROXY_URL dan FILM_PROXY_KEY belum diatur di server.");

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
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new HttpError(504, "Server perantara film terlalu lama merespons.");
    throw new HttpError(502, "Server perantara film (VPS) tidak bisa dihubungi. Pastikan VPS dan layanan film-proxy masih hidup.");
  }
  const upstream = res.headers.get("x-upstream-status");
  if (!upstream) {
    // Jawaban berasal dari proxy itu sendiri, bukan dari situs sumber.
    if (res.status === 401) throw new HttpError(502, "Kunci server perantara film tidak cocok (FILM_PROXY_KEY).");
    if (res.status === 400) throw new HttpError(502, "Server perantara film menolak alamat sumber (di luar daftar izin).");
    if (res.status === 504) throw new HttpError(504, "Situs sumber terlalu lama merespons.");
    throw new HttpError(502, "Server perantara film gagal mengambil halaman sumber.");
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

/* ------------------------------------------------------------------ Sanka */

import { inflateSync } from "node:zlib";

/**
 * Backend SankaMovies membungkus jawabannya sebagai { "_encsankaa": "<base64url dari zlib(JSON)>" }.
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
