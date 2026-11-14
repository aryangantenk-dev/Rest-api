import { AVATAR_DIR, AVATAR_NAME_RE, IMAGE_TYPES, type ImageExt, hasImageStore, openImage } from "@/lib/images";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Foto profil: /avatar/<kode>.<png|jpg|webp>. Namanya berganti setiap kali foto diganti. */
const text = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!AVATAR_NAME_RE.test(name) || !hasImageStore()) return text(404, "Foto tidak ditemukan.");

  let res: Response | null;
  try {
    res = await openImage(`${AVATAR_DIR}${name}`);
  } catch (e) {
    console.error("[avatar]", e);
    return text(502, "Penyimpanan foto sedang tidak dapat dihubungi.");
  }
  if (!res) return text(404, "Foto tidak ditemukan atau sudah dihapus.");

  const headers: Record<string, string> = {
    // Jenisnya ditentukan dari nama berkas, yang kami buat sendiri setelah memeriksa isi gambar.
    "content-type": IMAGE_TYPES[name.split(".")[1] as ImageExt],
    // Sehari: foto yang dihapus pemiliknya berhenti tampil paling lama sehari kemudian.
    "cache-control": "public, max-age=86400",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  const length = res.headers.get("content-length");
  if (length) headers["content-length"] = length;
  return new Response(res.body, { headers });
}
