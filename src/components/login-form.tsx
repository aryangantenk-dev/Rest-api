"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { setSession, useAuth, type SessionBody } from "./auth-client";
import { ArrowIcon, GoogleIcon, MailIcon } from "./icons";
import { UsernameField, useUsername } from "./username-field";

const QUERY_ERRORS: Record<string, string> = {
  google_off: "Login Google belum diaktifkan di situs ini. Masuk dengan email.",
  google_denied: "Login Google dibatalkan. Coba lagi, atau masuk dengan email.",
  google_state: "Sesi login Google sudah kedaluwarsa. Tekan tombol Google sekali lagi.",
  google_failed: "Google belum bisa memastikan akunmu. Coba lagi sebentar lagi, atau masuk dengan email.",
  banned: "Akun ini dinonaktifkan oleh pemilik situs. Hubungi owner untuk banding.",
};

/** Tujuan setelah masuk: hanya path di situs ini. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && raw.length <= 300 ? raw : "/akun";
}

/** Akun tanpa username (wajib) harus mengisinya dulu di /akun; tujuan semula dibawa serta. */
const usernameGate = (next: string) => (next === "/akun" ? "/akun" : `/akun?next=${encodeURIComponent(next)}`);

type Fail = { field: "email" | "code" | null; message: string };
type ApiBody = SessionBody & { status?: boolean; error?: string; field?: string; wait?: number; retry_after?: number; resend?: boolean };

async function post(action: string, body: unknown): Promise<{ ok: boolean; body: ApiBody }> {
  try {
    const r = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const data = (await r.json().catch(() => ({}))) as ApiBody;
    return { ok: r.ok, body: r.ok || data.error ? data : { error: "Server sedang bermasalah. Coba lagi sebentar lagi." } };
  } catch {
    return { ok: false, body: { error: "Tidak dapat terhubung ke server. Periksa koneksimu, lalu coba lagi." } };
  }
}

function Spinner() {
  return <span className="spin h-4 w-4 rounded-full border-2 border-onaccent/30 border-t-onaccent" aria-hidden />;
}

/**
 * Formulir masuk (/login) dan daftar (/daftar). Keduanya memakai kode email atau Google; bedanya,
 * halaman daftar meminta username lebih dulu. Email yang belum terdaftar tetap bisa masuk lewat
 * /login: akunnya dibuat, lalu username diminta di /akun sebelum akun bisa dipakai.
 */
export function LoginForm({ mode = "login", google, email: emailOn }: { mode?: "login" | "register"; google: boolean; email: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const queryError = QUERY_ERRORS[sp.get("error") ?? ""] ?? null;
  const auth = useAuth(google || emailOn);
  const register = mode === "register";
  const uname = useUsername();
  const usernameRef = useRef<HTMLInputElement>(null);
  const nextQuery = next === "/akun" ? "" : `?next=${encodeURIComponent(next)}`;

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "resend" | null>(null);
  const [fail, setFail] = useState<Fail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  /** Detik tersisa sampai kode boleh dikirim ulang. */
  const [left, setLeft] = useState(0);
  const resendAt = useRef(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const verifying = useRef(false);

  // Sudah masuk (mis. membuka /login lagi): langsung ke tujuan.
  useEffect(() => {
    if (auth.user) router.replace(auth.needsUsername ? usernameGate(next) : next);
  }, [auth.user, auth.needsUsername, next, router]);

  useEffect(() => {
    if (step !== "code") return;
    codeRef.current?.focus();
    const tick = () => setLeft(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000)));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const emailError = fail?.field === "email" ? fail.message : emailTouched && email.trim() && !emailValid ? "Alamat email belum lengkap. Contoh: nama@gmail.com." : null;
  const codeError = fail?.field === "code" ? fail.message : null;
  const formError = fail && !fail.field ? fail.message : null;

  const startTimer = (seconds: number) => {
    resendAt.current = Date.now() + seconds * 1000;
    setLeft(seconds);
  };

  async function sendCode(kind: "send" | "resend") {
    if (busy) return;
    if (register && (!uname.valid || uname.error)) {
      uname.touch();
      usernameRef.current?.focus();
      return;
    }
    if (!emailValid) {
      setEmailTouched(true);
      setFail({ field: "email", message: email.trim() ? "Alamat email belum lengkap. Contoh: nama@gmail.com." : "Isi alamat email dulu." });
      emailRef.current?.focus();
      return;
    }
    setBusy(kind);
    setFail(null);
    setNotice(null);
    const { ok, body } = await post("otp", register ? { email: email.trim(), username: uname.name } : { email: email.trim() });
    setBusy(null);
    if (ok) {
      setCode("");
      startTimer(body.wait ?? 60);
      setStep("code");
      if (kind === "resend") {
        setNotice("Kode baru sudah dikirim. Kode sebelumnya tidak berlaku lagi.");
        codeRef.current?.focus();
      }
      return;
    }
    // Username ditolak server (mis. baru saja diambil orang lain): kembali ke kolomnya.
    if (body.field === "username") {
      uname.reject(body.error ?? "Username ini tidak bisa dipakai. Pilih yang lain.");
      setStep("email");
      setTimeout(() => usernameRef.current?.focus(), 0);
      return;
    }
    // Kode masih baru dikirim: lanjut ke langkah berikutnya supaya kode itu bisa dipakai.
    if (kind === "send" && body.retry_after && body.retry_after <= 60 && !body.field) {
      startTimer(body.retry_after);
      setStep("code");
      setNotice("Kode untuk email ini baru saja dikirim. Periksa kotak masukmu.");
      return;
    }
    if (kind === "resend" && body.retry_after) startTimer(Math.min(body.retry_after, 3600));
    setFail({ field: kind === "send" ? "email" : null, message: body.error ?? "Kode gagal dikirim. Coba lagi." });
    if (kind === "send") emailRef.current?.focus();
  }

  async function verify(value: string) {
    if (verifying.current) return;
    if (!/^\d{6}$/.test(value)) {
      setFail({ field: "code", message: "Kode terdiri dari 6 angka. Periksa lagi email yang kami kirim." });
      codeRef.current?.focus();
      return;
    }
    verifying.current = true;
    setBusy("verify");
    setFail(null);
    setNotice(null);
    const { ok, body } = await post("verify", register ? { email: email.trim(), code: value, username: uname.name } : { email: email.trim(), code: value });
    verifying.current = false;
    if (ok && body.user) {
      setSession({ ...body, user: body.user });
      router.replace(body.needsUsername ? usernameGate(next) : next);
      return;
    }
    setBusy(null);
    setFail({ field: body.field === "code" || body.resend ? "code" : null, message: body.error ?? "Kode belum bisa diperiksa. Coba lagi." });
    if (body.resend) {
      setCode("");
      startTimer(0);
    }
    codeRef.current?.focus();
    codeRef.current?.select();
  }

  const onEmailSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void sendCode("send");
  };
  const onCodeSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void verify(code);
  };

  if (!google && !emailOn) {
    return (
      <div className="border border-line bg-card p-5 sm:p-8">
        <h1 className="font-mono text-2xl font-bold tracking-tight">Login belum aktif</h1>
        <p className="mt-3 text-muted">Pemilik situs belum mengaktifkan login. Untuk saat ini semua endpoint masih bisa dipakai tanpa API key.</p>
        <Link href="/docs" className="btn btn-primary mt-6 w-full sm:w-auto">
          Buka dokumentasi
          <ArrowIcon />
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="border border-line bg-card p-5 sm:p-8">
        <p className="font-mono text-sm text-muted">Langkah 2 dari 2</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight">Masukkan kode</h1>
        <p className="mt-3 text-muted">
          Kode 6 angka sudah dikirim ke <strong className="wrap-anywhere font-semibold text-fg">{email.trim()}</strong>. Kode berlaku 10 menit. Kalau belum terlihat, periksa folder spam.
        </p>

        <form onSubmit={onCodeSubmit} noValidate className="mt-6">
          <label htmlFor="login-code" className="block text-sm font-semibold">
            Kode verifikasi
          </label>
          <input
            ref={codeRef}
            id="login-code"
            name="code"
            value={code}
            onChange={(ev) => {
              const v = ev.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (fail?.field === "code") setFail(null);
              // Enam angka lengkap (diketik atau ditempel): langsung periksa.
              if (v.length === 6 && v !== code) void verify(v);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            disabled={busy === "verify"}
            aria-invalid={!!codeError}
            aria-describedby={codeError ? "login-code-error" : "login-code-help"}
            className="field tnum mt-2 text-center text-2xl font-bold tracking-[0.4em]"
          />
          <div className="mt-1 grid min-h-10 text-sm">
            <p id="login-code-help" className={`col-start-1 row-start-1 text-muted ${codeError || notice ? "invisible" : ""}`}>
              Ketik atau tempel 6 angka dari email.
            </p>
            {codeError && (
              <p id="login-code-error" role="alert" className="col-start-1 row-start-1 font-medium text-danger">
                {codeError}
              </p>
            )}
            <p role="status" className="col-start-1 row-start-1 font-medium text-ok">
              {codeError ? null : notice}
            </p>
          </div>
          {formError && (
            <p role="alert" className="mt-3 border border-danger p-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <button type="submit" disabled={busy !== null} className="btn btn-primary mt-4 w-full">
            {busy === "verify" ? <Spinner /> : null}
            {busy === "verify" ? "Memeriksa" : register ? "Verifikasi dan daftar" : "Verifikasi dan masuk"}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row">
          <button type="button" onClick={() => void sendCode("resend")} disabled={busy !== null || left > 0} className="btn btn-secondary tnum flex-1">
            {busy === "resend" ? "Mengirim" : left > 0 ? `Kirim ulang dalam ${left} dtk` : "Kirim ulang kode"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setFail(null);
              setNotice(null);
              setCode("");
              setTimeout(() => (register ? usernameRef : emailRef).current?.focus(), 0);
            }}
            disabled={busy !== null}
            className="btn btn-secondary flex-1"
          >
            {register ? "Ubah data" : "Ganti email"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-line bg-card p-5 sm:p-8">
      <h1 className="font-mono text-2xl font-bold tracking-tight">{register ? "Daftar" : "Masuk"}</h1>
      <p className="mt-3 text-muted">
        {register ? "Buat akun gratis untuk mendapat API key. Cukup username dan email, tanpa kata sandi." : "Masuk untuk melihat dan mengelola API key kamu."}
      </p>

      {queryError && (
        <p role="alert" className="mt-5 border border-danger p-3 text-sm font-medium text-danger">
          {queryError}
        </p>
      )}

      {google && (
        <a href={`/auth/google?next=${encodeURIComponent(next)}`} className={`btn mt-6 w-full ${emailOn ? "btn-secondary" : "btn-primary"}`}>
          <GoogleIcon className={emailOn ? "" : "bg-white p-0.5"} />
          {register ? "Daftar dengan Google" : "Lanjutkan dengan Google"}
        </a>
      )}
      {google && register && <p className="mt-2 text-sm text-muted">Username dipilih setelah akun Google terhubung.</p>}

      {google && emailOn && (
        <div className="my-6 flex items-center gap-3 text-sm text-muted" role="separator">
          <span className="h-px flex-1 bg-line" aria-hidden />
          {register ? "atau daftar dengan email" : "atau pakai email"}
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>
      )}

      {emailOn && (
        <form onSubmit={onEmailSubmit} noValidate className={google ? "" : "mt-6"}>
          {register && (
            <div className="mb-4">
              <UsernameField id="login-username" state={uname} inputRef={usernameRef} disabled={busy !== null} />
            </div>
          )}
          <label htmlFor="login-email" className="block text-sm font-semibold">
            Email <span className="font-normal text-muted">(wajib)</span>
          </label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              if (fail) setFail(null);
            }}
            onBlur={() => setEmailTouched(true)}
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "login-email-error" : "login-email-help"}
            placeholder="nama@gmail.com"
            className="field mt-2"
          />
          {/* Pesan galat menempati tempat yang sama dengan teks bantuan, supaya tombol di bawahnya
              tidak bergeser saat pesan muncul (pergeseran di tengah klik membuat klik itu hilang). */}
          <div className="mt-1 grid text-sm">
            <p id="login-email-help" className={`col-start-1 row-start-1 text-muted ${emailError ? "invisible" : ""}`}>
              Kami kirim kode 6 angka ke alamat ini untuk memastikan email itu milikmu.{register ? "" : " Tidak perlu kata sandi."}
            </p>
            {emailError && (
              <p id="login-email-error" role="alert" className="col-start-1 row-start-1 font-medium text-danger">
                {emailError}
              </p>
            )}
          </div>

          <button type="submit" disabled={busy !== null} className="btn btn-primary mt-4 w-full">
            {busy === "send" ? <Spinner /> : <MailIcon />}
            {busy === "send" ? "Mengirim kode" : "Kirim kode ke email"}
          </button>
        </form>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-[0.9375rem] text-muted">
        {register ? "Sudah punya akun?" : "Belum punya akun?"}
        <Link href={`${register ? "/login" : "/daftar"}${nextQuery}`} className="link inline-flex min-h-11 items-center font-semibold text-fg">
          {register ? "Masuk" : "Daftar"}
        </Link>
      </p>

      <p className="mt-2 border-t border-line pt-5 text-sm text-muted">
        Dengan {register ? "mendaftar" : "masuk"}, kamu setuju memakai API ini secara wajar: tidak untuk spam atau hal yang melanggar hukum.
      </p>
    </div>
  );
}
