"use client";

import { useRouter } from "next/navigation";

/** Pemilih kategori untuk layar kecil: kontrol bawaan sistem, tanpa geser mendatar. */
export function CategorySelect({ options, value }: { options: { value: string; label: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="lg:hidden">
      <label htmlFor="pilih-kategori" className="block text-sm font-semibold">
        Kategori
      </label>
      <select id="pilih-kategori" value={value} onChange={(ev) => router.push(ev.target.value)} className="field mt-2 font-sans">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
