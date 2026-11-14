import { after } from "next/server";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchRaw, opt, parseHttpUrl } from "./helpers";
import { clientIp } from "@/lib/guard";
import { IMAGE_TTL_MS, IMAGE_TYPES, MAX_IMAGE_BYTES, hasImageStore, saveImage, sniffImage, sweepExpired } from "@/lib/images";

const MAX_MB = MAX_IMAGE_BYTES / 1024 / 1024;
const TOO_BIG = `Ukuran gambar terlalu besar (maks ${MAX_MB} MB).`;
const NOT_IMAGE = "Berkas bukan gambar yang didukung. Kirim PNG, JPG, GIF, atau WebP.";

/*
  Batas unggah per IP: 10 gambar per 10 menit, di luar batas permintaan umum.
  Hitungannya hidup di memori satu instance server, jadi ini rem untuk pemakaian wajar,
  bukan jaminan mutlak terhadap penyalahgunaan dari banyak instance sekaligus.
*/
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_MS = 10 * 60_000;
const uploads = new Map<string, { count: number; reset: number }>();

function uploadSlot(ip: string): { count: number; reset: number } {
  const now = Date.now();
  if (uploads.size > 5000) for (const [k, v] of uploads) if (v.reset < now) uploads.delete(k);
  let slot = uploads.get(ip);
  if (!slot || slot.reset < now) {
    slot = { count: 0, reset: now + UPLOAD_WINDOW_MS };
    uploads.set(ip, slot);
  }
  if (slot.count >= UPLOAD_LIMIT) {
    throw new HttpError(429, `Batas unggah tercapai: ${UPLOAD_LIMIT} gambar per 10 menit. Coba lagi dalam ${Math.ceil((slot.reset - now) / 60_000)} menit.`);
  }
  return slot;
}

/** Baca gambar dari isi permintaan POST: multipart (field `file` atau `image`) atau isi mentah. `null` bila kosong. */
async function readBody(req: Request): Promise<Uint8Array | null> {
  // Sedikit kelonggaran untuk pembungkus multipart.
  if (Number(req.headers.get("content-length")) > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(413, TOO_BIG);
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (type.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "Isi formulir tidak bisa dibaca. Kirim sebagai multipart/form-data dengan field 'file'.");
    }
    const part = form.get("file") ?? form.get("image");
    if (part === null) return null;
    if (typeof part === "string") throw new HttpError(400, "Field 'file' harus berisi berkas gambar, bukan teks.");
    return new Uint8Array(await part.arrayBuffer());
  }
  const raw = new Uint8Array(await req.arrayBuffer());
  return raw.length ? raw : null;
}

async function readUrl(raw: string): Promise<Uint8Array> {
  const res = await fetchRaw(
    parseHttpUrl(raw).toString(),
    { headers: { accept: "image/png,image/jpeg,image/gif,image/webp,image/*;q=0.8", "user-agent": "Mozilla/5.0 (compatible; YanzAPI/1.0)" } },
    10000,
  );
  if (Number(res.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new HttpError(400, TOO_BIG);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  // Dibaca sepotong-sepotong agar sumber tanpa Content-Length tidak bisa mengirim berkas raksasa.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw new HttpError(502, "Gagal mengunduh gambar dari tautan itu.");
    });
    if (done) break;
    total += value.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(400, TOO_BIG);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const keep = IMAGE_TTL_MS ? `Gambar disimpan ${Math.round(IMAGE_TTL_MS / 86_400_000)} hari, lalu dihapus otomatis.` : "Gambar disimpan tanpa batas waktu.";

export const toUrlEndpoints: Endpoint[] = [
  {
    category: "tools", slug: "tourl", kind: "json",
    title: "Gambar ke URL",
    description: `Unggah gambar dan dapatkan tautan yang bisa dibagikan. Kirim berkasnya lewat POST (multipart, field file), atau lewat GET dengan tautan gambar yang sudah ada. PNG, JPG, GIF, atau WebP, maks ${MAX_MB} MB. ${keep}`,
    params: [{ name: "url", description: "Tautan langsung ke gambar yang ingin disalin ke sini. Tidak perlu diisi bila mengunggah berkas.", example: "https://github.com/github.png" }],
    upload: { field: "file", accept: "image/png,image/jpeg,image/gif,image/webp", maxBytes: MAX_IMAGE_BYTES, description: `Berkas gambar dari perangkatmu (PNG, JPG, GIF, atau WebP, maks ${MAX_MB} MB). Dikirim lewat POST.` },
    handler: async ({ req, sp, origin }) => {
      if (!hasImageStore()) throw new HttpError(503, "Fitur unggah gambar belum aktif: penyimpanan belum dikonfigurasi di server ini.");
      const slot = uploadSlot(clientIp(req));

      const source = opt(sp, "url");
      let buf = req.method === "POST" ? await readBody(req) : null;
      if (!buf && source) buf = await readUrl(source);
      if (!buf) throw new HttpError(400, "Tidak ada gambar yang dikirim. Unggah berkas lewat POST (multipart/form-data, field 'file'), atau isi parameter 'url'.");
      if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(req.method === "POST" ? 413 : 400, TOO_BIG);
      const ext = sniffImage(buf);
      if (!ext) throw new HttpError(400, NOT_IMAGE);

      let name: string;
      try {
        name = await saveImage(buf, ext);
      } catch (e) {
        console.error("[tools/tourl]", e);
        throw new HttpError(503, "Penyimpanan gambar sedang tidak dapat dihubungi. Coba lagi nanti.");
      }
      slot.count++;
      // Bersih-bersih gambar kedaluwarsa dikerjakan setelah respons terkirim.
      const sweep = () => sweepExpired().then(() => undefined, () => undefined);
      try {
        after(sweep);
      } catch {
        void sweep();
      }

      return {
        url: `${origin}/i/${name}`,
        name,
        type: IMAGE_TYPES[ext],
        size: buf.length,
        size_text: sizeText(buf.length),
        expires: IMAGE_TTL_MS ? new Date(Date.now() + IMAGE_TTL_MS).toISOString() : null,
      };
    },
  },
];
