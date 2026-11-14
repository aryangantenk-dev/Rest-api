import { after } from "next/server";
import { IMAGE_NAME_RE, IMAGE_TYPES, type ImageExt, hasImageStore, isExpired, openImage, removeImages } from "@/lib/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Alamat gambar unggahan: /i/<kode>.<png|jpg|gif|webp>. */
const text = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!IMAGE_NAME_RE.test(name) || !hasImageStore()) return text(404, "Gambar tidak ditemukan.");

  let res: Response | null;
  try {
    res = await openImage(name);
  } catch (e) {
    console.error("[i]", e);
    return text(502, "Penyimpanan gambar sedang tidak dapat dihubungi.");
  }
  if (!res) return text(404, "Gambar tidak ditemukan atau sudah dihapus.");

  const modified = res.headers.get("last-modified");
  if (isExpired(modified)) {
    await res.body?.cancel();
    const drop = () => removeImages([name]).then(() => undefined, () => undefined);
    try {
      after(drop);
    } catch {
      void drop();
    }
    return text(404, "Gambar tidak ditemukan atau sudah dihapus.");
  }

  const headers: Record<string, string> = {
    // Jenisnya ditentukan dari nama berkas, yang kami buat sendiri setelah memeriksa isi gambar.
    "content-type": IMAGE_TYPES[name.split(".")[1] as ImageExt],
    "content-disposition": `inline; filename="${name}"`,
    // Satu jam: gambar yang dihapus owner berhenti tampil paling lama satu jam kemudian.
    "cache-control": "public, max-age=3600, s-maxage=3600",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  };
  const length = res.headers.get("content-length");
  if (length) headers["content-length"] = length;
  if (modified) headers["last-modified"] = modified;
  return new Response(res.body, { headers });
}
