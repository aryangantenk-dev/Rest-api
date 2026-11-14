import { HAS_GOOGLE } from "@/lib/auth/config";
import { OAUTH_COOKIE, googleProfile, type OAuthState } from "@/lib/auth/google";
import { authOrigin, googleRedirectUri } from "@/lib/auth/origin";
import { cookie, isSecure, readCookie, safeNext, sessionCookie, unseal } from "@/lib/auth/session";
import { login, normalizeEmail } from "@/lib/auth/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Google mengalihkan ke sini setelah pengguna memilih akun. */
export async function GET(req: Request) {
  const home = authOrigin(req);
  const secure = isSecure(req);
  const sp = new URL(req.url).searchParams;
  const saved = unseal<OAuthState>("oauth", readCookie(req, OAUTH_COOKIE));

  const go = (path: string, session?: string) => {
    const headers = new Headers({ location: `${home}${path}`, "cache-control": "no-store" });
    headers.append("set-cookie", cookie(OAUTH_COOKIE, "", 0, secure));
    if (session) headers.append("set-cookie", session);
    return new Response(null, { status: 302, headers });
  };
  const back = (error: string) => go(`/login?error=${error}${saved?.next ? `&next=${encodeURIComponent(safeNext(saved.next))}` : ""}`);

  if (!HAS_GOOGLE) return back("google_off");
  if (sp.get("error")) return back("google_denied");
  const code = sp.get("code");
  if (!code || !saved || !sp.get("state") || sp.get("state") !== saved.state) return back("google_state");

  try {
    const profile = await googleProfile(code, googleRedirectUri(req), saved.verifier);
    const email = normalizeEmail(profile.email);
    if (!email) return back("google_failed");
    const user = await login(email, profile.name, /^https:\/\//.test(profile.picture) ? profile.picture : "", "google");
    if (user.banned) return back("banned");
    const dest = safeNext(saved.next);
    // Username wajib: akun yang belum punya diarahkan mengisinya dulu di /akun, lalu lanjut ke tujuan semula.
    const first = user.username || dest === "/akun" ? dest : `/akun?next=${encodeURIComponent(dest)}`;
    return go(first, sessionCookie(user.id, secure));
  } catch (e) {
    console.error("[auth/google]", e instanceof Error ? e.message : e);
    return back("google_failed");
  }
}
