import { NextResponse } from "next/server";
import { findEndpoint } from "@/lib/api/registry";
import { HttpError } from "@/lib/api/types";
import { getOrigin } from "@/lib/site";
import { recordHit } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

/* Rate limit sederhana per IP: 120 permintaan / menit (tanpa API key). */
const WINDOW_MS = 60_000;
const LIMIT = 120;
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  let b = buckets.get(ip);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count++;
  return { ok: b.count <= LIMIT, remaining: Math.max(0, LIMIT - b.count), reset: Math.ceil((b.reset - now) / 1000) };
}

function fail(status: number, error: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ status: false, code: status, creator: "Yanxz", error }, { status, headers: { ...CORS, ...extra } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = path.join("/").toLowerCase();
  const endpoint = findEndpoint(key);
  if (!endpoint) {
    return fail(404, `Endpoint '/api/${key}' tidak ditemukan. Lihat daftar lengkap di /docs atau GET /api.`);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
  const rl = rateLimit(ip);
  const rlHeaders = { "x-ratelimit-limit": String(LIMIT), "x-ratelimit-remaining": String(rl.remaining), "retry-after": String(rl.reset) };
  if (!rl.ok) return fail(429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.", rlHeaders);

  try {
    const sp = new URL(req.url).searchParams;
    const result = await endpoint.handler({ req, sp, origin: getOrigin(req) });
    recordHit(key);

    if (result instanceof Response) {
      for (const [k, v] of Object.entries({ ...CORS, ...rlHeaders })) result.headers.set(k, v);
      return result;
    }
    return new NextResponse(JSON.stringify({ status: true, creator: "Yanxz", result }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...rlHeaders },
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, rlHeaders);
    console.error(`[api/${key}]`, e);
    return fail(500, "Terjadi kesalahan internal pada server.", rlHeaders);
  }
}
