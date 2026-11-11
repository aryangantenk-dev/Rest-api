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
    // TEMP-PROBE-START
    if (action === "probe") {
      const target = sp.get("url") || "";
      const headers: Record<string, string> = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: sp.get("accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      };
      const r = await fetch(target, { headers, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
      const isText = /text|json|xml|javascript/.test(r.headers.get("content-type") || "");
      const text = isText ? await r.text() : "";
      const off = Number(sp.get("off") || 0);
      const len = Math.min(Number(sp.get("len") || 3000), 20000);
      const find = sp.get("find");
      let body = text.slice(off, off + len);
      if (find) {
        const re = new RegExp(find, "g");
        body = [...text.matchAll(re)].slice(0, 40).map((m) => text.slice(Math.max(0, m.index - Number(sp.get("pad") || 0)), m.index + m[0].length + Number(sp.get("pad") || 0))).join("\n@@@\n");
      }
      return json(200, { result: { status: r.status, final: r.url, type: r.headers.get("content-type"), length: text.length, body } });
    }
    // TEMP-PROBE-END
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
