"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronIcon } from "./icons";

export type CategoryMenuItem = { href: string; name: string; count: number };

/**
 * Menu filter kategori: daftar vertikal dengan penanda radio, mengikuti tema situs.
 *
 * Tiap baris adalah tautan ke halaman kategorinya, jadi memilih baris langsung
 * menyaring daftar endpoint, dan hanya satu kategori yang bisa aktif. Di layar
 * kecil daftarnya dilipat di balik satu tombol supaya 15 baris tidak mendorong
 * isi dokumentasi jauh ke bawah; di layar lebar daftarnya selalu terlihat.
 *
 * Pasang dengan `key={active}` agar keadaan (terbuka, pilihan sementara) kembali
 * ke awal setiap kali kategori berganti.
 */
export function CategoryMenu({ items, active }: { items: CategoryMenuItem[]; active: string }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // Pilihan langsung ditandai saat diklik, tanpa menunggu halaman tujuan selesai dimuat.
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? active;
  const current = items.find((i) => i.href === selected) ?? items[0];

  return (
    <nav aria-label="Filter kategori" className="cat-menu">
      <h2 className="cat-heading hidden lg:block">Kategori</h2>

      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} className="cat-row">
        <span className="min-w-0">
          <span className="cat-label block">Kategori</span>
          <span className="block">
            {current.name} <span className="tnum whitespace-nowrap">({current.count})</span>
          </span>
        </span>
        <ChevronIcon className="chev shrink-0" />
      </button>

      <ul id={listId} data-open={open} className="cat-list panel">
        {items.map((item) => {
          const on = item.href === selected;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.href === active ? "page" : undefined}
                data-selected={on}
                onClick={() => {
                  if (item.href === active) setOpen(false);
                  setPicked(item.href);
                }}
                className="cat-row"
              >
                <span className="min-w-0">
                  {item.name} <span className="tnum whitespace-nowrap">({item.count})</span>
                </span>
                <span className="cat-radio" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
