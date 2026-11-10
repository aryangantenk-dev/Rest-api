import Link from "next/link";
import { categories } from "@/lib/api/categories";
import { LogoMark } from "./icons";

export function SiteFooter({ total }: { total: number }) {
  return (
    <footer className="relative mt-20 border-t border-line sm:mt-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-12 sm:gap-12 sm:px-8 sm:py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Yanxz API">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-lg font-semibold tracking-tight">
              yanxz<span className="text-ember">.</span>api
            </span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
            REST API gratis tanpa API key untuk developer, pelajar, dan pembuat bot. {total} endpoint, respons JSON konsisten, dan CORS terbuka.
          </p>
        </div>

        <nav aria-label="Kategori API">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">Kategori</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/docs/${c.id}`} className="text-muted transition-colors hover:text-fg">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Tautan">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">Sumber</h2>
          <ul className="mt-5 space-y-3 text-sm">
            <li><Link href="/docs" className="text-muted transition-colors hover:text-fg">Dokumentasi lengkap</Link></li>
            <li><a href="/api" className="text-muted transition-colors hover:text-fg">Indeks endpoint (JSON)</a></li>
            <li><Link href="/#mulai" className="text-muted transition-colors hover:text-fg">Cara pakai</Link></li>
            <li><Link href="/#faq" className="text-muted transition-colors hover:text-fg">Pertanyaan umum</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Yanxz API. Dibuat dengan teliti di Indonesia.</p>
          <p className="font-mono">Batas wajar: 120 permintaan / menit / IP</p>
        </div>
      </div>
    </footer>
  );
}
