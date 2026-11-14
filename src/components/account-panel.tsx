"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { refreshAuth, setSession, signOut, useAuth, type AuthUser, type SessionBody } from "./auth-client";
import { Avatar } from "./avatar";
import { CopyButton, useOrigin } from "./client-utils";
import { ArrowIcon, CameraIcon, EyeIcon, EyeOffIcon, LogoutIcon, RefreshIcon, TrashIcon } from "./icons";
import { UsernameField, useUsername } from "./username-field";

const mask = (key: string) => `${key.slice(0, 3)}${"•".repeat(12)}${key.slice(-4)}`;

type Message = { ok: boolean; text: string };
type Reply = SessionBody & { error?: string; field?: string };

const OFFLINE = "Tidak dapat terhubung ke server. Periksa koneksimu, lalu coba lagi.";

/** Kirim perubahan akun. Bila berhasil, keadaan login di browser langsung diperbarui. */
async function send(action: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: Reply }> {
  try {
    const r = await fetch(`/api/auth/${action}`, { method: "POST", credentials: "same-origin", ...init });
    const body = (await r.json().catch(() => ({}))) as Reply;
    if (r.ok && body.user) setSession({ ...body, user: body.user });
    else if (r.status === 401) void refreshAuth();
    return { ok: r.ok && !!body.user, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: OFFLINE } };
  }
}

const sendJson = (action: string, data: unknown) => send(action, { headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

/** Tujuan setelah username diisi (dibawa dari halaman login): hanya path di situs ini. */
function nextFromQuery(): string | null {
  const raw = new URLSearchParams(window.location.search).get("next");
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && raw.length <= 300 && raw !== "/akun" ? raw : null;
}

/** Langkah wajib bagi akun yang belum punya username; isi halaman Akun baru tampil setelahnya. */
function UsernameStep({ user }: { user: AuthUser }) {
  const router = useRouter();
  const uname = useUsername();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"save" | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!uname.valid || uname.error) {
      uname.touch();
      inputRef.current?.focus();
      return;
    }
    setBusy("save");
    setError(null);
    const { ok, body } = await sendJson("username", { username: uname.name });
    if (ok) {
      const next = nextFromQuery();
      if (next) router.replace(next);
      return;
    }
    setBusy(null);
    if (body.field === "username") uname.reject(body.error ?? "Username ini tidak bisa dipakai. Pilih yang lain.");
    else setError(body.error ?? "Username belum tersimpan. Coba lagi.");
    inputRef.current?.focus();
  }

  async function logout() {
    setBusy("logout");
    setError(null);
    if (await signOut()) router.replace("/login");
    else {
      setBusy(null);
      setError("Belum berhasil keluar karena server tidak dapat dihubungi. Coba lagi.");
    }
  }

  return (
    <div className="mx-auto max-w-md border border-line bg-card p-5 sm:p-8">
      <p className="font-mono text-sm text-muted">Satu langkah lagi</p>
      <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight">Pilih username</h1>
      <p className="mt-3 text-muted">
        Kamu masuk sebagai <strong className="wrap-anywhere font-semibold text-fg">{user.email}</strong>. Username wajib diisi sebelum API key bisa dipakai, dan bisa diganti kapan saja di halaman Akun.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6">
        <UsernameField id="akun-username-baru" state={uname} inputRef={inputRef} disabled={busy !== null} />
        {error && (
          <p role="alert" className="mt-3 border border-danger p-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy !== null} className="btn btn-primary mt-4 w-full">
          {busy === "save" ? <span className="spin h-4 w-4 rounded-full border-2 border-onaccent/30 border-t-onaccent" aria-hidden /> : null}
          {busy === "save" ? "Menyimpan" : "Simpan dan lanjutkan"}
          {busy === "save" ? null : <ArrowIcon />}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-5 text-sm text-muted">
        <span>Bukan akunmu?</span>
        <button type="button" onClick={() => void logout()} disabled={busy !== null} className="btn btn-secondary">
          <LogoutIcon />
          {busy === "logout" ? "Keluar…" : "Keluar"}
        </button>
      </div>
    </div>
  );
}

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_SIDE = 256;

/** Potong tengah gambar menjadi persegi, kecilkan ke 256 px, dan ubah ke JPG supaya unggahannya kecil. */
function squareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PHOTO_SIDE;
      const ctx = canvas.getContext("2d");
      if (!ctx || !w || !h) return reject(new Error("decode"));
      const side = Math.min(w, h);
      // Latar putih untuk gambar tembus pandang (JPG tidak punya transparansi).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.86);
    };
    img.src = url;
  });
}

function PhotoEditor({ user }: { user: AuthUser }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function onPick(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    // Kosongkan supaya memilih berkas yang sama lagi tetap memicu onChange.
    ev.target.value = "";
    if (!file || busy) return;
    if (!PHOTO_TYPES.includes(file.type)) return setMessage({ ok: false, text: "Berkas ini bukan gambar PNG, JPG, atau WebP. Pilih berkas lain." });
    if (file.size > PHOTO_MAX_BYTES) return setMessage({ ok: false, text: "Ukuran berkas lebih dari 10 MB. Pilih gambar yang lebih kecil." });
    setBusy("upload");
    setMessage(null);
    let blob: Blob;
    try {
      blob = await squareJpeg(file);
    } catch {
      setBusy(null);
      return setMessage({ ok: false, text: "Gambar ini tidak bisa dibaca browser. Coba berkas PNG atau JPG lain." });
    }
    const { ok, body } = await send("photo", { headers: { "content-type": "image/jpeg" }, body: blob });
    setBusy(null);
    setMessage(ok ? { ok: true, text: "Foto profil diperbarui." } : { ok: false, text: body.error ?? "Foto belum tersimpan. Coba lagi." });
  }

  async function remove() {
    if (busy) return;
    setBusy("remove");
    setMessage(null);
    const { ok, body } = await send("unphoto", {});
    setBusy(null);
    setMessage(ok ? { ok: true, text: "Foto profil dihapus. Gambar pengganti dipakai lagi." } : { ok: false, text: body.error ?? "Foto belum terhapus. Coba lagi." });
    // Tombol "Hapus foto" hilang setelah berhasil; pindahkan fokus ke tombol di sebelahnya.
    if (ok) pickRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="relative h-24 w-24 shrink-0" aria-busy={busy !== null}>
        <Avatar photo={user.photo} name={user.username} className="h-24 w-24 text-4xl" />
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-bg/70" aria-hidden>
            <span className="spin h-6 w-6 rounded-full border-2 border-fg/30 border-t-fg" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">
          Foto profil <span className="font-normal text-muted">(opsional)</span>
        </h3>
        <p id="akun-foto-help" className="mt-1 text-sm text-muted">
          {user.photo ? "PNG, JPG, atau WebP, maksimal 10 MB. Foto dipotong menjadi persegi." : "Belum diatur, jadi dipakai gambar pengganti. Unggah PNG, JPG, atau WebP, maksimal 10 MB; foto dipotong menjadi persegi."}
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button ref={pickRef} type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null} aria-describedby="akun-foto-help" className="btn btn-secondary">
            <CameraIcon />
            {busy === "upload" ? "Mengunggah…" : user.photo ? "Ganti foto" : "Unggah foto"}
          </button>
          {user.photo && (
            <button type="button" onClick={() => void remove()} disabled={busy !== null} className="btn btn-secondary">
              <TrashIcon />
              {busy === "remove" ? "Menghapus…" : "Hapus foto"}
            </button>
          )}
        </div>
        <input ref={inputRef} id="akun-foto" type="file" accept={PHOTO_TYPES.join(",")} onChange={(ev) => void onPick(ev)} className="hidden" tabIndex={-1} aria-label="Pilih berkas foto profil" />
        <p role="status" className={`mt-2 min-h-5 text-sm font-medium ${message?.ok === false ? "text-danger" : "text-ok"}`}>
          {message?.text}
        </p>
      </div>
    </div>
  );
}

function UsernameEditor({ user }: { user: AuthUser }) {
  const uname = useUsername(user.username);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy || uname.unchanged) return;
    if (!uname.valid || uname.error) {
      uname.touch();
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setMessage(null);
    const { ok, body } = await sendJson("username", { username: uname.name });
    setBusy(false);
    if (ok) return setMessage({ ok: true, text: `Username diganti menjadi @${body.user?.username}.` });
    if (body.field === "username") {
      uname.reject(body.error ?? "Username ini tidak bisa dipakai. Pilih yang lain.");
      inputRef.current?.focus();
    } else setMessage({ ok: false, text: body.error ?? "Username belum tersimpan. Coba lagi." });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-x-3 gap-y-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <UsernameField id="akun-username" state={uname} inputRef={inputRef} disabled={busy} />
        </div>
        {/* sm:mt-7 menyejajarkan tombol dengan kolom isian (melewati tinggi label). */}
        <button type="submit" disabled={busy || uname.unchanged} className="btn btn-secondary shrink-0 sm:mt-7">
          {busy ? "Menyimpan…" : "Simpan username"}
        </button>
      </div>
      <p role="status" className={`mt-1 min-h-5 text-sm font-medium ${message?.ok === false ? "text-danger" : "text-ok"}`}>
        {message?.text}
      </p>
    </form>
  );
}

export function AccountPanel({ fallback }: { fallback: string }) {
  const router = useRouter();
  const origin = useOrigin(fallback);
  const auth = useAuth();
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"rotate" | "logout" | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
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

  if (auth.user && auth.needsUsername) return <UsernameStep user={auth.user} />;

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
    const { ok, status, body } = await send("regenerate", {});
    if (ok) {
      setShown(true);
      setMessage({ ok: true, text: "API key baru sudah aktif. Key lama berhenti berfungsi dalam satu menit; perbarui aplikasi yang masih memakainya." });
    } else {
      setMessage({ ok: false, text: status === 0 ? "Tidak dapat terhubung ke server. API key belum diganti; coba lagi." : (body.error ?? "API key gagal diganti. Coba lagi.") });
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
      <header className="flex items-center gap-4">
        <Avatar photo={user.photo} name={user.username} className="h-16 w-16 text-2xl" />
        <div className="min-w-0">
          <h1 className="font-mono text-[2rem] font-bold leading-tight tracking-tight">Akun</h1>
          <p className="wrap-anywhere mt-1 text-muted">
            <strong className="font-mono font-semibold text-fg">@{user.username}</strong>
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {user.email}
          </p>
        </div>
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
        <div className="mt-4">
          <PhotoEditor user={user} />
        </div>
        <div className="mt-4 border-t border-line pt-5">
          <UsernameEditor user={user} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-5 sm:grid-cols-2">
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
