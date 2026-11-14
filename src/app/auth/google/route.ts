import { HAS_GOOGLE } from "@/lib/auth/config";
import { OAUTH_COOKIE, googleAuthUrl, newOAuthState } from "@/lib/auth/google";
import { authOrigin, googleRedirectUri } from "@/lib/auth/origin";
import { cookie, isSecure, safeNext, seal } from "@/lib/auth/session";
import { getOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Mulai login Google: simpan state di cookie, lalu alihkan ke halaman pilih akun Google. */
export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const home = authOrigin(req);
  if (!HAS_GOOGLE) return Response.redirect(`${getOrigin(req)}/login?error=google_off`, 302);
  // Cookie state harus tersimpan di domain yang sama dengan alamat balik.
  if (getOrigin(req) !== home) return Response.redirect(`${home}/auth/google?next=${encodeURIComponent(next)}`, 302);

  const state = newOAuthState(next);
  return new Response(null, {
    status: 302,
    headers: {
      location: googleAuthUrl(googleRedirectUri(req), state),
      "set-cookie": cookie(OAUTH_COOKIE, seal("oauth", state, 600), 600, isSecure(req)),
      "cache-control": "no-store",
    },
  });
}
