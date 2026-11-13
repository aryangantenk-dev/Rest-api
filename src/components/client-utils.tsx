"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, CopyIcon } from "./icons";

const noop = () => () => {};

/** Origin browser (hindari mismatch hydration). */
export function useOrigin(fallback = ""): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => fallback);
}

/** true bila permintaan meminta pengalihan langsung ke berkas gambar (`redirect=1`). */
export function asksRedirect(pathWithQuery: string): boolean {
  return new URLSearchParams(pathWithQuery.split("?")[1] ?? "").get("redirect") === "1";
}

/**
 * Muat sebuah URL sebagai gambar; mengembalikan null bila gagal atau dibatalkan.
 *
 * Dipakai untuk endpoint yang menjawab 302 ke berkas di situs lain. `fetch()` hanya boleh
 * membaca berkas lintas situs bila situs itu mengirim izin CORS, dan sebagian sumber gambar
 * tidak mengirimnya, sehingga fetch gagal walau API-nya benar. `<img>` tidak butuh izin itu,
 * dan memang begitulah `redirect=1` dipakai.
 */
export function loadImage(src: string, alt: string, className: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const img = new Image();
    img.alt = alt;
    img.className = className;
    img.referrerPolicy = "no-referrer";
    const stop = () => {
      img.onload = img.onerror = null;
      img.src = "";
      resolve(null);
    };
    img.onload = () => {
      signal?.removeEventListener("abort", stop);
      resolve(img);
    };
    img.onerror = () => {
      signal?.removeEventListener("abort", stop);
      resolve(null);
    };
    signal?.addEventListener("abort", stop, { once: true });
    // Jawaban 302-nya tidak boleh dipakai ulang: setiap kiriman harus memberi gambar acak baru.
    img.src = `${src}${src.includes("?") ? "&" : "?"}_=${Date.now()}`;
  });
}

/** Pasang elemen gambar yang sudah dimuat `loadImage`, tanpa mengunduhnya lagi. */
export function LoadedImage({ el }: { el: HTMLImageElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    box?.replaceChildren(el);
    return () => box?.replaceChildren();
  }, [el]);
  return <div ref={ref} className="enter" />;
}

export const REDIRECT_FAILED =
  "Server mengalihkan ke berkas gambar, tetapi browser gagal memuat gambarnya. Kirim lagi untuk mencoba gambar lain, atau kosongkan 'redirect' untuk melihat alamatnya.";

/** `tone="code"` untuk tombol di atas permukaan kode yang selalu gelap. */
export function CopyButton({ text, label = "Salin", tone = "page", className = "" }: { text: string; label?: string; tone?: "page" | "code"; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const idle = tone === "code" ? "text-codemuted hover:bg-white/10 hover:text-codefg" : "text-muted hover:bg-subtle hover:text-fg";
  const ok = tone === "code" ? "text-codeok" : "text-ok";

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1800);
      }}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-3 text-sm font-medium transition-colors duration-150 ${done ? ok : idle} ${className}`}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{done ? "Tersalin" : label}</span>
    </button>
  );
}

export function BaseUrlBox({ fallback }: { fallback: string }) {
  const origin = useOrigin(fallback);
  const url = `${origin}/api`;
  return (
    <div className="flex w-full max-w-xl items-center border border-control bg-card">
      <span className="hidden border-r border-line px-3 text-sm text-muted sm:block">Base URL</span>
      <code className="wrap-anywhere min-w-0 flex-1 px-3 py-2 font-mono text-sm text-fg">
        <span className="sr-only sm:hidden">Base URL: </span>
        {url}
      </code>
      <CopyButton text={url} />
    </div>
  );
}

/** Total permintaan yang sudah dilayani. Lebarnya dipesan agar angka yang datang tidak menggeser tata letak. */
export function LiveRequests() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => alive && setN(Number(d.totalRequests) || 0))
      .catch(() => alive && setN(0));
    return () => {
      alive = false;
    };
  }, []);
  return <span className="tnum inline-block min-w-[4ch]">{n === null ? "…" : n.toLocaleString("id-ID")}</span>;
}
