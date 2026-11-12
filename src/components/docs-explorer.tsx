"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: calm ? "auto" : "smooth" });
}

function EndpointCard({ e, fallback, forceOpen }: { e: EndpointMeta; fallback: string; forceOpen: boolean }) {
  const id = `${e.category}-${e.slug}`;
  const origin = useOrigin(fallback);
  const [open, setOpen] = useState(false);
  // Isi playground baru dipasang saat kartu pertama kali dibuka agar halaman dengan ratusan kartu tetap ringan.
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(e.params.map((p) => [p.name, p.example ?? ""])));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [tab, setTab] = useState<"respons" | "kode">("respons");
  const [lang, setLang] = useState("cURL");
  const ref = useRef<HTMLElement>(null);
  const imgRef = useRef<string | null>(null);

  const isOpen = open || forceOpen;
  const showPanel = mounted || isOpen;

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) {
        setMounted(true);
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
      setRes({ ok: false, status: 0, ms: Math.round(performance.now() - t0), type: "", error: "Tidak dapat terhubung ke server. Periksa koneksimu, lalu kirim lagi." });
    } finally {
      setLoading(false);
    }
  }, [e.path, query]);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (loading) return;
    if (missing.length) {
      // Tandai semua kolom wajib yang kosong dan pindahkan fokus ke yang pertama.
      setTouched(Object.fromEntries(missing.map((p) => [p.name, true])));
      const first = document.getElementById(`${id}-${missing[0].name}`);
      (first instanceof HTMLInputElement ? first : first?.querySelector("button"))?.focus();
      return;
    }
    void send();
  };

  const snippets = buildSnippets(fullUrl);

  return (
    <article ref={ref} id={id} className={`scroll-mt-36 border bg-card transition-colors duration-150 ${isOpen ? "border-control" : "border-line hover:border-control"}`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setMounted(true);
            setOpen(!isOpen);
            if (!isOpen) history.replaceState(null, "", `#${id}`);
          }}
          className="flex min-h-14 w-full items-start gap-3 p-3 text-left sm:gap-4 sm:p-4"
        >
          <span className="mt-0.5 shrink-0 font-mono text-sm font-bold text-ok">GET</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-base font-semibold">{e.title}</span>
              <code className="wrap-anywhere font-mono text-sm text-muted">{e.path}</code>
            </span>
            <span className="mt-1 block text-sm text-muted">{e.description}</span>
          </span>
          {e.kind !== "json" && <span className="mt-0.5 hidden shrink-0 border border-line px-2 font-mono text-xs text-muted sm:block">{e.kind === "image" ? "gambar" : "HTML"}</span>}
          <ChevronIcon className="chev mt-0.5 shrink-0 text-muted" />
        </button>
      </h3>

      <div id={`${id}-panel`} data-open={isOpen} className="panel">
        {showPanel && (
          <div className="grid grid-cols-1 border-t border-line lg:grid-cols-2">
            {/* kiri: parameter */}
            <form onSubmit={onSubmit} noValidate className="min-w-0 space-y-5 p-4 sm:p-5">
              {e.params.length ? (
                <fieldset className="space-y-4">
                  <legend className="text-sm font-semibold">Parameter query</legend>
                  {e.params.map((p) => {
                    const fid = `${id}-${p.name}`;
                    const invalid = !!p.required && !!touched[p.name] && !values[p.name]?.trim();
                    return (
                      <div key={p.name}>
                        <label htmlFor={p.options ? undefined : fid} id={`${fid}-label`} className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-sm font-bold">{p.name}</code>
                          <span className={`text-xs ${p.required ? "font-semibold text-fg" : "text-muted"}`}>{p.required ? "wajib" : "opsional"}</span>
                        </label>
                        <p id={`${fid}-help`} className="mt-1 text-sm text-muted">
                          {p.description}
                        </p>
                        {p.options ? (
                          <div id={fid} role="group" aria-labelledby={`${fid}-label`} aria-describedby={`${fid}-help`} className="mt-2 flex flex-wrap gap-2">
                            {p.options.map((o) => {
                              const active = (values[p.name] ?? "") === o;
                              return (
                                <button
                                  key={o}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setValues((v) => ({ ...v, [p.name]: active && !p.required ? "" : o }))}
                                  className={`min-h-11 border px-3 font-mono text-sm transition-colors duration-150 ${
                                    active ? "border-fg bg-fg text-bg" : "border-control bg-card text-fg hover:bg-subtle"
                                  }`}
                                >
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            id={fid}
                            value={values[p.name] ?? ""}
                            onChange={(ev) => setValues((v) => ({ ...v, [p.name]: ev.target.value }))}
                            onBlur={() => setTouched((t) => ({ ...t, [p.name]: true }))}
                            required={p.required}
                            aria-invalid={invalid}
                            aria-describedby={invalid ? `${fid}-error ${fid}-help` : `${fid}-help`}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="none"
                            placeholder={p.example ? `mis. ${p.example}` : undefined}
                            className="field mt-2"
                          />
                        )}
                        {invalid && (
                          <p id={`${fid}-error`} role="alert" className="mt-1 text-sm font-medium text-danger">
                            Parameter {p.name} wajib diisi.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </fieldset>
              ) : (
                <p className="text-sm text-muted">Endpoint ini tidak membutuhkan parameter.</p>
              )}

              <div className="flex items-center border border-line bg-bg">
                <code className="wrap-anywhere min-w-0 flex-1 px-3 py-2 font-mono text-sm text-muted">{fullUrl}</code>
                <CopyButton text={fullUrl} label="URL" />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full sm:w-auto">
                {loading ? <span className="spin h-4 w-4 rounded-full border-2 border-onaccent/30 border-t-onaccent" aria-hidden /> : <PlayIcon />}
                {loading ? "Mengirim" : "Kirim permintaan"}
              </button>
            </form>

            {/* kanan: respons / kode */}
            <div className="flex min-w-0 flex-col bg-code text-codefg">
              <div className="flex items-stretch justify-between gap-2 border-b border-codeline">
                <div role="tablist" aria-label="Tampilan hasil" className="flex">
                  {(["respons", "kode"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      id={`${id}-tab-${t}`}
                      aria-selected={tab === t}
                      aria-controls={`${id}-out`}
                      onClick={() => setTab(t)}
                      className={`relative min-h-11 px-4 text-sm font-medium capitalize transition-colors duration-150 ${tab === t ? "text-codefg" : "text-codemuted hover:text-codefg"}`}
                    >
                      {t}
                      {tab === t && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden />}
                    </button>
                  ))}
                </div>
                {tab === "respons" ? (
                  <div role="status" className="flex items-center gap-3 pr-4 font-mono text-sm text-codemuted">
                    {loading ? (
                      <span>Menunggu respons</span>
                    ) : res ? (
                      <>
                        <span className={`inline-flex items-center gap-2 font-semibold ${res.ok ? "text-codeok" : "text-codedanger"}`}>
                          <span className={`h-2 w-2 ${res.ok ? "bg-codeok" : "bg-codedanger"}`} aria-hidden />
                          {res.status ? `${res.status} ${res.ok ? "OK" : "gagal"}` : "Gagal"}
                        </span>
                        <span className="tnum">{res.ms} ms</span>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center">
                    <select
                      aria-label="Bahasa contoh kode"
                      value={lang}
                      onChange={(ev) => setLang(ev.target.value)}
                      className="min-h-11 border-l border-codeline bg-code px-3 text-sm text-codefg"
                    >
                      {Object.keys(snippets).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <CopyButton text={snippets[lang]} tone="code" />
                  </div>
                )}
              </div>

              <div id={`${id}-out`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="max-h-[28rem] min-h-60 flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
                {tab === "kode" ? (
                  <pre key={lang} className="enter wrap-anywhere whitespace-pre-wrap">
                    <code>{snippets[lang]}</code>
                  </pre>
                ) : loading ? (
                  <div className="space-y-3" aria-hidden>
                    {[70, 45, 85, 55, 30].map((w, i) => (
                      <div key={i} className="h-3 animate-pulse bg-white/10" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : !res ? (
                  <p className="font-sans text-base text-codemuted">Respons muncul di sini setelah kamu menekan &ldquo;Kirim permintaan&rdquo;.</p>
                ) : res.error ? (
                  <p className="enter font-sans text-base text-codedanger">{res.error}</p>
                ) : res.img ? (
                  <div className="enter">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={res.img} alt={`Hasil ${e.title}`} className="max-h-80 max-w-full border border-codeline bg-white/5" />
                    <p className="tnum mt-3 text-codemuted">
                      {res.type} · {((res.size ?? 0) / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : res.frame ? (
                  <div className="enter">
                    <iframe
                      src={res.frame}
                      title={`Hasil ${e.title}`}
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                      className="aspect-video w-full border border-codeline bg-black"
                    />
                    <p className="mt-3 text-codemuted">{res.type} · pratinjau langsung di dalam &lt;iframe&gt;</p>
                  </div>
                ) : (
                  <pre
                    key={res.ms + (res.text?.length ?? 0)}
                    className="enter wrap-anywhere whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: colorizeJson((res.text ?? "").slice(0, 60000)) }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
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
      // Gulir ulang setelah kategori terbuka agar posisi kartu tepat.
      setTimeout(() => scrollToEl(document.getElementById(hash)), 260);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [collapsible, categories]);

  return (
    <div>
      <div className="sticky top-[var(--header-h)] z-30 -mx-4 bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex items-stretch border border-control bg-card focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <label htmlFor="cari-endpoint" className="flex items-center gap-2 pl-3 text-sm font-medium text-muted">
            <SearchIcon />
            Cari
          </label>
          <input
            ref={input}
            id="cari-endpoint"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="mis. cuaca, tiktok, qrcode"
            autoComplete="off"
            enterKeyHint="search"
            className="ring-on-parent min-h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-fg placeholder:text-muted"
          />
          <kbd className="mr-3 hidden self-center border border-line px-2 font-mono text-xs text-muted sm:block" title="Tekan / untuk mencari">
            /
          </kbd>
        </div>
      </div>

      <div className="mt-1 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="text-sm text-muted">
          {term ? `${filtered.length} endpoint cocok dengan “${q.trim()}”` : collapsible ? "Pilih kategori untuk melihat endpoint di dalamnya." : `${endpoints.length} endpoint`}
        </p>
        {collapsible && !term && (
          <button type="button" onClick={() => setOpenGroups(allOpen ? new Set() : new Set(categories.map((c) => c.id)))} className="btn btn-secondary shrink-0 text-sm">
            {allOpen ? "Tutup semua" : "Buka semua"}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 border border-line bg-card px-4 py-12 text-center sm:px-6">
          <p className="font-mono text-lg font-bold">Tidak ada endpoint yang cocok</p>
          <p className="mx-auto mt-2 max-w-[50ch] text-muted">Coba kata kunci yang lebih pendek, seperti &ldquo;gambar&rdquo;, &ldquo;teks&rdquo;, atau &ldquo;cuaca&rdquo;.</p>
          <button
            type="button"
            onClick={() => {
              setQ("");
              input.current?.focus();
            }}
            className="btn btn-secondary mt-6"
          >
            Hapus pencarian
          </button>
        </div>
      ) : (
        <div className={collapsible ? "mt-3 space-y-2 [overflow-anchor:none]" : "mt-3 space-y-10"}>
          {groups.map(({ c, items }) => {
            const isOpen = !collapsible || !!term || openGroups.has(c.id);
            const cards = (
              <div className="space-y-2">
                {items.map((e) => (
                  <EndpointCard key={e.path} e={e} fallback={fallback} forceOpen={!!term && filtered.length === 1} />
                ))}
              </div>
            );
            if (!collapsible) {
              return (
                <section key={c.id} aria-labelledby={showGroupHeadings ? `grp-${c.id}` : undefined}>
                  {showGroupHeadings && (
                    <div className="mb-4 flex items-center gap-3">
                      <CategoryIcon id={c.id} className="h-6 w-6 shrink-0 text-ok" />
                      <div className="min-w-0 flex-1">
                        <h2 id={`grp-${c.id}`} className="font-mono text-xl font-bold">
                          {c.name}
                        </h2>
                        <p className="text-sm text-muted">{c.tagline}</p>
                      </div>
                      <span className="tnum font-mono text-sm text-muted">{items.length}</span>
                    </div>
                  )}
                  {cards}
                </section>
              );
            }
            return (
              <section key={c.id} aria-labelledby={`grp-${c.id}`} className="scroll-mt-36">
                <h2 id={`grp-${c.id}`} className="scroll-mt-36">
                  <button
                    type="button"
                    onClick={() => toggleGroup(c.id)}
                    aria-expanded={isOpen}
                    aria-controls={`grp-panel-${c.id}`}
                    disabled={!!term}
                    className={`flex min-h-16 w-full items-center gap-3 border px-3 py-2 text-left transition-colors duration-150 sm:gap-4 sm:px-4 ${
                      isOpen ? "border-control bg-subtle" : "border-line bg-card hover:border-control hover:bg-subtle"
                    }`}
                  >
                    <CategoryIcon id={c.id} className="h-6 w-6 shrink-0 text-ok" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-base font-bold sm:text-lg">{c.name}</span>
                      <span className="block text-sm font-normal text-muted">{c.tagline}</span>
                    </span>
                    <span className="tnum shrink-0 font-mono text-sm font-normal text-muted">
                      {items.length}
                      <span className="hidden sm:inline"> endpoint</span>
                    </span>
                    {!term && <ChevronIcon className="chev shrink-0 text-muted" />}
                  </button>
                </h2>
                <div id={`grp-panel-${c.id}`} data-open={isOpen} className="panel pt-2">
                  {cards}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
