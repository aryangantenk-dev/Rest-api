import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Halaman tidak ditemukan", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <p className="font-mono text-sm font-bold text-danger">HTTP 404</p>
      <h1 className="mt-4 max-w-[18ch] font-mono text-[2rem] font-bold leading-tight tracking-tight sm:text-5xl">Halaman ini tidak ada.</h1>
      <p className="mt-6 max-w-[55ch] text-lg text-muted">Alamatnya salah ketik atau halamannya sudah dipindahkan. Kembali ke beranda, atau cari endpoint yang kamu butuhkan di dokumentasi.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/docs" className="btn btn-primary">Buka dokumentasi</Link>
        <Link href="/" className="btn btn-secondary">Ke beranda</Link>
      </div>
    </section>
  );
}
