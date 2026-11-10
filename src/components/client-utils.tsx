"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, CopyIcon } from "./icons";
import { CountUp } from "./motion";

const noop = () => () => {};

/** Origin browser (hindari mismatch hydration). */
export function useOrigin(fallback = ""): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => fallback);
}

export function CopyButton({ text, label = "Salin", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
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
        setTimeout(() => setDone(false), 1800);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        done ? "bg-mint/15 text-mint" : "text-muted hover:bg-white/5 hover:text-fg"
      } ${className}`}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      <span>{done ? "Tersalin" : label}</span>
    </button>
  );
}

export function BaseUrlBox({ fallback }: { fallback: string }) {
  const origin = useOrigin(fallback);
  const url = `${origin}/api`;
  return (
    <div className="group flex w-full max-w-xl items-center gap-3 rounded-2xl border border-linestrong bg-surface/80 py-2 pl-4 pr-2 backdrop-blur transition-colors hover:border-ember/40">
      <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-dim sm:block">Base URL</span>
      <span className="hidden h-4 w-px bg-line sm:block" />
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{url}</code>
      <CopyButton text={url} />
    </div>
  );
}

export function LiveRequests({ fallback = 0 }: { fallback?: number }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => alive && setN(Number(d.totalRequests) || 0))
      .catch(() => alive && setN(fallback));
    return () => {
      alive = false;
    };
  }, [fallback]);
  if (n === null) return <span className="tabular-nums">—</span>;
  return <CountUp key={n} to={n} />;
}
