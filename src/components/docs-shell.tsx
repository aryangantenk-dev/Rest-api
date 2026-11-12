import Link from "next/link";
import { categories, categoryById } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import type { CategoryId } from "@/lib/api/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { RATE_LIMIT } from "@/lib/limits";
import { CategorySelect } from "./category-select";
import { BaseUrlBox } from "./client-utils";
import { DocsExplorer } from "./docs-explorer";
import { CategoryIcon } from "./icons";

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

  const navItem = (on: boolean) =>
    `relative flex min-h-10 items-center gap-3 px-3 text-[0.9375rem] transition-colors duration-150 ${on ? "bg-subtle font-semibold text-fg" : "text-muted hover:bg-subtle hover:text-fg"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        {/* navigasi kategori: daftar di layar lebar, pemilih bawaan di layar kecil */}
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:self-start lg:overflow-y-auto">
          <CategorySelect
            value={active ? `/docs/${active}` : "/docs"}
            options={[{ value: "/docs", label: `Semua endpoint (${all.length})` }, ...categories.map((c) => ({ value: `/docs/${c.id}`, label: `${c.name} (${count(c.id)})` }))]}
          />
          <nav aria-label="Kategori dokumentasi" className="hidden lg:block">
            <h2 className="px-3 text-sm font-semibold">Kategori</h2>
            <ul className="mt-2">
              <li>
                <Link href="/docs" aria-current={!active ? "page" : undefined} className={navItem(!active)}>
                  {!active && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
                  <span className="flex-1">Semua endpoint</span>
                  <span className="tnum font-mono text-sm font-normal text-muted">{all.length}</span>
                </Link>
              </li>
              {categories.map((c) => {
                const on = active === c.id;
                return (
                  <li key={c.id}>
                    <Link href={`/docs/${c.id}`} aria-current={on ? "page" : undefined} className={navItem(on)}>
                      {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
                      <CategoryIcon id={c.id} className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{c.name}</span>
                      <span className="tnum font-mono text-sm font-normal text-muted">{count(c.id)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
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
