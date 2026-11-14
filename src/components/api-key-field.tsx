"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setManualKey, useAuth } from "./auth-client";
import { CopyButton } from "./client-utils";
import { KeyIcon } from "./icons";

/**
 * Kolom API key di dokumentasi. Terisi otomatis dari akun yang sedang masuk; pengunjung yang
 * belum masuk bisa menempel API key miliknya. Nilainya dipakai semua kartu endpoint di halaman.
 */
export function ApiKeyField() {
  const auth = useAuth();
  const pathname = usePathname();
  const [touched, setTouched] = useState(false);

  const loading = auth.status === "loading";
  const signedIn = !!auth.user && !!auth.apiKey;
  const value = signedIn ? (auth.apiKey ?? "") : auth.manualKey;
  const invalid = !signedIn && touched && !!value && !/^yn-[0-9A-Za-z._-]{20,64}$/.test(value);
  const guestHelp = "Wajib untuk setiap permintaan. Masuk untuk mendapat API key gratis dan kolom ini terisi otomatis, atau tempel API key yang sudah kamu punya.";
  const help = signedIn
    ? `Terisi otomatis dari akun ${auth.user?.username ? `@${auth.user.username}` : auth.user?.email}. Dipakai untuk semua permintaan dan contoh kode di halaman ini.`
    : auth.user && auth.needsUsername
      ? "Akunmu belum punya username. Buka Kelola akun untuk mengisinya; setelah itu API key kamu tampil di sini."
      : guestHelp;

  return (
    <section aria-labelledby="docs-apikey-label" className="border border-control bg-card p-4" aria-busy={loading}>
      <label id="docs-apikey-label" htmlFor="docs-apikey" className="flex items-center gap-2 font-mono text-sm font-bold">
        <KeyIcon className="text-ok" />
        API key
        {signedIn && <span className="border border-ok px-1.5 font-sans text-xs font-semibold text-ok">terisi otomatis</span>}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className={`flex min-w-0 flex-1 items-stretch border bg-bg focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${invalid ? "border-danger" : "border-control"}`}>
          <input
            id="docs-apikey"
            name="apikey"
            value={value}
            onChange={(ev) => setManualKey(ev.target.value)}
            onBlur={() => setTouched(true)}
            readOnly={signedIn}
            disabled={loading}
            aria-invalid={invalid}
            aria-describedby={invalid ? "docs-apikey-error" : "docs-apikey-help"}
            placeholder={loading ? "Memuat…" : "yn-…"}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            className="ring-on-parent min-h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-base text-fg placeholder:text-muted"
          />
          {value && <CopyButton text={value} />}
        </div>
        {/* Salah satu saja yang tampil, dipilih CSS menurut status login (lihat .only-signed). */}
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="only-guest btn btn-primary shrink-0">
          Masuk
        </Link>
        <Link href="/akun" className="only-signed btn btn-secondary shrink-0">
          Kelola akun
        </Link>
      </div>
      {/* Galat dan teks bantuan berbagi tempat yang sama agar isi halaman di bawahnya tidak bergeser. */}
      <div className="mt-2 grid text-sm">
        <p id="docs-apikey-help" className={`wrap-anywhere col-start-1 row-start-1 text-muted ${invalid ? "invisible" : ""}`}>
          {help}
        </p>
        {/* Memesan tinggi teks terpanjang supaya tinggi kotak sama sebelum dan sesudah sesi dimuat. */}
        <p aria-hidden className="invisible col-start-1 row-start-1">
          {guestHelp}
        </p>
        {invalid && (
          <p id="docs-apikey-error" role="alert" className="col-start-1 row-start-1 font-medium text-danger">
            Bentuk API key tidak dikenali. API key selalu diawali yn- dan tidak mengandung spasi. Salin lagi dari halaman Akun.
          </p>
        )}
      </div>
    </section>
  );
}
