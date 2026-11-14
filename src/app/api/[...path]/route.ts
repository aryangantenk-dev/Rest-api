import { NextResponse } from "next/server";
import { findEndpoint } from "@/lib/api/registry";
import { HttpError } from "@/lib/api/types";
import { SITE_CREATOR, getOrigin } from "@/lib/site";
import { recordHit } from "@/lib/stats";
import { APPEAL_URL, OWNER_WA, RATE_LIMIT, clientIp, guard } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sebagian besar endpoint selesai dalam beberapa detik; batas ini dibuat longgar untuk build APK (tools/web2apk).
export const maxDuration = 120;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "*",
};

function fail(status: number, error: string, extra: Record<string, string> = {}, more: Record<string, unknown> = {}) {
  return NextResponse.json({ status: false, code: status, creator: SITE_CREATOR, error, ...more }, { status, headers: { ...CORS, ...extra } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

type RouteCtx = { params: Promise<{ path: string[] }> };

export function GET(req: Request, ctx: RouteCtx) {
  return handle(req, ctx);
}

/** POST hanya untuk endpoint yang menerima unggahan berkas (lihat `upload` di definisi endpoint). */
export function POST(req: Request, ctx: RouteCtx) {
  return handle(req, ctx);
}

async function handle(req: Request, ctx: RouteCtx) {
  const { path } = await ctx.params;
  const key = path.join("/").toLowerCase();
  const endpoint = findEndpoint(key);
  if (!endpoint) {
    return fail(404, `Endpoint '/api/${key}' tidak ditemukan. Lihat daftar lengkap di /docs atau GET /api.`);
  }
  if (req.method === "POST" && !endpoint.upload) {
    return fail(405, `Endpoint '/api/${key}' hanya menerima GET.`, { allow: "GET, OPTIONS" });
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
    return new NextResponse(JSON.stringify({ status: true, creator: SITE_CREATOR, result }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...rlHeaders },
    });
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message, rlHeaders);
    console.error(`[api/${key}]`, e);
    return fail(500, "Terjadi kesalahan internal pada server.", rlHeaders);
  }
}
