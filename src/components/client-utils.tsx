"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, CopyIcon } from "./icons";

const noop = () => () => {};

/** Origin browser (hindari mismatch hydration). */
export function useOrigin(fallback = ""): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => fallback);
}

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
