"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { refreshAuth, setSession, signOut, useAuth, type AuthUser } from "./auth-client";
import { CopyButton, useOrigin } from "./client-utils";
import { ArrowIcon, EyeIcon, EyeOffIcon, LogoutIcon, RefreshIcon } from "./icons";

const mask = (key: string) => `${key.slice(0, 3)}${"•".repeat(12)}${key.slice(-4)}`;

export function AccountPanel({ fallback }: { fallback: string }) {
  const router = useRouter();
  const origin = useOrigin(fallback);
  const auth = useAuth();
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"rotate" | "logout" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const rotateRef = useRef<HTMLButtonElement>(null);

  const signedOut = auth.status === "ready" && !auth.user;
  useEffect(() => {
    if (signedOut) router.replace("/login?next=/akun");
  }, [signedOut, router]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (auth.status === "error" && !auth.user) {
    return (
      <div className="border border-line bg-card p-5 sm:p-8">
        <h1 className="font-mono text-2xl font-bold tracking-tight">Akun belum bisa dimuat</h1>
        <p role="alert" className="mt-3 text-muted">
          Server akun sedang tidak dapat dihubungi. Periksa koneksimu, lalu coba lagi.
        </p>
        <button type="button" onClick={() => void refreshAuth()} className="btn btn-primary mt-6 w-full sm:w-auto">
          Coba lagi
        </button>
      </div>
    );
  }

  if (!auth.user || !auth.apiKey) {
    return (
      <div className="border border-line bg-card p-5 sm:p-8" aria-busy="true">
        <p className="sr-only" role="status">
          {signedOut ? "Mengalihkan ke halaman masuk" : "Memuat akun"}
        </p>
        <div className="space-y-4" aria-hidden>
          <div className="h-8 w-40 animate-pulse bg-subtle" />
          <div className="h-5 w-64 max-w-full animate-pulse bg-subtle" />
          <div className="h-12 animate-pulse bg-subtle" />
          <div className="h-12 animate-pulse bg-subtle" />
          <div className="h-11 w-48 animate-pulse bg-subtle" />
        </div>
      </div>
    );
  }

  const user = auth.user;
  const key = auth.apiKey;
  const exampleReal = `${origin}/api/random/quote?apikey=${key}`;
  const exampleShown = `${origin}/api/random/quote?apikey=${shown ? key : mask(key)}`;
  const joined = new Date(user.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  async function rotate() {
    setBusy("rotate");
    setMessage(null);
    try {
      const r = await fetch("/api/auth/regenerate", { method: "POST", credentials: "same-origin" });
      const body = (await r.json().catch(() => ({}))) as { error?: string; user?: AuthUser; apiKey?: string };
      if (r.ok && body.user && body.apiKey) {
        setSession(body.user, body.apiKey);
        setShown(true);
        setMessage({ ok: true, text: "API key baru sudah aktif. Key lama berhenti berfungsi dalam satu menit; perbarui aplikasi yang masih memakainya." });
      } else {
        setMessage({ ok: false, text: body.error ?? "API key gagal diganti. Coba lagi." });
        if (r.status === 401) void refreshAuth();
      }
    } catch {
      setMessage({ ok: false, text: "Tidak dapat terhubung ke server. API key belum diganti; coba lagi." });
    }
    setBusy(null);
    setConfirming(false);
    rotateRef.current?.focus();
  }

  async function logout() {
    setBusy("logout");
    setMessage(null);
    const ok = await signOut();
    if (ok) router.replace("/login");
    else {
      setBusy(null);
      setMessage({ ok: false, text: "Belum berhasil keluar karena server tidak dapat dihubungi. Coba lagi." });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-[2rem] font-bold leading-tight tracking-tight">Akun</h1>
        <p className="wrap-anywhere mt-2 text-muted">
          Masuk sebagai <strong className="font-semibold text-fg">{user.email}</strong>
        </p>
      </header>

      <section aria-labelledby="akun-key" className="border border-control bg-card p-4 sm:p-6">
        <h2 id="akun-key" className="font-mono text-lg font-bold">
          API key kamu
        </h2>
        <p className="mt-1 text-sm text-muted">Tambahkan sebagai parameter apikey di setiap permintaan. Jangan bagikan: siapa pun yang punya key ini memakai jatahmu.</p>

        <div className="mt-4 flex items-stretch border border-control bg-bg">
          <code className="wrap-anywhere tnum min-w-0 flex-1 self-center px-3 py-2 font-mono text-base text-fg" aria-label={shown ? "API key" : "API key, disembunyikan"}>
            {shown ? key : mask(key)}
          </code>
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-pressed={shown}
            aria-label={shown ? "Sembunyikan API key" : "Tampilkan API key"}
            title={shown ? "Sembunyikan" : "Tampilkan"}
            className="grid min-h-11 w-11 shrink-0 place-items-center text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg"
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <CopyButton text={key} />
        </div>

        <h3 className="mt-5 text-sm font-semibold">Contoh pemakaian</h3>
        <div className="mt-2 flex items-center border border-line bg-bg">
          <code className="wrap-anywhere min-w-0 flex-1 px-3 py-2 font-mono text-sm text-muted">{exampleShown}</code>
          <CopyButton text={exampleReal} label="URL" />
        </div>
        <p className="mt-2 text-sm text-muted">
          Lebih suka header? Kirim <code className="font-mono text-fg">x-api-key: yn-…</code> sebagai gantinya.
        </p>

        <Link href="/docs" className="btn btn-primary mt-5 w-full sm:w-auto">
          Coba di dokumentasi
          <ArrowIcon />
        </Link>
        <p className="mt-2 text-sm text-muted">Kolom API key di dokumentasi terisi otomatis selama kamu masuk.</p>
      </section>

      <p role="status" className={`text-sm font-medium ${message ? (message.ok ? "border border-ok p-3 text-ok" : "border border-danger p-3 text-danger") : "sr-only"}`}>
        {message?.text}
      </p>

      <section aria-labelledby="akun-profil" className="border border-line bg-card p-4 sm:p-6">
        <h2 id="akun-profil" className="font-mono text-lg font-bold">
          Profil
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {user.name && (
            <div>
              <dt className="text-sm text-muted">Nama</dt>
              <dd className="wrap-anywhere mt-0.5 font-medium">{user.name}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted">Email</dt>
            <dd className="wrap-anywhere mt-0.5 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Terdaftar lewat</dt>
            <dd className="mt-0.5 font-medium">{user.provider === "google" ? "Google" : "Email dan kode verifikasi"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Bergabung</dt>
            <dd className="tnum mt-0.5 font-medium">{joined}</dd>
          </div>
        </dl>
        <button type="button" onClick={() => void logout()} disabled={busy !== null} className="btn btn-secondary mt-5 w-full sm:w-auto">
          <LogoutIcon />
          {busy === "logout" ? "Keluar…" : "Keluar"}
        </button>
      </section>

      <section aria-labelledby="akun-ganti" className="border border-line bg-card p-4 sm:p-6">
        <h2 id="akun-ganti" className="font-mono text-lg font-bold">
          Ganti API key
        </h2>
        <p className="mt-1 text-sm text-muted">Lakukan ini kalau key kamu bocor. Key lama langsung dicabut dan tidak bisa dikembalikan; setiap bot atau aplikasi yang memakainya harus diisi key baru.</p>
        {confirming ? (
          <div className="mt-4 border border-danger p-4">
            <p className="font-medium">Ganti API key sekarang? Key lama berhenti berfungsi.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button ref={confirmRef} type="button" onClick={() => void rotate()} disabled={busy !== null} className="btn btn-danger">
                {busy === "rotate" ? "Mengganti…" : "Ya, ganti API key"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTimeout(() => rotateRef.current?.focus(), 0);
                }}
                disabled={busy !== null}
                className="btn btn-secondary"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <button ref={rotateRef} type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className="btn btn-danger mt-4 w-full sm:w-auto">
            <RefreshIcon />
            Ganti API key
          </button>
        )}
      </section>
    </div>
  );
}
