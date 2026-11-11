"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EndpointMeta } from "@/lib/api/types";
import type { Category } from "@/lib/api/categories";
import { colorizeJson } from "@/lib/highlight";
import { buildSnippets } from "./code-tabs";
import { CopyButton, useOrigin } from "./client-utils";
import { CategoryIcon, ChevronIcon, PlayIcon, SearchIcon } from "./icons";

type Result = {
  ok: boolean;
  status: number;
  ms: number;
  type: string;
  text?: string;
  img?: string;
  frame?: string;
  size?: number;
  error?: string;
};

/** Gulir ke elemen dengan jarak aman dari header dan kolom pencarian yang menempel di atas. */
function scrollToEl(el: Element | null | undefined) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 148;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function EndpointCard({ e, fallback, forceOpen }: { e: EndpointMeta; fallback: string; forceOpen: boolean }) {
  const id = `${e.category}-${e.slug}`;
  const origin = useOrigin(fallback);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(e.params.map((p) => [p.name, p.example ?? ""])));
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [tab, setTab] = useState<"respons" | "kode">("respons");
  const [lang, setLang] = useState("cURL");
  const ref = useRef<HTMLElement>(null);
  const imgRef = useRef<string | null>(null);

  const isOpen = open || forceOpen;

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        setTimeout(() => scrollToEl(ref.current), 120);
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);

  useEffect(
    () => () => {
      if (imgRef.current) URL.revokeObjectURL(imgRef.current);
    },
    [],
  );

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    for (const p of e.params) if (values[p.name]?.trim()) sp.set(p.name, values[p.name].trim());
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [e.params, values]);

  const fullUrl = `${origin}${e.path}${query}`;
  const missing = e.params.filter((p) => p.required && !values[p.name]?.trim());

  const send = useCallback(async () => {
    setLoading(true);
    setTab("respons");
    const t0 = performance.now();
    try {
      const r = await fetch(`${e.path}${query}`);
      const type = r.headers.get("content-type") ?? "";
      const ms = Math.round(performance.now() - t0);
      if (imgRef.current) {
        URL.revokeObjectURL(imgRef.current);
        imgRef.current = null;
      }
      if (type.startsWith("image/")) {
        const blob = await r.blob();
        const img = URL.createObjectURL(blob);
        imgRef.current = img;
        setRes({ ok: r.ok, status: r.status, ms, type, img, size: blob.size });
      } else {
        const raw = await r.text();
        let text = raw;
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          /* bukan JSON */
        }
        const frame = r.ok && type.startsWith("text/html") ? `${e.path}${query}` : undefined;
        setRes({ ok: r.ok, status: r.status, ms, type, text, frame, size: raw.length });
      }
    } catch {
      setRes({ ok: false, status: 0, ms: Math.round(performance.now() - t0), type: "", error: "Tidak dapat terhubung ke server." });
    } finally {
      setLoading(false);
    }
  }, [e.path, query]);

  const snippets = buildSnippets(fullUrl);

  return (
    <article ref={ref} id={id} className={`scroll-mt-36 overflow-hidden rounded-2xl border bg-surface transition-colors duration-300 ${isOpen ? "border-linestrong" : "border-line hover:border-linestrong"}`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setOpen(!isOpen);
            if (!isOpen) history.replaceState(null, "", `#${id}`);
          }}
          className="flex w-full items-center gap-3 p-4 text-left sm:gap-4 sm:p-5"
        >
          <span className="shrink-0 rounded-md bg-mint/15 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-mint">GET</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-base font-semibold tracking-tight sm:text-lg">{e.title}</span>
              <code className="truncate font-mono text-xs text-muted">{e.path}</code>
            </span>
            <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted sm:line-clamp-1">{e.description}</span>
          </span>
          {e.kind === "image" && <span className="hidden rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-dim sm:block">image/*</span>}
          {e.kind === "html" && <span className="hidden rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-dim sm:block">text/html</span>}
          <ChevronIcon className={`shrink-0 text-dim transition-transform duration-300 ${isOpen ? "rotate-180 text-ember" : ""}`} />
        </button>
      </h3>

      <div id={`${id}-panel`} className={`accordion-panel ${isOpen ? "open" : ""}`} aria-hidden={!isOpen} inert={!isOpen}>
        <div>
          <div className="grid grid-cols-1 gap-px border-t border-line bg-line lg:grid-cols-2">
            {/* kiri: parameter */}
            <div className="min-w-0 space-y-5 bg-surface p-4 sm:p-6">
              <p className="text-sm leading-relaxed text-muted">{e.description}</p>

              {e.params.length ? (
                <div>
                  <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">Parameter query</h4>
                  <div className="mt-3 space-y-4">
                    {e.params.map((p) => (
                      <div key={p.name}>
                        <label htmlFor={`${id}-${p.name}`} className="flex items-center gap-2 text-sm">
                          <code className="font-mono text-[13px] text-fg">{p.name}</code>
                          {p.required ? (
                            <span className="rounded bg-ember/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ember">wajib</span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-dim">opsional</span>
                          )}
                        </label>
                        <p className="mt-1 text-xs text-muted">{p.description}</p>
                        {p.options ? (
                          <div id={`${id}-${p.name}`} role="group" aria-label={p.name} className="mt-2 flex flex-wrap gap-2">
                            {p.options.map((o) => {
                              const active = (values[p.name] ?? "") === o;
                              return (
                                <button
                                  key={o}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setValues((v) => ({ ...v, [p.name]: active && !p.required ? "" : o }))}
                                  className={`rounded-xl border px-3.5 py-2 font-mono text-[13px] transition-colors ${
                                    active ? "border-ember/60 bg-ember/15 text-fg" : "border-line bg-bg text-muted hover:border-ember/40 hover:text-fg"
                                  }`}
                                >
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            id={`${id}-${p.name}`}
                            value={values[p.name] ?? ""}
                            onChange={(ev) => setValues((v) => ({ ...v, [p.name]: ev.target.value }))}
                            onKeyDown={(ev) => ev.key === "Enter" && missing.length === 0 && send()}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder={p.example || p.name}
                            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 font-mono text-base text-fg outline-none transition-colors placeholder:text-dim focus:border-ember/60 sm:text-[13px]"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">Endpoint ini tidak membutuhkan parameter apa pun.</p>
              )}

              <div className="flex items-center gap-2 rounded-xl border border-line bg-bg py-1.5 pl-3.5 pr-1.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={fullUrl}>
                  {fullUrl}
                </code>
                <CopyButton text={fullUrl} label="URL" />
              </div>

              <button
                type="button"
                onClick={send}
                disabled={loading || missing.length > 0}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:w-auto"
              >
                {loading ? (
                  <span className="h-4 w-4 rounded-full border-2 border-bg/30 border-t-bg" style={{ animation: "spin 0.7s linear infinite" }} />
                ) : (
                  <PlayIcon />
                )}
                {loading ? "Mengirim…" : missing.length ? `Isi ${missing[0].name} dulu` : "Kirim permintaan"}
              </button>
            </div>

            {/* kanan: respons / kode */}
            <div className="flex min-h-[240px] min-w-0 flex-col bg-[#0d0b0a] lg:min-h-[320px]">
              <div className="flex items-center justify-between border-b border-line px-4">
                <div role="tablist" className="flex">
                  {(["respons", "kode"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`relative px-3 py-3.5 text-xs font-medium capitalize transition-colors ${tab === t ? "text-fg" : "text-dim hover:text-muted"}`}
                    >
                      {t}
                      <span className={`absolute inset-x-2 bottom-0 h-px bg-ember transition-opacity ${tab === t ? "opacity-100" : "opacity-0"}`} />
                    </button>
                  ))}
                </div>
                {tab === "respons" && res && (
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className={res.ok ? "text-mint" : "text-rose"}>● {res.status || "ERR"}</span>
                    <span className="text-dim">{res.ms} ms</span>
                  </div>
                )}
                {tab === "kode" && (
                  <div className="flex items-center gap-1">
                    <select
                      aria-label="Bahasa"
                      value={lang}
                      onChange={(ev) => setLang(ev.target.value)}
                      className="rounded-md border border-line bg-transparent px-2 py-1 text-xs text-muted outline-none"
                    >
                      {Object.keys(snippets).map((k) => (
                        <option key={k} value={k} className="bg-surface">
                          {k}
                        </option>
                      ))}
                    </select>
                    <CopyButton text={snippets[lang]} />
                  </div>
                )}
              </div>

              <div className="relative flex-1 overflow-auto p-4">
                {tab === "kode" ? (
                  <pre className="response-in whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed text-[#d8d0c3]">
                    <code>{snippets[lang]}</code>
                  </pre>
                ) : loading ? (
                  <div className="space-y-2.5 pt-1" aria-label="Memuat">
                    {[70, 45, 85, 55, 30].map((w, i) => (
                      <div key={i} className="h-3 animate-pulse rounded bg-white/[0.06]" style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />
                    ))}
                  </div>
                ) : !res ? (
                  <div className="grid h-full min-h-[160px] place-items-center text-center lg:min-h-[220px]">
                    <div>
                      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-line text-dim">
                        <PlayIcon />
                      </div>
                      <p className="mt-3 text-sm text-muted">Tekan &ldquo;Kirim permintaan&rdquo; untuk melihat hasilnya di sini.</p>
                    </div>
                  </div>
                ) : res.error ? (
                  <p className="response-in text-sm text-rose">{res.error}</p>
                ) : res.img ? (
                  <div className="response-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={res.img} alt={`Hasil ${e.title}`} className="max-h-[360px] max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(#1a1714_0%_25%,#141210_0%_50%)] [background-size:16px_16px]" />
                    <p className="mt-3 font-mono text-[11px] text-dim">
                      {res.type} · {((res.size ?? 0) / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : res.frame ? (
                  <div className="response-in">
                    <iframe
                      src={res.frame}
                      title={`Hasil ${e.title}`}
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                      className="aspect-video w-full rounded-lg border border-line bg-black"
                    />
                    <p className="mt-3 font-mono text-[11px] text-dim">
                      {res.type} · pratinjau langsung di dalam &lt;iframe&gt;
                    </p>
                  </div>
                ) : (
                  <pre
                    key={res.ms + (res.text?.length ?? 0)}
                    className="response-in whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[#cfc7ba]"
                    dangerouslySetInnerHTML={{ __html: colorizeJson((res.text ?? "").slice(0, 60000)) }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function DocsExplorer({ endpoints, categories, fallback, showGroupHeadings = true }: { endpoints: EndpointMeta[]; categories: Category[]; fallback: string; showGroupHeadings?: boolean }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      if (ev.key === "/" && !(ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement)) {
        ev.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      term
        ? endpoints.filter((e) => `${e.title} ${e.description} ${e.path} ${e.params.map((p) => p.name).join(" ")}`.toLowerCase().includes(term))
        : endpoints,
    [endpoints, term],
  );

  const groups = categories.map((c) => ({ c, items: filtered.filter((e) => e.category === c.id) })).filter((g) => g.items.length);

  // Kategori bisa dilipat seperti kartu endpoint. Awalnya hanya kategori pertama yang terbuka
  // supaya halaman tetap ringkas; pencarian dan tautan #hash membuka kategori terkait otomatis.
  const collapsible = showGroupHeadings && categories.length > 1;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(categories[0] ? [categories[0].id] : []));
  const allOpen = categories.every((c) => openGroups.has(c.id));
  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!collapsible) return;
    const check = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      const cat = categories.find((c) => hash === `grp-${c.id}` || hash.startsWith(`${c.id}-`));
      if (!cat) return;
      setOpenGroups((prev) => (prev.has(cat.id) ? prev : new Set(prev).add(cat.id)));
      // Gulir ulang setelah animasi buka selesai agar posisi kartu tepat.
      setTimeout(() => scrollToEl(document.getElementById(hash)), 520);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [collapsible, categories]);

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-1 bg-bg/80 px-1 py-3 backdrop-blur-xl">
        <div className="group relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim transition-colors group-focus-within:text-ember" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari endpoint, mis. cuaca"
            aria-label="Cari endpoint"
            className="w-full rounded-2xl border border-line bg-surface py-3.5 pl-12 pr-4 text-base text-fg outline-none transition-colors placeholder:text-dim focus:border-ember/60 sm:pr-16 sm:text-sm"
          />
          <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-dim sm:block">/</kbd>
        </div>
      </div>

      {collapsible && !term && (
        <div className="mt-1 flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-dim">Ketuk nama kategori untuk membuka atau menutupnya.</p>
          <button
            type="button"
            onClick={() => setOpenGroups(allOpen ? new Set() : new Set(categories.map((c) => c.id)))}
            className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-linestrong hover:text-fg"
          >
            {allOpen ? "Tutup semua" : "Buka semua"}
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="font-display text-xl">Tidak ada endpoint yang cocok</p>
          <p className="mt-2 text-sm text-muted">Coba kata kunci lain seperti &ldquo;gambar&rdquo;, &ldquo;teks&rdquo;, atau &ldquo;cuaca&rdquo;.</p>
        </div>
      ) : (
        <div className={collapsible ? "mt-5 space-y-3 [overflow-anchor:none]" : "mt-6 space-y-14"}>
          {groups.map(({ c, items }) => {
            const isOpen = !collapsible || !!term || openGroups.has(c.id);
            const cards = (
              <div className="space-y-3">
                {items.map((e) => (
                  <EndpointCard key={e.path} e={e} fallback={fallback} forceOpen={!!term && filtered.length === 1} />
                ))}
              </div>
            );
            if (!collapsible) {
              return (
                <section key={c.id} aria-labelledby={showGroupHeadings ? `grp-${c.id}` : undefined}>
                  {showGroupHeadings && (
                    <div className="mb-5 flex items-center gap-3 sm:gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ember">
                        <CategoryIcon id={c.id} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 id={`grp-${c.id}`} className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                          {c.name}
                        </h2>
                        <p className="text-sm text-muted">{c.tagline}</p>
                      </div>
                      <span className="ml-auto font-mono text-xs text-dim">{items.length}</span>
                    </div>
                  )}
                  {cards}
                </section>
              );
            }
            return (
              <section
                key={c.id}
                aria-labelledby={`grp-${c.id}`}
                className={`scroll-mt-36 rounded-3xl border transition-colors duration-300 ${isOpen ? "border-line bg-white/[0.015]" : "border-line/70 hover:border-linestrong"}`}
              >
                <h2 id={`grp-${c.id}`} className="scroll-mt-36">
                  <button
                    type="button"
                    onClick={() => toggleGroup(c.id)}
                    aria-expanded={isOpen}
                    aria-controls={`grp-panel-${c.id}`}
                    disabled={!!term}
                    className="flex w-full items-center gap-3 rounded-3xl px-4 py-4 text-left sm:gap-4 sm:px-5"
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-surface transition-colors duration-300 ${isOpen ? "border-ember/40 text-ember" : "border-line text-dim"}`}>
                      <CategoryIcon id={c.id} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-semibold tracking-tight sm:text-xl">{c.name}</span>
                      <span className="block truncate text-sm font-normal text-muted">{c.tagline}</span>
                    </span>
                    <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] font-normal text-dim">
                      {items.length}
                      <span className="hidden sm:inline"> endpoint</span>
                    </span>
                    {!term && <ChevronIcon className={`shrink-0 text-dim transition-transform duration-300 ${isOpen ? "rotate-180 text-ember" : ""}`} />}
                  </button>
                </h2>
                <div id={`grp-panel-${c.id}`} className={`accordion-panel ${isOpen ? "open" : ""}`} inert={!isOpen}>
                  <div>
                    <div className="px-3 pb-4 sm:px-4">{cards}</div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
