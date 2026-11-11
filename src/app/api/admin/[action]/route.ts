import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminBan, adminListBans, adminUnban } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint khusus owner untuk mengelola blokir IP.
 *   /api/admin/bans?key=ADMIN_KEY               daftar IP yang diblokir
 *   /api/admin/unban?ip=1.2.3.4&key=ADMIN_KEY   buka blokir
 *   /api/admin/ban?ip=1.2.3.4&reason=..&key=..  blokir manual
 * Kunci juga boleh dikirim lewat header `x-admin-key`.
 */
const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json({ status: status < 400, code: status, creator: "Yanxz", ...body }, { status, headers: { "cache-control": "no-store" } });

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
    return json(404, { error: "Aksi tidak dikenal. Gunakan: bans, ban, unban." });
  } catch (e) {
    console.error("[api/admin]", e);
    return json(502, { error: "Gagal menghubungi database." });
  }
}
