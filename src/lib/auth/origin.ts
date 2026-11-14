import { getOrigin } from "@/lib/site";

/**
 * Alamat situs yang dipakai untuk login Google. Alamat balik (redirect URI) harus sama persis
 * dengan yang didaftarkan di Google, jadi bila NEXT_PUBLIC_SITE_URL diatur, alamat itulah yang
 * dipakai walau situs dibuka dari domain lain.
 */
export function authOrigin(req: Request): string {
  const fixed = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  return fixed || getOrigin(req);
}

export const googleRedirectUri = (req: Request) => `${authOrigin(req)}/auth/google/callback`;
