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
    // TEMP-PROBE-START (sementara, hanya host LK21; dihapus setelah scraper selesai)
    if (action === "probe") {
      const target = new URL(sp.get("url") || "");
      if (target.protocol !== "https:" || !/(^|\.)(lk21official\.cc|lk21\.de|gudangvape\.com|showcdnx\.com)$/.test(target.hostname)) {
        return json(400, { error: "Host tidak diizinkan untuk probe." });
      }
      const headers: Record<string, string> = {
        "user-agent": sp.get("ua") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: sp.get("accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      };
      for (const h of sp.getAll("h")) {
        const i = h.indexOf(":");
        if (i > 0) headers[h.slice(0, i).trim().toLowerCase()] = h.slice(i + 1).trim();
      }
      let r: Response;
      try {
        r = await fetch(target, { headers, redirect: sp.get("manual") ? "manual" : "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
      } catch (e) {
        return json(200, { result: { fetchError: String((e as Error)?.cause ?? e) } });
      }
      const text = await r.text();
      const off = Number(sp.get("off") || 0);
      const len = Math.min(Number(sp.get("len") || 3000), 20000);
      const pad = Number(sp.get("pad") || 0);
      const find = sp.get("find");
      let body = text.slice(off, off + len);
      if (find) {
        const re = new RegExp(find, "g");
        body = [...text.matchAll(re)].slice(0, Number(sp.get("max") || 40)).map((m) => text.slice(Math.max(0, m.index - pad), m.index + m[0].length + pad)).join("\n@@@\n");
      }
      body = body.replace(/</g, "[[").replace(/>/g, "]]");
      return json(200, { result: { status: r.status, final: r.url, location: r.headers.get("location"), type: r.headers.get("content-type"), server: r.headers.get("server"), length: text.length, body } });
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
