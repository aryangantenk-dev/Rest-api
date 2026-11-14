"use client";

import { useSyncExternalStore } from "react";

/*
  Keadaan login di sisi browser, dipakai bersama oleh header, halaman login/akun, dokumentasi,
  dan konsol di beranda. Dimuat sekali dari /api/auth/me saat komponen pertama memakainya.
*/

export type AuthUser = {
  email: string;
  name: string;
  /** Kosong selama belum dipilih. */
  username: string;
  /** Alamat foto profil di situs ini, atau kosong bila memakai gambar pengganti. */
  photo: string;
  provider: "google" | "email";
  created_at: string;
};

/** Bagian jawaban server yang menggambarkan sesi (dari /api/auth/me, verify, username, photo, regenerate). */
export type SessionBody = { user?: AuthUser | null; apiKey?: string | null; needsUsername?: boolean };

export type AuthState = {
  /** "loading" sampai jawaban /api/auth/me tiba; "error" bila server akun tidak bisa dihubungi. */
  status: "loading" | "ready" | "error";
  user: AuthUser | null;
  /** API key milik akun yang sedang masuk. null selama akun belum punya username. */
  apiKey: string | null;
  /** Sudah masuk tetapi username (wajib) belum diisi; halaman Akun memintanya dulu. */
  needsUsername: boolean;
  /** API key yang ditempel sendiri oleh pengunjung yang belum masuk. */
  manualKey: string;
  methods: { google: boolean; email: boolean };
  keyRequired: boolean;
};

const MANUAL_KEY = "yn_api_key";
const SIGNED_HINT = "yn_signed_in";
/** Teks pengganti di contoh URL dan kode selama API key belum diisi. */
export const KEY_PLACEHOLDER = "API_KEY_KAMU";

const initial: AuthState = { status: "loading", user: null, apiKey: null, needsUsername: false, manualKey: "", methods: { google: false, email: false }, keyRequired: false };

/**
 * Catat apakah browser ini sedang masuk. Dipakai skrip di <head> pada pemuatan berikutnya dan
 * oleh CSS (.only-signed / .only-guest) untuk memilih tombol "Masuk" atau "Akun".
 */
function writeHint(signedIn: boolean) {
  if (signedIn) document.documentElement.dataset.signed = "1";
  else delete document.documentElement.dataset.signed;
  try {
    if (signedIn) localStorage.setItem(SIGNED_HINT, "1");
    else localStorage.removeItem(SIGNED_HINT);
  } catch {
    /* penyimpanan diblokir: tombol akun hanya akan berkedip sebentar saat halaman dimuat */
  }
}

let state = initial;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function readManual(): string {
  try {
    return localStorage.getItem(MANUAL_KEY) ?? "";
  } catch {
    return "";
  }
}

type MeBody = SessionBody & { methods?: AuthState["methods"]; keyRequired?: boolean };

/** Muat ulang keadaan login dari server. */
export async function refreshAuth(): Promise<void> {
  started = true;
  try {
    const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    const body = (await r.json()) as MeBody;
    if (r.ok) writeHint(!!body.user);
    set({
      status: r.ok ? "ready" : "error",
      user: body.user ?? null,
      apiKey: body.apiKey ?? null,
      needsUsername: !!body.user && !!body.needsUsername,
      methods: body.methods ?? state.methods,
      keyRequired: body.keyRequired ?? state.keyRequired,
      manualKey: readManual(),
    });
  } catch {
    set({ status: "error", manualKey: readManual() });
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) void refreshAuth();
  return () => void listeners.delete(l);
}

/** Ikut mendengarkan tanpa memicu pemuatan (dipakai saat login tidak aktif di server ini). */
function subscribeIdle(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

const getState = () => state;
const getInitial = () => initial;

/** `enabled=false` berarti login tidak aktif: tidak ada permintaan ke server dan hasilnya selalu "belum masuk". */
export function useAuth(enabled = true): AuthState {
  return useSyncExternalStore(enabled ? subscribe : subscribeIdle, enabled ? getState : getInitial, getInitial);
}

/**
 * API key untuk permintaan dan contoh di halaman ini.
 * `key` kosong bila belum ada; `shown` berisi teks pengganti supaya contoh tetap menunjukkan letak API key.
 */
export function useApiKey(required: boolean): { key: string; shown: string; auth: AuthState } {
  const auth = useAuth(required);
  const key = required ? (auth.apiKey ?? auth.manualKey) : "";
  return { key, shown: required ? key || KEY_PLACEHOLDER : "", auth };
}

/** Dipanggil dengan jawaban server setelah login berhasil atau setelah akun diubah (username, foto, API key). */
export function setSession(body: SessionBody & { user: AuthUser }) {
  started = true;
  writeHint(true);
  set({ status: "ready", user: body.user, apiKey: body.apiKey ?? null, needsUsername: !!body.needsUsername });
}

/** Keluar: hapus sesi di server lalu lupakan semuanya di browser ini. */
export async function signOut(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!r.ok) return false;
  } catch {
    return false;
  }
  setManualKey("");
  writeHint(false);
  set({ user: null, apiKey: null, needsUsername: false });
  return true;
}

export function setManualKey(value: string) {
  const v = value.trim();
  try {
    if (v) localStorage.setItem(MANUAL_KEY, v);
    else localStorage.removeItem(MANUAL_KEY);
  } catch {
    /* penyimpanan diblokir: key tetap dipakai sampai halaman ditutup */
  }
  set({ manualKey: v });
}

/** Tambahkan `apikey` ke sebuah URL/path yang mungkin sudah punya query. */
export function withKey(url: string, key: string): string {
  if (!key || /[?&]apikey=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`;
}
