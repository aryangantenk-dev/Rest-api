import { randomBytes } from "node:crypto";

/**
 * Penyimpanan gambar unggahan (endpoint /api/tools/tourl dan alamat /i/<nama>).
 *
 * Berkas disimpan di Supabase Storage, di bucket privat. Bucket privat berarti gambar hanya
 * bisa dibuka lewat /i/<nama> di situs ini, jadi menghapus berkasnya benar-benar mematikan
 * tautannya. Bucket dibuat otomatis saat unggahan pertama.
 *
 * Butuh SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Tanpa keduanya fitur ini nonaktif.
 */
const base = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

export const IMAGE_BUCKET = (process.env.IMAGE_BUCKET || "yanz-images").trim();
/** Batas isi permintaan di Vercel 4,5 MB, jadi unggahan dibatasi 4 MB. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const ttlDays = (() => {
  const n = Number(process.env.IMAGE_TTL_DAYS);
  return process.env.IMAGE_TTL_DAYS?.trim() && Number.isFinite(n) && n >= 0 && n <= 3650 ? n : 30;
})();
/** Umur simpan gambar dalam milidetik. 0 berarti tidak pernah dihapus otomatis. */
export const IMAGE_TTL_MS = Math.round(ttlDays * 86_400_000);

export const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" } as const;
export type ImageExt = keyof typeof IMAGE_TYPES;
export const IMAGE_NAME_RE = /^[0-9A-Za-z]{10}\.(png|jpg|gif|webp)$/;

export type StoredImage = { name: string; size: number; created_at: string | null };

export function hasImageStore(): boolean {
  return !!(base && key);
}

/**
 * Kenali jenis gambar dari byte awalnya. Jenis yang diaku pengirim (nama berkas, Content-Type)
 * tidak dipercaya; berkas selain PNG, JPG, GIF, dan WebP (termasuk SVG dan HTML) ditolak.
 */
export function sniffImage(b: Uint8Array): ImageExt | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  const head = String.fromCharCode(...b.subarray(0, 12));
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "webp";
  return null;
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomCode(length = 10): string {
  let out = "";
  while (out.length < length) {
    // Byte 248 ke atas dibuang agar setiap karakter sama peluangnya.
    for (const byte of randomBytes(length * 2)) if (byte < 248 && out.length < length) out += ALPHABET[byte % 62];
  }
  return out;
}

async function storage(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${base}/storage/v1${path}`, {
      ...init,
      headers: { apikey: key, authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function createBucket(): Promise<void> {
  const res = await storage("/bucket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: IMAGE_BUCKET, name: IMAGE_BUCKET, public: false, file_size_limit: MAX_IMAGE_BYTES, allowed_mime_types: Object.values(IMAGE_TYPES) }),
  });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  if (/already exists|duplicate/i.test(text)) return;
  throw new Error(`Gagal membuat bucket (${res.status}): ${text.slice(0, 200)}`);
}

/** Simpan gambar dan kembalikan nama berkasnya, mis. `aB3dE5fG7h.png`. Melempar Error bila penyimpanan gagal. */
export async function saveImage(buf: Uint8Array, ext: ImageExt): Promise<string> {
  const name = `${randomCode()}.${ext}`;
  const put = () =>
    storage(`/object/${IMAGE_BUCKET}/${name}`, {
      method: "POST",
      headers: { "content-type": IMAGE_TYPES[ext], "cache-control": "max-age=31536000", "x-upsert": "false" },
      body: buf as BodyInit,
    });
  let res = await put();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (!/bucket not found/i.test(text)) throw new Error(`Unggah gagal (${res.status}): ${text.slice(0, 200)}`);
    await createBucket();
    res = await put();
    if (!res.ok) throw new Error(`Unggah gagal (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return name;
}

/** Buka berkas gambar. `null` bila berkasnya tidak ada; melempar Error bila penyimpanan bermasalah. */
export async function openImage(name: string): Promise<Response | null> {
  const res = await storage(`/object/authenticated/${IMAGE_BUCKET}/${name}`);
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  if (res.status === 404 || /not.?found/i.test(text)) return null;
  throw new Error(`Gagal membuka gambar (${res.status}): ${text.slice(0, 200)}`);
}

/** Hapus berkas; mengembalikan jumlah yang benar-benar terhapus. */
export async function removeImages(names: string[]): Promise<number> {
  if (!names.length) return 0;
  const res = await storage(`/object/${IMAGE_BUCKET}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefixes: names }),
  });
  if (!res.ok) throw new Error(`Gagal menghapus gambar (${res.status})`);
  const rows = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listImages(limit: number, order: "asc" | "desc"): Promise<StoredImage[]> {
  const res = await storage(`/object/list/${IMAGE_BUCKET}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit, offset: 0, sortBy: { column: "created_at", order } }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Bucket belum pernah dipakai: belum ada gambar.
    if (/bucket not found/i.test(text)) return [];
    throw new Error(`Gagal membaca daftar gambar (${res.status})`);
  }
  const rows = (await res.json().catch(() => [])) as { name?: string; created_at?: string | null; metadata?: { size?: number } | null }[];
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => typeof r.name === "string" && IMAGE_NAME_RE.test(r.name))
    .map((r) => ({ name: r.name!, size: Number(r.metadata?.size) || 0, created_at: r.created_at ?? null }));
}

/** true bila gambar sudah melewati umur simpannya. */
export function isExpired(createdAt: string | number | null | undefined, now = Date.now()): boolean {
  if (!IMAGE_TTL_MS || createdAt === null || createdAt === undefined) return false;
  const t = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isFinite(t) && now - t > IMAGE_TTL_MS;
}

/** Hapus gambar tertua yang sudah kedaluwarsa (maksimal 100 sekali jalan). Dipanggil setelah setiap unggahan. */
export async function sweepExpired(): Promise<number> {
  if (!IMAGE_TTL_MS) return 0;
  const oldest = await listImages(100, "asc");
  return removeImages(oldest.filter((o) => isExpired(o.created_at)).map((o) => o.name));
}
