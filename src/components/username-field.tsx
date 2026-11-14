"use client";

import { useEffect, useState, type RefObject } from "react";
import { CheckIcon } from "./icons";
import { USERNAME_HELP, USERNAME_MAX, cleanUsername, usernameProblem } from "@/lib/username";

type Remote = { name: string; available: boolean; error?: string };

/**
 * Keadaan kolom username: nilai, pesan galat, dan pemeriksaan "masih tersedia?" ke server
 * (ditunda sebentar setelah ketikan terakhir). `current` adalah username akun saat ini, yang
 * tentu boleh dipakai lagi.
 */
export function useUsername(current = "") {
  const [value, setValue] = useState(current);
  const [touched, setTouched] = useState(false);
  const [remote, setRemote] = useState<Remote | null>(null);
  /** Galat dari server saat formulir dikirim, berlaku untuk nilai `name` tertentu saja. */
  const [rejected, setRejected] = useState<{ name: string; message: string } | null>(null);

  const name = cleanUsername(value);
  const problem = usernameProblem(name);
  const unchanged = !!current && name === current;
  const known = remote?.name === name ? remote : null;

  useEffect(() => {
    if (problem || unchanged || known) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/auth/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name }), credentials: "same-origin", signal: ctrl.signal });
        const body = (await r.json()) as { available?: boolean; error?: string };
        // Pemeriksaan gagal (mis. dibatasi): diam saja; server tetap memeriksa lagi saat formulir dikirim.
        if (r.ok && typeof body.available === "boolean") setRemote({ name, available: body.available, error: body.error });
      } catch {
        /* dibatalkan atau jaringan putus */
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [name, problem, unchanged, known]);

  const error =
    rejected?.name === name ? rejected.message : touched && problem ? problem : known && !known.available ? (known.error ?? "Username ini sudah dipakai. Coba yang lain.") : null;

  return {
    value,
    name,
    error,
    /** Bentuknya sah (belum tentu masih tersedia). */
    valid: !problem,
    unchanged,
    available: !error && !!known?.available,
    checking: !problem && !unchanged && !known && !error,
    onChange: (raw: string) => setValue(raw.replace(/\s+/g, "").replace(/^@+/, "").toLowerCase().slice(0, USERNAME_MAX + 4)),
    onBlur: () => setTouched(true),
    /** Tampilkan masalah bentuk sekarang juga (dipanggil saat formulir dikirim). */
    touch: () => setTouched(true),
    /** Catat galat dari server untuk nilai saat ini. */
    reject: (message: string) => setRejected({ name, message }),
    reset: (next: string) => {
      setValue(next);
      setTouched(false);
      setRejected(null);
    },
  };
}

export type UsernameState = ReturnType<typeof useUsername>;

/** Kolom username dengan label, awalan @, teks bantuan, dan pesan galat di bawahnya. */
export function UsernameField({ id, state, inputRef, disabled = false, label = "Username" }: { id: string; state: UsernameState; inputRef?: RefObject<HTMLInputElement | null>; disabled?: boolean; label?: string }) {
  const { error, available } = state;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label} <span className="font-normal text-muted">(wajib)</span>
      </label>
      <div className="relative mt-2">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center font-mono text-muted">
          @
        </span>
        <input
          ref={inputRef}
          id={id}
          name="username"
          value={state.value}
          onChange={(ev) => state.onChange(ev.target.value)}
          onBlur={state.onBlur}
          disabled={disabled}
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX + 4}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
          placeholder="nama_kamu"
          className="field"
          style={{ paddingLeft: "2.25rem" }}
        />
      </div>
      {/* Bantuan, galat, dan "tersedia" berbagi satu tempat supaya tombol di bawahnya tidak bergeser. */}
      <div className="mt-1 grid text-sm">
        <p id={`${id}-help`} className={`col-start-1 row-start-1 text-muted ${error || available ? "invisible" : ""}`}>
          {USERNAME_HELP}
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="col-start-1 row-start-1 font-medium text-danger">
            {error}
          </p>
        )}
        <p role="status" className="col-start-1 row-start-1 flex items-start gap-1.5 font-medium text-ok">
          {available && (
            <>
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="wrap-anywhere font-mono">@{state.name}</span> masih tersedia.
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
