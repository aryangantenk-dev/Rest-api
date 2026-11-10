import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Halaman tidak ditemukan", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="grain relative isolate flex min-h-[80vh] items-center justify-center overflow-hidden px-5 pt-24 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="aurora aurora-1 left-1/2 top-1/4 h-[480px] w-[480px] -translate-x-1/2" />
        <div className="grid-lines absolute inset-0" />
      </div>
      <div>
        <p className="font-mono text-sm text-ember">HTTP 404</p>
        <h1 className="mt-4 font-display text-6xl font-semibold tracking-[-0.04em] sm:text-8xl">
          Endpoint <span className="font-serif font-normal italic text-muted">tersesat.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-muted">Halaman yang kamu cari tidak ada atau sudah dipindahkan. Kembali ke beranda atau lihat daftar endpoint yang tersedia.</p>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/" className="btn-primary rounded-full px-7 py-3.5 text-sm font-semibold">Ke beranda</Link>
          <Link href="/docs" className="btn-ghost rounded-full px-7 py-3.5 text-sm font-medium">Buka dokumentasi</Link>
        </div>
      </div>
    </section>
  );
}
