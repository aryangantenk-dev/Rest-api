import Link from "next/link";
import { categories, categoryById } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import type { CategoryId } from "@/lib/api/types";
import { SITE_URL } from "@/lib/site";
import { BaseUrlBox } from "./client-utils";
import { DocsExplorer } from "./docs-explorer";
import { CategoryIcon } from "./icons";

export function DocsShell({ active }: { active?: CategoryId }) {
  const all = allMeta();
  const list = active ? all.filter((e) => e.category === active) : all;
  const cats = active ? categories.filter((c) => c.id === active) : categories;
  const current = active ? categoryById[active] : null;

  return (
    <div className="mx-auto max-w-7xl px-5 pb-10 pt-28 sm:px-8 sm:pt-36">
      <div className="grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
        {/* sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Kategori dokumentasi">
            <p className="mb-4 hidden font-mono text-[11px] uppercase tracking-[0.16em] text-dim lg:block">Kategori</p>
            <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
              <li className="shrink-0">
                <Link
                  href="/docs"
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors lg:border-transparent ${
                    !active ? "border-linestrong bg-white/[0.05] text-fg" : "border-line text-muted hover:bg-white/[0.03] hover:text-fg"
                  }`}
                >
                  <span>Semua endpoint</span>
                  <span className="font-mono text-[11px] text-dim">{all.length}</span>
                </Link>
              </li>
              {categories.map((c) => {
                const on = active === c.id;
                return (
                  <li key={c.id} className="shrink-0">
                    <Link
                      href={`/docs/${c.id}`}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors lg:border-transparent ${
                        on ? "border-linestrong bg-white/[0.05] text-fg" : "border-line text-muted hover:bg-white/[0.03] hover:text-fg"
                      }`}
                    >
                      <CategoryIcon id={c.id} className={`h-[18px] w-[18px] ${on ? "text-ember" : "text-dim"}`} />
                      <span>{c.name}</span>
                      <span className="ml-auto font-mono text-[11px] text-dim">{all.filter((e) => e.category === c.id).length}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <dl className="mt-8 hidden space-y-3 rounded-2xl border border-line p-5 text-sm lg:block">
            {[
              ["Metode", "GET"],
              ["Autentikasi", "Tidak ada"],
              ["Format", "JSON / PNG"],
              ["Batas", "120 / menit"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-dim">{k}</dt>
                <dd className="font-mono text-xs text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>

        {/* konten */}
        <div className="min-w-0">
          <header className="fade-up">
            <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 font-mono text-xs text-dim">
              <Link href="/" className="hover:text-fg">Beranda</Link>
              <span>/</span>
              <Link href="/docs" className={active ? "hover:text-fg" : "text-muted"}>Docs</Link>
              {current && (
                <>
                  <span>/</span>
                  <span className="text-muted">{current.name}</span>
                </>
              )}
            </nav>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              {current ? (
                <>
                  API <span className="font-serif font-normal italic text-ember-gradient">{current.name}</span>
                </>
              ) : (
                <>
                  Dokumentasi <span className="font-serif font-normal italic text-ember-gradient">API</span>
                </>
              )}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {current
                ? current.description
                : "Jelajahi seluruh endpoint Yanxz API. Buka salah satu kartu untuk mencoba permintaan langsung dari browser dan menyalin kode siap pakai."}
            </p>
            <div className="mt-7">
              <BaseUrlBox fallback={SITE_URL} />
            </div>
          </header>

          <div className="mt-10">
            <DocsExplorer endpoints={list} categories={cats} fallback={SITE_URL} showGroupHeadings={!active} />
          </div>
        </div>
      </div>
    </div>
  );
}
