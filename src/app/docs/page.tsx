import type { Metadata } from "next";
import { DocsShell } from "@/components/docs-shell";
import { allMeta } from "@/lib/api/registry";
import { SITE_NAME, SITE_PITCH, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Dokumentasi REST API Lengkap dengan Playground",
  description:
    "Dokumentasi seluruh endpoint yanz.api: AI, tools, text, image, canvas, random, search, downloader, games, islami, informasi, komik, anime, dan film. Coba langsung di browser dan salin kode cURL, JavaScript, Python, PHP." + ` REST API ${SITE_PITCH}.`,
  alternates: { canonical: "/docs" },
  openGraph: { url: "/docs", title: "Dokumentasi REST API yanz.api", description: "Semua endpoint, parameter, dan playground interaktif." },
};

export default function DocsPage() {
  const list = allMeta();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: `Dokumentasi ${SITE_NAME}`,
        url: `${SITE_URL}/docs`,
        inLanguage: "id-ID",
        about: `REST API ${SITE_PITCH}`,
      },
      {
        "@type": "ItemList",
        name: `Daftar endpoint ${SITE_NAME}`,
        numberOfItems: list.length,
        itemListElement: list.map((e, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: e.title,
          url: `${SITE_URL}/docs/${e.category}#${e.category}-${e.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Dokumentasi", item: `${SITE_URL}/docs` },
        ],
      },
    ],
  };
  return (
    <>
      <DocsShell />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
