import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "./config";

/*
  Login Google memakai alur OAuth 2.0 "authorization code" dengan PKCE, langsung ke Google
  (tanpa pustaka tambahan). Alamat balik yang harus didaftarkan di Google Cloud Console:
      <alamat situs>/auth/google/callback
*/

// GOOGLE_OAUTH_TEST_BASE hanya untuk pengujian lokal dengan server Google tiruan.
const testBase = (process.env.GOOGLE_OAUTH_TEST_BASE || "").trim().replace(/\/+$/, "");
const AUTH_URL = testBase ? `${testBase}/auth` : "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = testBase ? `${testBase}/token` : "https://oauth2.googleapis.com/token";
const USERINFO_URL = testBase ? `${testBase}/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo";

export const OAUTH_COOKIE = "yn_oauth";
export type OAuthState = { state: string; verifier: string; next: string };

export function newOAuthState(next: string): OAuthState {
  return { state: randomBytes(16).toString("base64url"), verifier: randomBytes(32).toString("base64url"), next };
}

export function googleAuthUrl(redirectUri: string, s: OAuthState): string {
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: s.state,
    code_challenge: createHash("sha256").update(s.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${q}`;
}

export type GoogleProfile = { email: string; name: string; picture: string };

async function post(url: string, body: URLSearchParams): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Tukar `code` dengan profil pengguna. Melempar Error bila Google menolak atau emailnya belum terverifikasi. */
export async function googleProfile(code: string, redirectUri: string, verifier: string): Promise<GoogleProfile> {
  const tokenRes = await post(
    TOKEN_URL,
    new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
  );
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!tokenRes.ok || !token?.access_token) throw new Error(`Google menolak kode login: ${token?.error ?? tokenRes.status} ${token?.error_description ?? ""}`.trim());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let info: { email?: string; email_verified?: boolean | string; name?: string; picture?: string } | null;
  try {
    const res = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: ctrl.signal });
    info = res.ok ? ((await res.json().catch(() => null)) as typeof info) : null;
  } finally {
    clearTimeout(timer);
  }
  if (!info?.email) throw new Error("Google tidak mengirim alamat email.");
  if (info.email_verified !== true && info.email_verified !== "true") throw new Error("Alamat email Google belum terverifikasi.");
  return { email: info.email, name: info.name ?? "", picture: info.picture ?? "" };
}
