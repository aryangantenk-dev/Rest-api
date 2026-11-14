/**
 * Konfigurasi login dan API key. Hanya membaca variabel lingkungan, jadi aman di-import
 * dari mana saja di sisi server (jangan dipakai di komponen "use client": di sana semua
 * nilainya kosong).
 *
 * Login butuh:
 *   - Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) untuk menyimpan akun,
 *   - AUTH_SECRET (kunci acak, min. 32 karakter) untuk menandatangani sesi dan kode OTP,
 *   - minimal satu cara masuk: Google (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) atau
 *     email (SMTP_USER + SMTP_PASS).
 */
const env = (name: string) => (process.env[name] || "").trim();

const hasSupabase = !!(env("SUPABASE_URL") && (env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY")));

export const AUTH_SECRET = env("AUTH_SECRET");
const hasSecret = AUTH_SECRET.length >= 32;

export const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");

export const SMTP = {
  host: env("SMTP_HOST") || "smtp.gmail.com",
  port: Number(env("SMTP_PORT")) || 465,
  user: env("SMTP_USER"),
  pass: env("SMTP_PASS"),
  /** Alamat pengirim. Default: SMTP_USER. */
  from: env("MAIL_FROM") || env("SMTP_USER"),
};

/** Akun bisa disimpan dan sesi bisa ditandatangani. */
export const AUTH_BASE_READY = hasSupabase && hasSecret;
export const HAS_GOOGLE = AUTH_BASE_READY && !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const HAS_EMAIL = AUTH_BASE_READY && !!(SMTP.user && SMTP.pass);
/** Minimal satu cara masuk sudah dikonfigurasi. */
export const AUTH_ENABLED = HAS_GOOGLE || HAS_EMAIL;

/**
 * Apakah endpoint menolak permintaan tanpa API key.
 *
 * Otomatis aktif begitu login bisa dipakai: tanpa login tidak ada cara mendapat API key,
 * jadi mewajibkannya lebih awal hanya akan mematikan seluruh API.
 * REQUIRE_API_KEY=0 mematikannya (mis. saat darurat); nilai lain tidak bisa memaksanya
 * aktif tanpa login.
 */
export const KEY_REQUIRED = AUTH_ENABLED && !/^(0|false|off|no)$/i.test(env("REQUIRE_API_KEY"));

export const OTP_TTL_SEC = 10 * 60;
export const OTP_COOLDOWN_SEC = 60;
export const OTP_MAX_ATTEMPTS = 5;
/** Batas kirim kode per jam: per alamat email, per IP, dan untuk seluruh situs. */
export const OTP_MAX_PER_EMAIL = 5;
export const OTP_MAX_PER_IP = 10;
export const OTP_MAX_SITE = Math.min(2000, Math.max(10, Number(env("OTP_MAX_PER_HOUR")) || 100));

export const SESSION_COOKIE = "yn_session";
export const SESSION_DAYS = 30;
