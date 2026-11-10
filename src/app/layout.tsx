import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { endpoints } from "@/lib/api/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import "./globals.css";

const head = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-head", display: "swap" });
const body = Geist({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const code = Geist_Mono({ subsets: ["latin"], variable: "--font-code", display: "swap" });
const accent = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-accent", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "yanxz api", "rest api gratis", "api tanpa apikey", "free rest api indonesia", "api downloader", "api ai chat gratis",
    "api cuaca", "api gempa bmkg", "api jadwal sholat", "api al-quran", "qr code api", "short url api", "api random quotes bahasa indonesia",
    "api developer indonesia", "no api key",
  ],
  authors: [{ name: "Yanxz" }],
  creator: "Yanxz",
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
  themeColor: "#0b0a09",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

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
    <html lang="id" className={`${head.variable} ${body.variable} ${code.variable} ${accent.variable}`}>
      <body className="min-h-screen font-sans">
        <a href="#konten" className="fixed left-4 top-4 z-[60] -translate-y-20 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg focus:translate-y-0">
          Lewati ke konten
        </a>
        <SiteHeader />
        <main id="konten">{children}</main>
        <SiteFooter total={endpoints.length} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
