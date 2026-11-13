"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { colorizeJson } from "@/lib/highlight";
import { CopyButton, useOrigin } from "./client-utils";
import { PlayIcon } from "./icons";

export type ConsoleEndpoint = {
  /** Path setelah `/api/`, mis. `random/quote`. */
  path: string;
  title: string;
  /** Path beserta contoh parameter wajibnya, siap dikirim. */
  sample: string;
};

type Result =
  | { kind: "json" | "text"; status: number; ok: boolean; ms: number; type: string; text: string; cut: boolean }
  | { kind: "image"; status: number; ok: boolean; ms: number; type: string; src: string }
  | { kind: "video"; status: number; ok: boolean; ms: number; type: string; src: string }
  | { kind: "html"; status: number; ok: boolean; ms: number; type: string; href: string }
  | { kind: "error"; message: string };

const MAX_CHARS = 20000;
const MAX_SUGGEST = 7;

/** Kirim satu permintaan dan ringkas hasilnya. Mengembalikan null bila dibatalkan. */
async function request(target: string, signal: AbortSignal): Promise<Result | null> {
  const t0 = performance.now();
  try {
    const r = await fetch(`/api/${target}`, { signal });
    const type = (r.headers.get("content-type") ?? "").split(";")[0];
    const ms = Math.round(performance.now() - t0);
    if (type.startsWith("image/") || type.startsWith("video/")) {
      return { kind: type.startsWith("video/") ? "video" : "image", status: r.status, ok: r.ok, ms, type, src: URL.createObjectURL(await r.blob()) };
    }
    if (r.ok && type === "text/html") {
      return { kind: "html", status: r.status, ok: r.ok, ms, type, href: `/api/${target}` };
    }
    const raw = await r.text();
    let text = raw;
    let kind: "json" | "text" = "text";
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
      kind = "json";
    } catch {
      /* bukan JSON: tampilkan apa adanya */
    }
    const cut = text.length > MAX_CHARS;
    return { kind, status: r.status, ok: r.ok, ms, type, text: cut ? text.slice(0, MAX_CHARS) : text, cut };
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return null;
    return { kind: "error", message: "Tidak dapat terhubung ke server. Periksa koneksimu, lalu kirim lagi." };
  }
}

/**
 * Konsol di beranda: cari endpoint, kirim permintaan sungguhan, dan baca responsnya.
 * Sebelum ada permintaan, yang tampil adalah contoh statis dan diberi label "contoh".
 */
export function TryConsole({ endpoints, picks, fallback, sample }: { endpoints: ConsoleEndpoint[]; picks: ConsoleEndpoint[]; fallback: string; sample: string }) {
  const origin = useOrigin(fallback);
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imgRef = useRef<string | null>(null);

  const [value, setValue] = useState(picks[0]?.sample ?? "random/quote");
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (imgRef.current) URL.revokeObjectURL(imgRef.current);
    },
    [],
  );

  const term = value.split("?")[0].trim().toLowerCase().replace(/^\/+/, "").replace(/^api\//, "");
  const matches = useMemo(() => {
    if (!term) return endpoints.slice(0, MAX_SUGGEST);
    const starts = endpoints.filter((e) => e.path.startsWith(term));
    const rest = endpoints.filter((e) => !e.path.startsWith(term) && `${e.path} ${e.title}`.toLowerCase().includes(term));
    return [...starts, ...rest].slice(0, MAX_SUGGEST);
  }, [endpoints, term]);
  const showList = listOpen && matches.length > 0;

  const clean = value.trim().replace(/^\/+/, "").replace(/^api\//, "");
  const fullUrl = `${origin}/api/${clean}`;

  async function send(pathOverride?: string) {
    const target = (pathOverride ?? clean).trim();
    if (!target) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setListOpen(false);
    setLoading(true);
    const next = await request(target, ctrl.signal);
    if (abortRef.current !== ctrl) {
      // Sudah digantikan permintaan yang lebih baru: buang hasil ini.
      if (next?.kind === "image" || next?.kind === "video") URL.revokeObjectURL(next.src);
      return;
    }
    if (imgRef.current) URL.revokeObjectURL(imgRef.current);
    imgRef.current = next?.kind === "image" || next?.kind === "video" ? next.src : null;
    if (next) setRes(next);
    setLoading(false);
  }

  function choose(e: ConsoleEndpoint) {
    setValue(e.sample);
    setListOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  const statusLine =
    !res || res.kind === "error" ? null : (
      <>
        <span className={`inline-flex items-center gap-2 font-semibold ${res.ok ? "text-codeok" : "text-codedanger"}`}>
          <span className={`h-2 w-2 ${res.ok ? "bg-codeok" : "bg-codedanger"}`} aria-hidden />
          {res.status} {res.ok ? "OK" : "gagal"}
        </span>
        <span className="tnum">{res.ms} ms</span>
        <span className="hidden sm:inline">{res.type}</span>
      </>
    );

  return (
    <div className="border border-control bg-card">
      <form
        className="p-4 sm:p-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send();
        }}
      >
        <label htmlFor={`${uid}-input`} className="block text-sm font-semibold">
          Coba satu endpoint
        </label>
        <p id={`${uid}-hint`} className="mt-1 text-sm text-muted">
          Ketik nama fitur untuk mencari, lalu tekan Enter. Permintaan dikirim sungguhan.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <div className="flex items-stretch border border-control bg-bg focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <span className="flex items-center border-r border-line px-3 font-mono text-sm font-bold text-ok">GET</span>
              <span className="flex items-center pl-3 font-mono text-base text-muted" aria-hidden>
                /api/
              </span>
              <input
                ref={inputRef}
                id={`${uid}-input`}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={listId}
                aria-activedescendant={showList && active >= 0 ? `${uid}-opt-${active}` : undefined}
                aria-describedby={`${uid}-hint`}
                value={value}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                enterKeyHint="send"
                onChange={(ev) => {
                  setValue(ev.target.value);
                  setListOpen(true);
                  setActive(-1);
                }}
                onBlur={() => setListOpen(false)}
                onKeyDown={(ev) => {
                  // Jangan tangkap Enter saat IME masih menyusun teks.
                  if (ev.nativeEvent.isComposing) return;
                  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
                    ev.preventDefault();
                    if (!showList) {
                      setListOpen(true);
                      setActive(0);
                      return;
                    }
                    const n = matches.length;
                    setActive((a) => (ev.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
                  } else if (ev.key === "Enter" && showList && active >= 0) {
                    ev.preventDefault();
                    choose(matches[active]);
                  } else if (ev.key === "Escape" && showList) {
                    ev.preventDefault();
                    setListOpen(false);
                  }
                }}
                className="ring-on-parent min-h-11 min-w-0 flex-1 bg-transparent py-2 pr-3 font-mono text-base text-fg"
              />
            </div>

            <ul id={listId} role="listbox" aria-label="Endpoint yang cocok" data-open={showList} className="panel absolute inset-x-0 top-full z-20 mt-1 border border-control bg-card">
              {matches.map((e, i) => (
                <li
                  key={e.path}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown agar pilihan terjadi sebelum input kehilangan fokus
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    choose(e);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === active ? "bg-subtle" : ""}`}
                >
                  <span className="wrap-anywhere font-mono text-sm">{e.path}</span>
                  <span className="shrink-0 text-sm text-muted">{e.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" disabled={loading || !clean} className="btn btn-primary sm:w-36">
            {loading ? <span className="spin h-4 w-4 rounded-full border-2 border-onaccent/30 border-t-onaccent" aria-hidden /> : <PlayIcon />}
            {loading ? "Mengirim" : "Kirim"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Contoh:</span>
          {picks.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => {
                setValue(p.sample);
                void send(p.sample);
              }}
              className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg transition-colors duration-150 hover:border-control hover:bg-subtle"
            >
              {p.sample}
            </button>
          ))}
        </div>
      </form>

      <div className="bg-code text-codefg">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-codeline pl-4 font-mono text-sm text-codemuted">
          <div role="status" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 py-2">
            {loading ? <span>Menunggu respons</span> : statusLine ?? <span>Contoh respons</span>}
          </div>
          {res && (res.kind === "json" || res.kind === "text") ? <CopyButton text={res.text} tone="code" /> : <CopyButton text={fullUrl} label="URL" tone="code" />}
        </div>

        <div tabIndex={0} role="region" aria-label="Isi respons" className="h-80 overflow-auto p-4 font-mono text-sm leading-relaxed">
          {loading ? (
            <div className="space-y-3" aria-hidden>
              {[62, 40, 78, 52, 30].map((w, i) => (
                <div key={i} className="h-3 animate-pulse bg-white/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : !res ? (
            <pre className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: colorizeJson(sample) }} />
          ) : res.kind === "error" ? (
            <p className="enter font-sans text-base text-codedanger">{res.message}</p>
          ) : res.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={res.src} alt="Gambar hasil permintaan" className="enter max-h-full max-w-full border border-codeline" />
          ) : res.kind === "video" ? (
            <video src={res.src} controls playsInline aria-label="Video hasil permintaan" className="enter max-h-full max-w-full border border-codeline bg-black" />
          ) : res.kind === "html" ? (
            <p className="enter font-sans text-base">
              Endpoint ini mengembalikan halaman HTML.{" "}
              <a href={res.href} target="_blank" rel="noopener" className="text-codeok underline underline-offset-4">
                Buka di tab baru
              </a>
            </p>
          ) : (
            <>
              {res.kind === "json" ? (
                <pre className="enter whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: colorizeJson(res.text) }} />
              ) : (
                <pre className="enter whitespace-pre-wrap">{res.text}</pre>
              )}
              {res.cut && <p className="mt-3 font-sans text-codemuted">Respons dipotong di {MAX_CHARS.toLocaleString("id-ID")} karakter. Salin URL untuk melihat seluruhnya.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
