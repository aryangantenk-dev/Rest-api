import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsShell } from "@/components/docs-shell";
import { categories, categoryById } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import type { CategoryId } from "@/lib/api/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const c = categoryById[category as CategoryId];
  if (!c) return {};
  const count = allMeta().filter((e) => e.category === c.id).length;
  return {
    title: c.seoTitle,
    description: `${c.description} ${count} endpoint, gratis tanpa API key, lengkap dengan playground dan contoh kode.`,
    alternates: { canonical: `/docs/${c.id}` },
    openGraph: { url: `/docs/${c.id}`, title: `${c.seoTitle} | ${SITE_NAME}`, description: c.description },
  };
}

export default async function CategoryDocs({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = categoryById[category as CategoryId];
  if (!c) notFound();
  const list = allMeta().filter((e) => e.category === c.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Dokumentasi", item: `${SITE_URL}/docs` },
          { "@type": "ListItem", position: 3, name: c.name, item: `${SITE_URL}/docs/${c.id}` },
        ],
      },
      {
        "@type": "ItemList",
        name: `Endpoint ${c.name}`,
        numberOfItems: list.length,
        itemListElement: list.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.title, url: `${SITE_URL}/docs/${c.id}#${c.id}-${e.slug}` })),
      },
    ],
  };

  return (
    <>
      <DocsShell active={c.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
