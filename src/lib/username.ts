/*
  Aturan username. Berkas ini murni (tanpa akses server), jadi dipakai bersama oleh formulir di
  browser dan pemeriksaan di server supaya pesannya selalu sama.
*/

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const USERNAME_HELP = `${USERNAME_MIN}–${USERNAME_MAX} karakter: huruf kecil, angka, atau garis bawah. Diawali huruf.`;
export const USERNAME_TAKEN = "Username ini sudah dipakai. Coba yang lain.";

/** Nama yang bisa disangka akun resmi atau bertabrakan dengan alamat di situs ini. */
const RESERVED = new Set([
  "admin", "administrator", "owner", "root", "system", "sistem", "official", "resmi", "staff", "support", "bantuan", "help",
  "moderator", "mod", "yanz", "yanzapi", "yanz_api", "yanxz", "yanxzapi", "api", "apikey", "api_key", "docs", "login", "masuk",
  "daftar", "akun", "auth", "null", "undefined", "anonymous", "anonim", "guest", "tamu", "user", "username", "test",
]);

/** Rapikan ketikan: buang spasi dan @ di depan, jadikan huruf kecil. */
export function cleanUsername(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@+/, "").toLowerCase() : "";
}

/** Pesan masalah pada username yang sudah dirapikan, atau null bila bentuknya sah. */
export function usernameProblem(name: string): string | null {
  if (!name) return "Isi username dulu.";
  if (/\s/.test(name)) return "Username tidak boleh mengandung spasi. Pakai garis bawah (_) sebagai gantinya.";
  if (!/^[a-z0-9_]+$/.test(name)) return "Username hanya boleh berisi huruf kecil, angka, dan garis bawah (_).";
  if (!/^[a-z]/.test(name)) return "Username harus diawali huruf.";
  if (name.length < USERNAME_MIN) return `Username minimal ${USERNAME_MIN} karakter.`;
  if (name.length > USERNAME_MAX) return `Username maksimal ${USERNAME_MAX} karakter.`;
  if (RESERVED.has(name)) return "Username ini tidak bisa dipakai. Pilih yang lain.";
  return null;
}
