import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminBan, adminListBans, adminUnban } from "@/lib/guard";
import { IMAGE_NAME_RE, hasImageStore, listImages, removeImages } from "@/lib/images";
import { SITE_CREATOR, getOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint khusus owner untuk mengelola blokir IP dan gambar unggahan.
 *   /api/admin/bans?key=ADMIN_KEY               daftar IP yang diblokir
 *   /api/admin/unban?ip=1.2.3.4&key=ADMIN_KEY   buka blokir
 *   /api/admin/ban?ip=1.2.3.4&reason=..&key=..  blokir manual
 *   /api/admin/images?key=ADMIN_KEY             100 gambar unggahan terbaru
 *   /api/admin/delimage?name=..&key=ADMIN_KEY   hapus satu gambar unggahan
 * Kunci juga boleh dikirim lewat header `x-admin-key`.
 */
const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json({ status: status < 400, code: status, creator: SITE_CREATOR, ...body }, { status, headers: { "cache-control": "no-store" } });

function authorized(given: string) {
  const key = (process.env.ADMIN_KEY || "").trim();
  if (!key) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const ok = authorized(sp.get("key") || req.headers.get("x-admin-key") || "");
  if (ok === null) return json(503, { error: "ADMIN_KEY belum diatur di environment variable server." });
  if (!ok) return json(401, { error: "Kunci admin salah." });

  try {
    if (action === "bans") {
      const bans = await adminListBans();
      return json(200, { result: { total: bans.length, bans } });
    }
    if (action === "images" || action === "delimage") {
      if (!hasImageStore()) return json(503, { error: "Penyimpanan gambar belum dikonfigurasi di server ini." });
      if (action === "images") {
        const origin = getOrigin(req);
        const images = (await listImages(100, "desc")).map((i) => ({ ...i, url: `${origin}/i/${i.name}` }));
        return json(200, { result: { total: images.length, images } });
      }
      // Boleh diisi nama berkas saja atau tautan lengkapnya.
      const name = (sp.get("name") || "").trim().split("/").pop() ?? "";
      if (!IMAGE_NAME_RE.test(name)) return json(400, { error: "Parameter 'name' wajib diisi dengan nama berkas gambar, mis. aB3dE5fG7h.png." });
      const removed = await removeImages([name]);
      if (!removed) return json(404, { error: "Gambar tidak ditemukan atau sudah dihapus." });
      return json(200, { result: { name, deleted: true, message: "Gambar dihapus. Salinan di cache bisa masih tampil paling lama satu jam." } });
    }
    const ip = (sp.get("ip") || "").trim().toLowerCase();
    if (action === "unban" || action === "ban") {
      if (!/^[0-9a-f:.]{3,45}$/.test(ip)) return json(400, { error: "Parameter 'ip' wajib diisi dengan alamat IP yang valid." });
      if (action === "unban") {
        await adminUnban(ip);
        return json(200, { result: { ip, banned: false, message: "Blokir dibuka. Berlaku penuh di semua server dalam ±30 detik." } });
      }
      const reason = (sp.get("reason") || "Diblokir manual oleh owner").slice(0, 300);
      await adminBan(ip, reason);
      return json(200, { result: { ip, banned: true, reason } });
    }
    return json(404, { error: "Aksi tidak dikenal. Gunakan: bans, ban, unban, images, delimage." });
  } catch (e) {
    console.error("[api/admin]", e);
    return json(502, { error: "Gagal menghubungi database atau penyimpanan." });
  }
}
