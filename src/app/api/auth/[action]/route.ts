import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { AUTH_ENABLED, HAS_EMAIL, HAS_GOOGLE, KEY_REQUIRED, OTP_TTL_SEC } from "@/lib/auth/config";
import { forgetKey } from "@/lib/auth/apikey";
import { hit } from "@/lib/auth/limit";
import { sendOtpEmail } from "@/lib/auth/mail";
import { clearSessionCookie, isSecure, otpHash, sessionCookie, sessionUserId } from "@/lib/auth/session";
import { login, normalizeEmail, otpCancel, otpCheck, otpIssue, rotateKey, sessionBody, setPhoto, setUsername, userById, usernameTaken, type User } from "@/lib/auth/users";
import { clientIp } from "@/lib/guard";
import { AVATAR_DIR, MAX_AVATAR_BYTES, hasImageStore, removeImages, saveImage, sniffImage } from "@/lib/images";
import { USERNAME_TAKEN, cleanUsername, usernameProblem } from "@/lib/username";
import { SITE_CREATOR, getOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rute login untuk halaman /login dan /akun (bukan bagian dari API publik).
 *   GET  /api/auth/me          sesi saat ini beserta API key pemiliknya
 *   POST /api/auth/otp         { email, username? }        kirim kode 6 digit ke email
 *   POST /api/auth/verify      { email, code, username? }  tukar kode dengan sesi
 *   POST /api/auth/check       { username }     apakah username masih tersedia
 *   POST /api/auth/username    { username }     isi atau ganti username
 *   POST /api/auth/photo       isi permintaan = berkas gambar; atur foto profil
 *   POST /api/auth/unphoto     hapus foto profil
 *   POST /api/auth/regenerate  ganti API key
 *   POST /api/auth/logout      akhiri sesi
 * `username` pada otp/verify dikirim halaman /daftar; halaman /login tidak mengirimnya.
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
    return json(200, { ...sessionBody(user), ...base });
  } catch (e) {
    console.error("[auth/me]", e);
    return fail(503, STORE_DOWN, base);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!["otp", "verify", "check", "username", "photo", "unphoto", "regenerate", "logout"].includes(action)) return fail(404, "Aksi tidak dikenal.");
  if (!sameSite(req)) return fail(403, "Permintaan ini hanya bisa dikirim dari halaman situs ini.");
  const secure = isSecure(req);
  if (action === "logout") return json(200, { user: null }, clearSessionCookie(secure));
  if (!AUTH_ENABLED) return fail(503, "Login belum diaktifkan di server ini.");

  const ip = clientIp(req);
  try {
    if (action === "otp") {
      if (!HAS_EMAIL) return fail(503, "Login lewat email belum diaktifkan di server ini.");
      const body = await readBody(req);
      // Pendaftaran: tolak username yang tidak sah atau sudah dipakai sebelum kode dikirim.
      if (body.username !== undefined) {
        const name = cleanUsername(body.username);
        const problem = usernameProblem(name);
        if (problem) return fail(400, problem, { field: "username" });
        if (await usernameTaken(name)) return fail(409, USERNAME_TAKEN, { field: "username" });
      }
      const email = normalizeEmail(body.email);
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

      let user = await login(email, "", "", "email");
      if (user.banned) return fail(403, "Akun ini dinonaktifkan oleh pemilik situs.");
      // Username dari formulir daftar. Bila ternyata sudah diambil orang lain atau akunnya sudah
      // punya username, biarkan saja: akun tanpa username diminta memilih lagi setelah masuk.
      const wanted = cleanUsername(body.username);
      if (!user.username && wanted && !usernameProblem(wanted)) {
        const set = await setUsername(user.id, wanted);
        if (set.status === "ok") user = set.user;
      }
      return json(200, sessionBody(user), sessionCookie(user.id, secure));
    }

    if (action === "check") {
      const wait = hit("check", ip, 90, 10 * 60_000);
      if (wait) return fail(429, "Terlalu banyak pemeriksaan. Coba lagi beberapa menit lagi.", { retry_after: wait });
      const name = cleanUsername((await readBody(req)).username);
      const problem = usernameProblem(name);
      if (problem) return json(200, { username: name, available: false, error: problem });
      const self = sessionUserId(req);
      const mine = self ? (await userById(self))?.username === name : false;
      const taken = !mine && (await usernameTaken(name));
      return json(200, { username: name, available: !taken, ...(taken ? { error: USERNAME_TAKEN } : {}) });
    }

    const id = sessionUserId(req);
    const expired = (what: string) => fail(401, `Sesi berakhir. Masuk lagi untuk ${what}.`);

    if (action === "username") {
      if (!id) return expired("mengisi username");
      const name = cleanUsername((await readBody(req)).username);
      const problem = usernameProblem(name);
      if (problem) return fail(400, problem, { field: "username" });
      const before = await userById(id);
      if (!before || before.banned) return expired("mengisi username");
      if (before.username === name) return json(200, sessionBody(before));
      const wait = hit("username", id, 10, 60 * 60_000);
      if (wait) return fail(429, `Username terlalu sering diganti. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });
      const set = await setUsername(id, name);
      if (set.status === "taken") return fail(409, USERNAME_TAKEN, { field: "username" });
      if (set.status === "invalid") return fail(400, "Username ini tidak bisa dipakai. Pilih yang lain.", { field: "username" });
      if (set.status !== "ok") return expired("mengisi username");
      return json(200, sessionBody(set.user));
    }

    if (action === "photo" || action === "unphoto") {
      if (!id) return expired("mengatur foto profil");
      const owner = await userById(id);
      if (!owner || owner.banned) return expired("mengatur foto profil");
      let name = "";
      if (action === "photo") {
        if (!hasImageStore()) return fail(503, "Penyimpanan foto belum diaktifkan di server ini.");
        if (Number(req.headers.get("content-length")) > MAX_AVATAR_BYTES) return fail(413, "Foto terlalu besar. Pilih gambar lain.");
        const buf = new Uint8Array(await req.arrayBuffer());
        if (buf.length > MAX_AVATAR_BYTES) return fail(413, "Foto terlalu besar. Pilih gambar lain.");
        const ext = sniffImage(buf);
        if (!ext || ext === "gif") return fail(415, "Berkas ini bukan gambar PNG, JPG, atau WebP.");
        const wait = hit("photo", id, 12, 60 * 60_000);
        if (wait) return fail(429, `Foto terlalu sering diganti. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });
        try {
          name = await saveImage(buf, ext, AVATAR_DIR);
        } catch (e) {
          console.error("[auth/photo] unggah gagal:", e instanceof Error ? e.message : e);
          return fail(502, "Foto gagal disimpan karena penyimpanan sedang bermasalah. Coba lagi sebentar lagi.");
        }
      }
      const drop = (file: string) => removeImages([`${AVATAR_DIR}${file}`]).then(() => undefined, () => undefined);
      let saved: { old: string; user: User } | null;
      try {
        saved = await setPhoto(id, name);
      } catch (e) {
        if (name) await drop(name);
        throw e;
      }
      if (!saved) {
        if (name) await drop(name);
        return expired("mengatur foto profil");
      }
      if (saved.old && saved.old !== name) await drop(saved.old);
      return json(200, sessionBody(saved.user));
    }

    // regenerate
    if (!id) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    const wait = hit("rotate", id, 5, 60 * 60_000);
    if (wait) return fail(429, `API key terlalu sering diganti. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retry_after: wait });
    const before = await userById(id);
    if (!before || before.banned) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    if (!before.username) return fail(403, "Isi username dulu di halaman Akun sebelum mengganti API key.");
    const user = await rotateKey(id);
    if (!user) return fail(401, "Sesi berakhir. Masuk lagi untuk mengganti API key.");
    forgetKey(before.api_key);
    return json(200, sessionBody(user));
  } catch (e) {
    console.error(`[auth/${action}]`, e);
    return fail(503, STORE_DOWN);
  }
}
