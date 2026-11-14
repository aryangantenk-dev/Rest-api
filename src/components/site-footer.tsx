import { SITE_PITCH } from "@/lib/site";
import Link from "next/link";
import { categories } from "@/lib/api/categories";
import { RATE_LIMIT } from "@/lib/limits";
import { LogoMark } from "./icons";

const linkClass = "inline-flex min-h-11 items-center text-muted transition-colors duration-150 hover:text-fg sm:min-h-8";

export function SiteFooter({ total }: { total: number }) {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-5">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2.5" aria-label="yanz.api, ke beranda">
            <LogoMark className="h-7 w-7" />
            <span className="font-mono text-lg font-bold tracking-tight">
              yanz<span className="text-ok">.</span>api
            </span>
          </Link>
          <p className="mt-4 max-w-[45ch] text-sm text-muted">
            {`REST API ${SITE_PITCH} untuk developer, pelajar, dan pembuat bot. ${total} endpoint, respons JSON konsisten, dan CORS terbuka.`}
          </p>
        </div>

        <nav aria-label="Kategori API" className="md:col-span-4">
          <h2 className="text-sm font-semibold">Kategori</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 text-sm">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/docs/${c.id}`} className={linkClass}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Tautan" className="md:col-span-3">
          <h2 className="text-sm font-semibold">Sumber</h2>
          <ul className="mt-3 text-sm">
            <li><Link href="/docs" className={linkClass}>Dokumentasi lengkap</Link></li>
            <li>
              {/* /api adalah route handler yang mengembalikan JSON, bukan halaman, jadi dibuka dengan navigasi biasa. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api" className={linkClass}>Indeks endpoint (JSON)</a>
            </li>
            <li><Link href="/#mulai" className={linkClass}>Cara pakai</Link></li>
            <li><Link href="/#contoh" className={linkClass}>Contoh web</Link></li>
            <li><Link href="/#faq" className={linkClass}>Pertanyaan umum</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} yanz.api</p>
          <p className="tnum">Batas {RATE_LIMIT} permintaan per menit untuk setiap IP</p>
        </div>
      </div>
    </footer>
  );
}
