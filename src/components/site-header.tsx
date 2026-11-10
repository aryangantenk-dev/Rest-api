"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "./icons";

const links = [
  { href: "/#kategori", label: "Kategori" },
  { href: "/#mulai", label: "Cara Pakai" },
  { href: "/docs", label: "Dokumentasi" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // Menu seluler terikat ke halaman tempat ia dibuka, jadi otomatis tertutup saat berpindah halaman.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled || open ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent"}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between px-5 transition-all duration-500 sm:px-8 ${scrolled ? "h-14" : "h-[72px]"}`}>
        <Link href="/" onClick={() => setOpen(false)} className="group flex items-center gap-2.5" aria-label="Yanxz API — beranda">
          <LogoMark className="h-8 w-8 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110" />
          <span className="font-display text-lg font-semibold tracking-tight">
            yanxz<span className="text-ember">.</span>api
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === "/docs" && pathname.startsWith("/docs");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-full px-4 py-2 text-sm transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                {l.label}
                {active && <span className="absolute inset-x-4 -bottom-0.5 h-px bg-ember" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-muted lg:flex">
            <span className="live-dot" /> operasional
          </span>
          <Link href="/docs" onClick={() => setOpen(false)} className="btn-primary hidden rounded-full px-5 py-2 text-sm font-semibold sm:inline-block">
            Coba sekarang
          </Link>
          <button
            type="button"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="relative h-10 w-10 rounded-full border border-line md:hidden"
          >
            <span className={`absolute left-1/2 top-[15px] h-px w-4 -translate-x-1/2 bg-fg transition-transform duration-300 ${open ? "translate-y-[4px] rotate-45" : ""}`} />
            <span className={`absolute left-1/2 top-[24px] h-px w-4 -translate-x-1/2 bg-fg transition-transform duration-300 ${open ? "-translate-y-[5px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      <div className={`grid transition-all duration-500 md:hidden ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <nav aria-label="Navigasi seluler" className="overflow-hidden" inert={!open}>
          <div className="flex flex-col gap-1 px-5 pb-6 pt-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-display text-2xl tracking-tight text-fg/90 hover:bg-white/5">
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
