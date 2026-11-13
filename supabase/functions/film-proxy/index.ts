// film-proxy (Supabase Edge Function)
// Meneruskan GET /fetch?url=... ke API Sankanime, yang menolak IP server Vercel.
// Antarmukanya sama dengan scripts/film-proxy/install.sh (header x-proxy-key).
// Pasang:  supabase functions deploy film-proxy --no-verify-jwt
//          supabase secrets set FILM_PROXY_KEY=<kunci acak>
// Lalu di hosting: SANKA_PROXY_URL=https://<ref>.supabase.co/functions/v1/film-proxy
//                  SANKA_PROXY_KEY=<kunci yang sama>
// Secret opsional FILM_PROXY_ALLOW: daftar host yang diizinkan, dipisah koma.

const KEY = Deno.env.get("FILM_PROXY_KEY") ?? "";
const ALLOW = (Deno.env.get("FILM_PROXY_ALLOW") ?? "sankavollerei.web.id,sankanime.web.id")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_BYTES = 5 * 1024 * 1024;
const SAFE_HEADER = /^[\w/+*.,;=\- ]{1,150}$/;

function allowed(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !host || u.username || u.password || u.port) return null;
  return ALLOW.some((h) => host === h || host.endsWith("." + h)) ? u : null;
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function reply(status: number, body: BodyInit, type = "text/plain; charset=utf-8", extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": type, "cache-control": "no-store", ...extra } });
}

Deno.serve(async (req) => {
  const here = new URL(req.url);
  if (req.method !== "GET") return reply(405, "method not allowed");
  if (here.pathname.endsWith("/health")) return reply(200, "ok");
  if (!here.pathname.endsWith("/fetch")) return reply(404, "not found");
  const given = req.headers.get("x-proxy-key") ?? "";
  if (!KEY || !same(given, KEY)) return reply(401, "unauthorized");

  const q = here.searchParams;
  let target = allowed(q.get("url") ?? "");
  if (!target) return reply(400, "url tidak diizinkan");

  const headers: Record<string, string> = { "user-agent": UA, "accept-language": "id-ID,id;q=0.9,en;q=0.8" };
  const accept = q.get("accept") ?? "";
  headers["accept"] = accept && SAFE_HEADER.test(accept) ? accept : "*/*";
  const referer = allowed(q.get("referer") ?? "");
  if (referer) {
    headers["referer"] = referer.href;
    if (q.get("origin") === "1") headers["origin"] = referer.origin;
  }
  if (q.get("xhr") === "1") headers["x-requested-with"] = "XMLHttpRequest";

  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= 5; hop++) {
      res = await fetch(target.href, { headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      await res.body?.cancel();
      const next = allowed(new URL(loc, target).href);
      if (!next) return reply(502, "dialihkan ke host di luar daftar izin", undefined, { "x-final-url": new URL(loc, target).href.slice(0, 500) });
      target = next;
      res = null;
    }
    if (!res) return reply(502, "gagal mengambil: terlalu banyak pengalihan");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return reply(502, "gagal mengambil: respons terlalu besar");
    return reply(res.status, buf, res.headers.get("content-type") ?? "application/octet-stream", {
      "x-final-url": target.href.slice(0, 500),
      "x-upstream-status": String(res.status),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return reply(504, "timeout");
    return reply(502, "gagal mengambil: " + String(e).slice(0, 300));
  }
});
