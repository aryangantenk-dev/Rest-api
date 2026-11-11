import { NextResponse } from "next/server";
import { findEndpoint } from "@/lib/api/registry";
import { HttpError } from "@/lib/api/types";
import { getOrigin } from "@/lib/site";
import { recordHit } from "@/lib/stats";
import { APPEAL_URL, OWNER_WA, RATE_LIMIT, clientIp, guard } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

function fail(status: number, error: string, extra: Record<string, string> = {}, more: Record<string, unknown> = {}) {
  return NextResponse.json({ status: false, code: status, creator: "Yanxz", error, ...more }, { status, headers: { ...CORS, ...extra } });
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

  const ip = clientIp(req);
  const verdict = await guard(ip);
  const rlHeaders = verdict.headers;
  if (verdict.kind === "banned") {
    return fail(
      403,
      `IP kamu (${ip}) diblokir karena melanggar batas ${RATE_LIMIT} permintaan per menit. Untuk banding, hubungi owner lewat WhatsApp ${OWNER_WA}.`,
      rlHeaders,
      { banned: true, ip, reason: verdict.reason, appeal: APPEAL_URL },
    );
  }
  if (verdict.kind === "limited") {
    return fail(
      429,
      `Terlalu banyak permintaan: batasnya ${RATE_LIMIT} per menit per IP. Coba lagi dalam ${verdict.retryAfter} detik. Pelanggaran berulang membuat IP diblokir.`,
      rlHeaders,
      { limit: RATE_LIMIT, retry_after: verdict.retryAfter, strikes: verdict.strikes },
    );
  }

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
