import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { AUTH_ENABLED, HAS_EMAIL, HAS_GOOGLE, KEY_REQUIRED, OTP_TTL_SEC } from "@/lib/auth/config";
import { forgetKey } from "@/lib/auth/apikey";
import { hit } from "@/lib/auth/limit";
import { sendOtpEmail } from "@/lib/auth/mail";
import { clearSessionCookie, isSecure, otpHash, sessionCookie, sessionUserId } from "@/lib/auth/session";
import { login, normalizeEmail, otpCancel, otpCheck, otpIssue, publicUser, rotateKey, userById } from "@/lib/auth/users";
import { clientIp } from "@/lib/guard";
import { SITE_CREATOR, getOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rute login untuk halaman /login dan /akun (bukan bagian dari API publik).
 *   GET  /api/auth/me          sesi saat ini beserta API key pemiliknya
 *   POST /api/auth/otp         { email }        kirim kode 6 digit ke email
 *   POST /api/auth/verify      { email, code }  tukar kode dengan sesi
 *   POST /api/auth/regenerate  ganti API key
 *   POST /api/auth/logout      akhiri sesi
 * Login Google ada di /auth/google.
 */
function json(status: number, body: Record<string, unknown>, setCookie?: string) {
  const res = NextResponse.json({ status: status < 400, creator: SITE_CREATOR, ...body }, { status, headers: { "cache-control": "no-store, private" } });
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json(status, { code: status, error, ...extra });

/** Permintaan yang mengubah sesuatu harus datang dari halaman situs ini sendiri. */
function sameSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(getOrigin(req)).host;
  } catch {
    return false;
  }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (text.length > 2000) return {};
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const STORE_DOWN = "Server akun sedang tidak dapat dihubungi. Coba lagi sebentar lagi.";

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "me") return fail(404, "Aksi tidak dikenal.");
  const base = { methods: { google: HAS_GOOGLE, email: HAS_EMAIL }, keyRequired: KEY_REQUIRED };
  const id = AUTH_ENABLED ? sessionUserId(req) : null;
  if (!id) return json(200, { user: null, apiKey: null, ...base });
  try {
    const user = await userById(id);
    if (!user || user.banned) return json(200, { user: null, apiKey: null, ...base }, clearSessionCookie(isSecure(req)));
    return json(200, { user: publicUser(user), apiKey: user.api_key, ...base });
  } catch (e) {
    console.error("[auth/me]", e);
    return fail(503, STORE_DOWN, base);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!["otp", "verify", "regenerate", "logout"].includes(action)) return fail(404, "Aksi tidak dikenal.");
  if (!sameSite(req)) return fail(403, "Permintaan ini hanya bisa dikirim dari halaman situs ini.");
  const secure = isSecure(req);
  if (action === "logout") return json(200, { user: null }, clearSessionCookie(secure));
  if (!AUTH_ENABLED) return fail(503, "Login belum diaktifkan di server ini.");

  const ip = clientIp(req);
  try {
    if (action === "otp") {
      if (!HAS_EMAIL) return fail(503, "Login lewat email belum diaktifkan di server ini.");
      const email = normalizeEmail((await readBody(req)).email);
      if (!email) return fail(400, "Alamat email tidak valid. Contoh: nama@gmail.com.", { field: "email" });
      const wait = hit("otp", ip, 6, 10 * 60_000);
      if (wait) return fail(429, `Terlalu banyak permintaan kode. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });

      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const issued = await otpIssue(email, otpHash(email, code), ip === "anon" ? "" : ip);
      if (issued.status === "cooldown") return fail(429, `Kode baru saja dikirim. Tunggu ${issued.wait} detik sebelum meminta lagi.`, { retry_after: issued.wait });
      if (issued.status === "limit") return fail(429, `Terlalu banyak kode diminta. Coba lagi dalam ${Math.ceil(issued.wait / 60)} menit.`, { retry_after: issued.wait });
      if (issued.status === "busy") return fail(429, "Pengiriman kode sedang penuh. Coba lagi beberapa menit lagi, atau masuk dengan Google.", { retry_after: issued.wait });
      try {
        await sendOtpEmail(email, code, getOrigin(req));
      } catch (e) {
        console.error("[auth/otp] email gagal dikirim:", e instanceof Error ? e.message : e);
        await otpCancel(email).catch(() => undefined);
        return fail(502, "Email kode gagal dikirim. Periksa alamatnya lalu coba lagi.", { field: "email" });
      }
      return json(200, { email, wait: issued.wait, expires_in: OTP_TTL_SEC });
    }

    if (action === "verify") {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const code = typeof body.code === "string" ? body.code.replace(/[\s-]/g, "") : "";
      if (!email) return fail(400, "Alamat email tidak valid.", { field: "email" });
      if (!/^\d{6}$/.test(code)) return fail(400, "Kode terdiri dari 6 angka. Periksa lagi email yang kami kirim.", { field: "code" });
      const wait = hit("verify", ip, 30, 10 * 60_000);
      if (wait) return fail(429, `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });

      const verdict = await otpCheck(email, otpHash(email, code));
      if (verdict === "invalid") return fail(400, "Kode salah. Periksa lagi email yang kami kirim.", { field: "code" });
      if (verdict === "expired") return fail(400, "Kode sudah kedaluwarsa. Minta kode baru.", { field: "code", resend: true });
      if (verdict === "locked") return fail(429, "Terlalu banyak kode salah. Minta kode baru.", { field: "code", resend: true });
      if (verdict !== "ok") return fail(400, "Tidak ada kode aktif untuk email ini. Minta kode baru.", { field: "code", resend: true });

      const user = await login(email, "", "", "email");
      if (user.banned) return fail(403, "Akun ini dinonaktifkan oleh pemilik situs.");
      return json(200, { user: publicUser(user), apiKey: user.api_key }, sessionCookie(user.id, secure));
    }

    // regenerate
    const id = sessionUserId(req);
    if (!id) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    const wait = hit("rotate", id, 5, 60 * 60_000);
    if (wait) return fail(429, `API key terlalu sering diganti. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });
    const before = await userById(id);
    if (!before || before.banned) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    const user = await rotateKey(id);
    if (!user) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    forgetKey(before.api_key);
    return json(200, { user: publicUser(user), apiKey: user.api_key });
  } catch (e) {
    console.error(`[auth/${action}]`, e);
    return fail(503, STORE_DOWN);
  }
}
