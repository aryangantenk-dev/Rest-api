"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-client";
import { CloseIcon, LogoMark, MenuIcon, MoonIcon, SunIcon, UserIcon } from "./icons";

const links = [
  { href: "/docs", label: "Dokumentasi" },
  { href: "/#kategori", label: "Kategori" },
  { href: "/#mulai", label: "Cara pakai" },
  { href: "/#faq", label: "FAQ" },
];

/** Tombol tema: ikon diatur lewat CSS (.only-light / .only-dark), jadi tidak perlu state. */
function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Ganti tema terang atau gelap"
      title="Ganti tema"
      onClick={() => {
        const root = document.documentElement;
        const next = getComputedStyle(root).colorScheme.includes("dark") ? "light" : "dark";
        root.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* penyimpanan diblokir: tema tetap berganti untuk sesi ini */
        }
      }}
      className="grid h-11 w-11 place-items-center text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg"
    >
      <MoonIcon className="only-light" />
      <SunIcon className="only-dark" />
    </button>
  );
}

export function SiteHeader({ authEnabled = false }: { authEnabled?: boolean }) {
  const pathname = usePathname();
  // Memuat sesi sekali per halaman; hasilnya memperbarui atribut data-signed yang dipakai tombol akun.
  useAuth(authEnabled);
  // Menu seluler terikat ke halaman tempat ia dibuka, jadi otomatis tertutup saat berpindah halaman.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const on = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpenAt(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg">
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5" aria-label="yanz.api, ke beranda">
          <LogoMark className="h-7 w-7" />
          <span className="font-mono text-lg font-bold tracking-tight">
            yanz<span className="text-ok">.</span>api
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center md:flex">
          {links.map((l) => {
            const active = l.href === "/docs" && pathname.startsWith("/docs");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center px-4 text-[0.9375rem] transition-colors duration-150 ${active ? "font-semibold text-fg" : "text-muted hover:text-fg"}`}
              >
                {l.label}
                {active && <span className="absolute inset-x-4 bottom-1 h-0.5 bg-accent" aria-hidden />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Kedua tombol selalu ada; CSS menampilkan salah satunya menurut status login (lihat .only-signed),
              sehingga pilihannya sudah benar sejak halaman pertama kali digambar. Lebarnya sama. */}
          {authEnabled && (
            <>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                aria-current={pathname === "/login" ? "page" : undefined}
                // Di halaman login tombol utamanya ada di formulir, jadi tombol ini tidak ikut menonjol.
                className={`only-guest btn relative min-w-[5.75rem] px-3 ${pathname === "/login" ? "btn-secondary" : "btn-primary"}`}
              >
                Masuk
                {pathname === "/login" && <span className="absolute inset-x-0 -bottom-2 h-0.5 bg-fg" aria-hidden />}
              </Link>
              <Link href="/akun" onClick={() => setOpen(false)} aria-current={pathname === "/akun" ? "page" : undefined} className="only-signed btn btn-secondary relative min-w-[5.75rem] px-3">
                <UserIcon />
                Akun
                {pathname === "/akun" && <span className="absolute inset-x-0 -bottom-2 h-0.5 bg-fg" aria-hidden />}
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
            aria-controls="menu-seluler"
            onClick={() => setOpen(!open)}
            className="grid h-11 w-11 place-items-center border border-control text-fg transition-colors duration-150 hover:bg-subtle md:hidden"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <nav id="menu-seluler" aria-label="Navigasi seluler" data-open={open} className="panel border-t border-line bg-bg md:hidden">
        <ul className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
          {links.map((l) => (
            <li key={l.href} className="border-b border-line last:border-b-0">
              <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-base font-medium">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
