"use client";

import { useState } from "react";
import { UserIcon } from "./icons";

/**
 * Foto profil. Bila belum diatur (atau berkasnya gagal dimuat), tampil gambar pengganti:
 * huruf pertama username di atas kotak netral. Ukuran diatur lewat `className` (mis. "h-20 w-20 text-3xl").
 * Dekoratif: nama akun selalu tertulis di sebelahnya, jadi tidak dibacakan pembaca layar.
 */
export function Avatar({ photo, name, className = "h-20 w-20 text-3xl" }: { photo: string; name: string; className?: string }) {
  // Catat alamat yang gagal, supaya foto baru (alamat berbeda) dicoba lagi.
  const [broken, setBroken] = useState("");
  const initial = name.trim().charAt(0).toUpperCase();

  if (photo && broken !== photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- berkas kecil (256 px) dari situs ini sendiri; tidak perlu pengoptimal gambar.
      <img src={photo} alt="" width={256} height={256} decoding="async" onError={() => setBroken(photo)} className={`shrink-0 border border-control bg-subtle object-cover ${className}`} />
    );
  }
  return (
    <span aria-hidden data-placeholder className={`grid shrink-0 select-none place-items-center border border-control bg-subtle font-mono font-bold leading-none text-fg ${className}`}>
      {initial || <UserIcon className="h-1/2 w-1/2 text-muted" />}
    </span>
  );
}
