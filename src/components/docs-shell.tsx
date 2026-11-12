import Link from "next/link";
import { categories, categoryById } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import type { CategoryId } from "@/lib/api/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { RATE_LIMIT } from "@/lib/limits";
import { CategoryMenu } from "./category-menu";
import { BaseUrlBox } from "./client-utils";
import { DocsExplorer } from "./docs-explorer";

const facts = [
  ["Metode", "GET"],
  ["Autentikasi", "Tidak ada"],
  ["Format", "JSON / PNG"],
  ["Batas", `${RATE_LIMIT} / menit / IP`],
] as const;

export function DocsShell({ active }: { active?: CategoryId }) {
  const all = allMeta();
  const list = active ? all.filter((e) => e.category === active) : all;
  const cats = active ? categories.filter((c) => c.id === active) : categories;
  const current = active ? categoryById[active] : null;
  const count = (id: CategoryId) => all.filter((e) => e.category === id).length;

  const menu = [
    { href: "/docs", name: "Semua endpoint", count: all.length },
    ...categories.map((c) => ({ href: `/docs/${c.id}`, name: c.name, count: count(c.id) })),
  ];
  const activeHref = active ? `/docs/${active}` : "/docs";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
        {/* menu filter kategori: selalu terlihat di layar lebar, dilipat di layar kecil */}
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:self-start lg:overflow-y-auto">
          <CategoryMenu key={activeHref} items={menu} active={activeHref} />
        </aside>

        {/* konten */}
        <div className="min-w-0">
          <header>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <li>
                  <Link href="/" className="link">Beranda</Link>
                </li>
                <li aria-hidden>/</li>
                <li>
                  {current ? (
                    <Link href="/docs" className="link">Dokumentasi</Link>
                  ) : (
                    <span aria-current="page" className="text-fg">Dokumentasi</span>
                  )}
                </li>
                {current && (
                  <>
                    <li aria-hidden>/</li>
                    <li>
                      <span aria-current="page" className="text-fg">{current.name}</span>
                    </li>
                  </>
                )}
              </ol>
            </nav>
            <h1 className="mt-4 font-mono text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.5rem]">{current ? `API ${current.name}` : "Dokumentasi API"}</h1>
            <p className="mt-4 max-w-[65ch] text-lg text-muted">
              {current
                ? current.description
                : `Semua endpoint ${SITE_NAME} ada di halaman ini. Buka satu endpoint untuk mengisi parameter, mengirim permintaan dari browser, dan menyalin contoh kodenya.`}
            </p>
            <div className="mt-6">
              <BaseUrlBox fallback={SITE_URL} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="tnum mt-0.5 font-mono text-sm font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </header>

          <div className="mt-6">
            <DocsExplorer endpoints={list} categories={cats} fallback={SITE_URL} showGroupHeadings={!active} />
          </div>
        </div>
      </div>
    </div>
  );
}
