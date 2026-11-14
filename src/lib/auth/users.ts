import { supabaseRpc } from "@/db/store";
import { OTP_COOLDOWN_SEC, OTP_MAX_ATTEMPTS, OTP_MAX_PER_EMAIL, OTP_MAX_PER_IP, OTP_MAX_SITE, OTP_TTL_SEC } from "./config";
import { newApiKey } from "./keys";

/* Akses data akun. Semua lewat fungsi Postgres di supabase/schema.sql (bagian "Akun pengguna"). */

export type User = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  /** Kosong selama belum dipilih. Akun tanpa username belum bisa dipakai. */
  username: string;
  /** Nama berkas foto profil di penyimpanan; kosong berarti memakai gambar pengganti. */
  photo: string;
  provider: "google" | "email";
  api_key: string;
  banned: boolean;
  created_at: string;
  last_login_at: string;
};

/** Bentuk akun yang boleh dikirim ke browser pemiliknya. */
export function publicUser(u: User) {
  return { email: u.email, name: u.name, username: u.username, photo: u.photo ? `/avatar/${u.photo}` : "", provider: u.provider, created_at: u.created_at };
}

/**
 * Isi jawaban untuk browser pemilik akun. API key baru diberikan setelah username diisi:
 * username wajib, jadi akun tanpa username diarahkan melengkapinya dulu.
 */
export function sessionBody(u: User) {
  return { user: publicUser(u), apiKey: u.username ? u.api_key : null, needsUsername: !u.username };
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z0-9-]{2,}$/.test(email) ? email : null;
}

/** Masuk atau daftar. Akun baru langsung mendapat API key. */
export function login(email: string, name: string, avatar: string, provider: User["provider"]): Promise<User> {
  return supabaseRpc<User>("auth_login", { p_email: email, p_name: name.slice(0, 80), p_avatar: avatar.slice(0, 500), p_provider: provider, p_key: newApiKey() });
}

export function userById(id: string): Promise<User | null> {
  return supabaseRpc<User | null>("auth_user", { p_id: id });
}

export function keyOwner(key: string): Promise<{ id: string; banned: boolean } | null> {
  return supabaseRpc<{ id: string; banned: boolean } | null>("auth_key_user", { p_key: key });
}

export function rotateKey(id: string): Promise<User | null> {
  return supabaseRpc<User | null>("auth_rotate_key", { p_id: id, p_key: newApiKey() });
}

export function usernameTaken(username: string): Promise<boolean> {
  return supabaseRpc<boolean>("auth_username_taken", { p_username: username });
}

export type SetUsername = { status: "ok"; user: User } | { status: "taken" | "invalid" | "none" };

export function setUsername(id: string, username: string): Promise<SetUsername> {
  return supabaseRpc<SetUsername>("auth_set_username", { p_id: id, p_username: username });
}

/** Simpan nama berkas foto profil ("" untuk menghapus). `old` adalah berkas sebelumnya. */
export function setPhoto(id: string, photo: string): Promise<{ old: string; user: User } | null> {
  return supabaseRpc<{ old: string; user: User } | null>("auth_set_photo", { p_id: id, p_photo: photo });
}

export type OtpIssue = { status: "sent" | "cooldown" | "limit" | "busy"; wait: number };

export function otpIssue(email: string, hash: string, ip: string): Promise<OtpIssue> {
  return supabaseRpc<OtpIssue>("auth_otp_issue", {
    p_email: email, p_hash: hash, p_ip: ip, p_ttl: OTP_TTL_SEC, p_cooldown: OTP_COOLDOWN_SEC,
    p_max_email: OTP_MAX_PER_EMAIL, p_max_ip: OTP_MAX_PER_IP, p_max_site: OTP_MAX_SITE,
  });
}

export type OtpCheck = "ok" | "invalid" | "expired" | "locked" | "none";

export function otpCheck(email: string, hash: string): Promise<OtpCheck> {
  return supabaseRpc<OtpCheck>("auth_otp_check", { p_email: email, p_hash: hash, p_max_attempts: OTP_MAX_ATTEMPTS });
}

export async function otpCancel(email: string): Promise<void> {
  await supabaseRpc("auth_otp_cancel", { p_email: email });
}

export type AdminUsers = { total: number; users: { email: string; username: string; name: string; provider: string; banned: boolean; created_at: string; last_login_at: string; api_key: string }[] };

export function adminUsers(limit: number): Promise<AdminUsers> {
  return supabaseRpc<AdminUsers>("auth_admin_users", { p_limit: limit });
}

export function setBanned(email: string, banned: boolean): Promise<boolean> {
  return supabaseRpc<boolean>("auth_set_banned", { p_email: email, p_banned: banned });
}
