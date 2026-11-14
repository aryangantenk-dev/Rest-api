import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { AUTH_ENABLED, KEY_REQUIRED } from "@/lib/auth/config";
import { SiteFooter } from "@/components/site-footer";
import { endpoints } from "@/lib/api/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Font disimpan di repo (lisensi OFL-1.1) supaya build tidak bergantung pada jaringan
// dan ruang hurufnya sudah dipesan sejak awal (tanpa pergeseran tata letak).
const body = localFont({
  src: "./fonts/ibm-plex-sans-latin-wght-normal.woff2",
  variable: "--font-body",
  weight: "100 700",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
});
const code = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-code",
  weight: "100 800",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "yanz api", "yanz.api", "rest api gratis", ...(KEY_REQUIRED ? ["api key gratis"] : ["api tanpa apikey", "no api key"]), "free rest api indonesia", "api downloader", "api ai chat gratis",
    "api cuaca", "api gempa bmkg", "api jadwal sholat", "api al-quran", "qr code api", "short url api", "api random quotes bahasa indonesia",
    "api developer indonesia",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${SITE_NAME} — ${SITE_TAGLINE}`, description: SITE_DESCRIPTION },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

// Dijalankan sebelum halaman digambar agar pilihan tema tersimpan tidak berkedip.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
// Menandai browser yang terakhir kali dalam keadaan masuk, sebelum halaman digambar (lihat .only-signed di globals.css).
const signedScript = AUTH_ENABLED ? `try{if(localStorage.getItem("yn_signed_in")==="1")document.documentElement.dataset.signed="1"}catch(e){}` : "";

export default function RootLayout({ children }: { children: ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "id-ID",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon`,
      },
    ],
  };

  return (
    <html lang="id" className={`${body.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + signedScript }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <a href="#konten" className="btn btn-primary fixed left-4 top-2 z-[100] -translate-y-24 focus:translate-y-0">
          Lewati ke konten
        </a>
        <SiteHeader authEnabled={AUTH_ENABLED} />
        <main id="konten" tabIndex={-1} className="flex-1 pt-[var(--header-h)] outline-none">
          {children}
        </main>
        <SiteFooter total={endpoints.length} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
