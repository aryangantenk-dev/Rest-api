import { KEY_RE } from "./keys";
import { keyOwner } from "./users";

/*
  Pemeriksaan API key untuk setiap permintaan ke /api/<kategori>/<endpoint>.
  Hasilnya di-cache di memori tiap instance supaya tidak ada satu panggilan database per
  permintaan. Akibatnya key yang diganti atau akun yang dinonaktifkan bisa masih diterima
  paling lama VALID_TTL_MS di instance lain.
*/
const VALID_TTL_MS = 60_000;
const INVALID_TTL_MS = 30_000;
const MAX_ENTRIES = 20_000;

export type KeyVerdict = "ok" | "invalid" | "banned" | "error";
type Entry = { verdict: Exclude<KeyVerdict, "error">; exp: number };

const g = globalThis as typeof globalThis & { __yanzKeys?: Map<string, Entry> };
const cache = (g.__yanzKeys ??= new Map());

/** Ambil API key dari query (?apikey=) atau header (x-api-key, Authorization: Bearer). */
export function keyFromRequest(req: Request, sp: URLSearchParams): string {
  const fromQuery = sp.get("apikey") ?? sp.get("api_key");
  if (fromQuery) return fromQuery.trim();
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
  return bearer ? bearer[1] : "";
}

export async function verifyKey(key: string): Promise<KeyVerdict> {
  if (!KEY_RE.test(key)) return "invalid";
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.verdict;
  let verdict: Entry["verdict"];
  try {
    const owner = await keyOwner(key);
    verdict = !owner ? "invalid" : owner.banned ? "banned" : "ok";
  } catch {
    // Database tidak bisa dihubungi: pakai jawaban terakhir bila ada, selain itu tolak dulu.
    return hit ? hit.verdict : "error";
  }
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (v.exp <= now) cache.delete(k);
    if (cache.size >= MAX_ENTRIES) cache.clear();
  }
  cache.set(key, { verdict, exp: now + (verdict === "ok" ? VALID_TTL_MS : INVALID_TTL_MS) });
  return verdict;
}

/** Lupakan sebuah key di instance ini (dipanggil saat key diganti). */
export function forgetKey(key: string) {
  cache.delete(key);
}

/** Kosongkan cache (dipanggil saat owner menonaktifkan / mengaktifkan akun). */
export function forgetAllKeys() {
  cache.clear();
}

/**
 * Sisipkan API key ke tautan dalam respons yang menunjuk ke API ini sendiri (mis. `cek`,
 * `next`, proxy gambar komik, halaman player), supaya tautan itu tetap bisa langsung dipakai.
 * Key disisipkan tepat setelah `?` agar tautan yang sengaja dibiarkan terbuka di ujungnya
 * (`...&jawaban=`) masih bisa disambung.
 */
export function withKeyInLinks<T>(value: T, origin: string, key: string): T {
  const prefix = `${origin}/api/`;
  const param = `apikey=${encodeURIComponent(key)}`;
  const fix = (s: string): string => {
    if (!s.startsWith(prefix) || /[?&]apikey=/.test(s)) return s;
    const q = s.indexOf("?");
    if (q < 0) return `${s}?${param}`;
    return q === s.length - 1 ? `${s}${param}` : `${s.slice(0, q + 1)}${param}&${s.slice(q + 1)}`;
  };
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === "string") return fix(v);
    if (depth > 12 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, depth + 1);
    return out;
  };
  return walk(value, 0) as T;
}

/** Sama seperti `withKeyInLinks`, untuk tautan di dalam halaman HTML (atribut href/src yang sudah di-escape). */
export function withKeyInHtml(html: string, origin: string, key: string): string {
  const prefix = `${origin}/api/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`${prefix}[A-Za-z0-9/_-]+\\?(?!apikey=)`, "g"), (m) => `${m}apikey=${encodeURIComponent(key)}&amp;`);
}
