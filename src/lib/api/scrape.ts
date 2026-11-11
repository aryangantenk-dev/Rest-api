import { load, type CheerioAPI } from "cheerio";
import { HttpError } from "./types";
import { fetchRaw } from "./helpers";

/** Elemen hasil seleksi cheerio. */
export type El = ReturnType<CheerioAPI>;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function browserHeaders(referer: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "user-agent": BROWSER_UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer,
    ...extra,
  };
}

export type Page = { $: CheerioAPI; html: string; url: string };

/** Ambil halaman HTML dengan header mirip browser, 1x percobaan ulang bila server sumber gagal. */
export async function fetchPage(url: string, referer: string, extra: Record<string, string> = {}, timeoutMs = 15000): Promise<Page> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchRaw(url, { headers: browserHeaders(referer, extra), redirect: "follow" }, timeoutMs);
      const html = await res.text();
      return { $: load(html), html, url: res.url || url };
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 404) throw e;
    }
  }
  throw lastErr;
}

export function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Ubah URL relatif / protocol-relative menjadi absolut. */
export function absUrl(raw: string | undefined | null, base: string): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.startsWith("data:") || v.startsWith("javascript:")) return null;
  try {
    return new URL(v, base).toString();
  } catch {
    return null;
  }
}

/** URL gambar dari <img>, memperhitungkan atribut lazy-load. */
export function imgSrc(el: El, base: string): string | null {
  for (const attr of ["data-src", "data-lazy-src", "data-original", "src"]) {
    const v = el.attr(attr);
    if (v && !/\/lazy\.(jpg|png|gif|webp)/i.test(v) && !v.startsWith("data:")) return absUrl(v, base);
  }
  return null;
}

/**
 * Validasi slug dari parameter. Menerima slug polos maupun URL lengkap
 * (diambil segmen path terakhir yang relevan oleh pemanggil).
 */
export function cleanSlug(raw: string, name = "slug"): string {
  let v = raw.trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* biarkan apa adanya */
  }
  v = v.replace(/^\/+|\/+$/g, "");
  if (!v || v.length > 250 || /[\/\\?#\s<>"']/.test(v) || v.includes("..")) {
    throw new HttpError(400, `Parameter '${name}' tidak valid.`);
  }
  return v;
}

/** Segmen path dari sebuah URL (sudah di-decode). */
export function pathParts(href: string | null | undefined, base: string): string[] {
  if (!href) return [];
  try {
    return new URL(href, base).pathname
      .split("/")
      .filter(Boolean)
      .map((p) => {
        try {
          return decodeURIComponent(p);
        } catch {
          return p;
        }
      });
  } catch {
    return [];
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
