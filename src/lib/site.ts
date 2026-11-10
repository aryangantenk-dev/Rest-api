export const SITE_NAME = "Yanxz API";
export const SITE_TAGLINE = "REST API Gratis Tanpa API Key";
export const SITE_DESCRIPTION =
  "Yanxz API adalah REST API gratis tanpa API key dengan 60+ endpoint: AI chat, text to image, QR code, pemendek URL, cuaca, gempa BMKG, Al-Qur'an, jadwal sholat, kurs, dan banyak lagi. Dokumentasi lengkap dengan playground interaktif.";

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";

/** Atur NEXT_PUBLIC_SITE_URL ke domain produksi agar canonical, sitemap, dan OG benar. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || vercelUrl || "http://localhost:3000").replace(/\/$/, "");

export function getOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  if (host) return `${proto || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")}://${host}`;
  return SITE_URL;
}
