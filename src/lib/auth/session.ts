import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_SECRET, SESSION_COOKIE, SESSION_DAYS } from "./config";

/*
  Sesi disimpan di cookie bertanda tangan (HMAC-SHA256 dengan AUTH_SECRET), tanpa tabel sesi.
  Isinya hanya id pengguna dan waktu kedaluwarsa; data akun selalu dibaca ulang dari database.
*/

function mac(purpose: string, data: string): string {
  return createHmac("sha256", AUTH_SECRET).update(`${purpose}\n${data}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bungkus nilai dengan tanda tangan dan batas waktu. `purpose` mencegah token satu fitur dipakai di fitur lain. */
export function seal(purpose: string, value: unknown, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ v: value, e: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

/** Kebalikan `seal`. null bila tanda tangan salah, rusak, atau sudah kedaluwarsa. */
export function unseal<T>(purpose: string, token: string | null | undefined): T | null {
  if (!token || !AUTH_SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  if (!same(token.slice(dot + 1), mac(purpose, body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { v: T; e: number };
    return typeof parsed.e === "number" && parsed.e * 1000 > Date.now() ? parsed.v : null;
  } catch {
    return null;
  }
}

/** Hash kode OTP yang disimpan di database (kodenya sendiri tidak pernah disimpan). */
export function otpHash(email: string, code: string): string {
  return mac("otp", `${email}\n${code}`);
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** Cookie hanya dikirim lewat HTTPS, kecuali saat pengembangan lokal (http://localhost). */
export function isSecure(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return proto ? proto === "https" : new URL(req.url).protocol === "https:";
}

export function cookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function sessionCookie(userId: string, secure: boolean): string {
  const ttl = SESSION_DAYS * 86_400;
  return cookie(SESSION_COOKIE, seal("session", userId, ttl), ttl, secure);
}

export function clearSessionCookie(secure: boolean): string {
  return cookie(SESSION_COOKIE, "", 0, secure);
}

/** Id pengguna dari cookie sesi, atau null bila belum masuk. */
export function sessionUserId(req: Request): string | null {
  const id = unseal<string>("session", readCookie(req, SESSION_COOKIE));
  return typeof id === "string" && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

/** Tujuan setelah masuk: hanya path di situs ini (bukan //host atau /\host). */
export function safeNext(raw: string | null | undefined, fallback = "/akun"): string {
  if (!raw || raw.length > 300 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
