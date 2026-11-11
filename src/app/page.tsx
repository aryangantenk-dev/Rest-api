import Link from "next/link";
import type { Metadata } from "next";
import { BaseUrlBox, LiveRequests } from "@/components/client-utils";
import { CodeTabs } from "@/components/code-tabs";
import { HeroTerminal } from "@/components/hero-terminal";
import { ArrowIcon, CategoryIcon } from "@/components/icons";
import { CountUp, Reveal, SpotlightCard } from "@/components/motion";
import { categories } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const headline = ["REST", "API", "gratis", "untuk", "segala", "kebutuhan", "developer."];

const features = [
  { t: "Tanpa API key", d: "Tidak ada pendaftaran, token, atau kuota yang membingungkan. Salin URL-nya, langsung jalan." },
  { t: "CORS terbuka", d: "Panggil dari browser, aplikasi mobile, bot WhatsApp atau Telegram, bahkan dari file HTML lokal." },
  { t: "Format respons seragam", d: "Setiap endpoint JSON mengembalikan status, creator, dan result sehingga parser-mu cukup ditulis sekali." },
  { t: "Playground interaktif", d: "Setiap endpoint punya form uji coba dan contoh kode siap salin di cURL, JavaScript, Python, dan PHP." },
  { t: "Gambar dibuat langsung", d: "QR Code, avatar, dan placeholder dirender sebagai PNG saat diminta, tanpa penyimpanan file." },
  { t: "Pesan error yang jelas", d: "Parameter salah? Kamu akan mendapat kode HTTP yang tepat beserta penjelasan dalam bahasa Indonesia." },
];

const faqs = [
  { q: "Apakah Yanxz API benar-benar gratis dan tanpa API key?", a: "Ya. Semua endpoint bisa dipanggil langsung tanpa registrasi maupun API key. Untuk menjaga kualitas layanan, berlaku batas 45 permintaan per menit untuk setiap alamat IP. IP yang berulang kali melewati batas akan diblokir dan bisa mengajukan banding ke owner lewat WhatsApp." },
  { q: "Bagaimana format respons yang dikembalikan?", a: "Endpoint data mengembalikan JSON dengan pola { status, creator, result }. Bila terjadi kesalahan, kamu menerima { status: false, code, error } disertai kode HTTP yang sesuai. Endpoint kategori Image dan beberapa endpoint tools mengembalikan file gambar PNG secara langsung." },
  { q: "Bolehkah dipakai untuk bot WhatsApp, Telegram, atau Discord?", a: "Tentu. CORS terbuka dan responsnya ringan sehingga cocok dipakai pada bot, aplikasi web, dan proyek hobi. Mohon tidak menyalahgunakannya untuk spam atau aktivitas yang melanggar hukum." },
  { q: "Dari mana data cuaca, gempa, dan jadwal sholat berasal?", a: "Gempa diambil langsung dari BMKG, cuaca dari Open-Meteo, dan jadwal sholat serta Al-Qur'an dari layanan terbuka yang terpercaya. Yanxz API merapikan datanya agar konsisten dan mudah dipakai." },
  { q: "Bagaimana jika sebuah endpoint mengalami gangguan?", a: "Endpoint yang bergantung pada layanan pihak ketiga akan mengembalikan kode 502 atau 504 beserta penjelasan. Coba lagi beberapa saat kemudian; endpoint lain tidak terpengaruh." },
  { q: "Bagaimana cara menyarankan endpoint baru?", a: "Katalog terus bertambah. Pilih kategori yang paling dekat di dokumentasi dan pantau pembaruannya di halaman ini." },
];

export default function Home() {
  const meta = allMeta();
  const chips = meta.map((e) => e.path);
  const half = Math.ceil(chips.length / 2);
  const rows = [chips.slice(0, half), chips.slice(half)];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: `${SITE_NAME} — REST API Gratis Tanpa API Key`,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        inLanguage: "id-ID",
      },
      {
        "@type": "WebAPI",
        name: SITE_NAME,
        description: "REST API gratis tanpa API key dengan ratusan fitur untuk developer Indonesia.",
        documentation: `${SITE_URL}/docs`,
        url: `${SITE_URL}/api`,
        provider: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      {/* ───────── HERO ───────── */}
      <section className="grain relative isolate overflow-hidden pt-32 sm:pt-40">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="aurora aurora-1 -left-40 -top-40 h-[620px] w-[620px]" />
          <div className="aurora aurora-2 right-[-12%] top-10 h-[540px] w-[540px]" />
          <div className="aurora aurora-3 bottom-[-10%] left-[30%] h-[460px] w-[460px]" />
          <div className="grid-lines absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <div className="fade-up inline-flex items-center gap-2.5 rounded-full border border-linestrong bg-white/[0.03] py-1.5 pl-3 pr-4 text-xs text-muted backdrop-blur">
              <span className="live-dot" />
              <span>Semua layanan operasional</span>
              <span className="h-3 w-px bg-line" />
              <span className="font-mono text-fg">v1.0</span>
            </div>

            <h1 className="mt-7 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.4rem]">
              {headline.map((w, i) => (
                <span key={i}>
                  <span
                    className={`word ${w === "segala" ? "font-serif font-normal italic text-ember-gradient pr-1" : ""} ${w === "gratis" ? "text-ember-gradient" : ""}`}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    {w}
                  </span>{" "}
                </span>
              ))}
            </h1>

            <p className="fade-up mt-6 max-w-xl text-base leading-relaxed text-muted sm:mt-7 sm:text-lg" style={{ "--d": "700ms" } as React.CSSProperties}>
              Yanxz API menyatukan puluhan fitur dalam satu base URL: AI, QR Code, cuaca, gempa BMKG, Al-Qur&apos;an, kurs, dan banyak lagi. Tanpa
              API key, tanpa daftar, tinggal panggil.
            </p>

            <div className="fade-up mt-9" style={{ "--d": "850ms" } as React.CSSProperties}>
              <BaseUrlBox fallback={SITE_URL} />
            </div>

            <div className="fade-up mt-8 flex flex-wrap items-center gap-3" style={{ "--d": "1000ms" } as React.CSSProperties}>
              <Link href="/docs" className="btn-primary group inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold sm:w-auto">
                Jelajahi dokumentasi
                <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="#mulai" className="btn-ghost w-full rounded-full px-7 py-3.5 text-center text-sm font-medium text-fg sm:w-auto">
                Lihat cara pakai
              </Link>
            </div>
          </div>

          <div className="fade-up relative" style={{ "--d": "600ms" } as React.CSSProperties}>
            <div className="float-slow">
              <HeroTerminal />
            </div>
          </div>
        </div>

        {/* statistik */}
        <div className="mx-auto mt-16 max-w-7xl px-5 sm:mt-24 sm:px-8">
          <dl className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
            {[
              { k: "Endpoint aktif", v: <CountUp to={meta.length} /> },
              { k: "Kategori", v: <CountUp to={categories.length} /> },
              { k: "API key dibutuhkan", v: <span>0</span> },
              { k: "Total permintaan dilayani", v: <LiveRequests /> },
            ].map((s, i) => (
              <div key={s.k} className={`px-2 py-8 sm:px-6 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <dd className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{s.v}</dd>
                <dt className="mt-2 text-sm text-muted">{s.k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────── MARQUEE ───────── */}
      <section className="marquee-wrap marquee-mask mt-16 space-y-3 overflow-hidden" aria-hidden>
        {rows.map((row, r) => (
          <div key={r} className={`marquee ${r === 1 ? "rev" : ""}`}>
            {[...row, ...row].map((p, i) => (
              <span key={i} className="mx-1.5 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface/60 px-4 py-2 font-mono text-xs text-muted">
                <span className="text-mint">GET</span>
                {p}
              </span>
            ))}
          </div>
        ))}
      </section>

      {/* ───────── KATEGORI ───────── */}
      <section id="kategori" className="mx-auto mt-20 max-w-7xl px-5 sm:mt-28 sm:px-8 lg:mt-36">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ember">01 — Kategori</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Satu base URL, <span className="font-serif font-normal italic text-muted">tujuh</span> kategori yang saling melengkapi.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {categories.map((c, i) => {
            const items = meta.filter((e) => e.category === c.id);
            const spans = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4", "lg:col-span-5", "lg:col-span-7"];
            return (
              <Reveal key={c.id} delay={(i % 3) * 90} className={spans[i]}>
                <SpotlightCard className="group h-full rounded-3xl p-7 sm:p-8">
                  <div className="flex items-start justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface2 text-ember transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                      <CategoryIcon id={c.id} className="h-6 w-6" />
                    </span>
                    <span className="font-mono text-xs text-dim">{String(items.length).padStart(2, "0")} endpoint</span>
                  </div>
                  <h3 className="mt-8 font-display text-2xl font-semibold tracking-tight">
                    <Link href={`/docs/${c.id}`} className="after:absolute after:inset-0 after:content-['']">
                      {c.name}
                    </Link>
                  </h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{c.description}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {items.slice(0, 4).map((e) => (
                      <span key={e.slug} className="rounded-md bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-muted">
                        /{e.slug}
                      </span>
                    ))}
                    {items.length > 4 && <span className="rounded-md px-2 py-1 font-mono text-[11px] text-dim">+{items.length - 4}</span>}
                  </div>
                  <div className="mt-7 flex items-center gap-2 text-sm font-medium text-fg">
                    Buka dokumentasi
                    <ArrowIcon className="h-4 w-4 text-ember transition-transform duration-300 group-hover:translate-x-1.5" />
                  </div>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ───────── CARA PAKAI ───────── */}
      <section id="mulai" className="mx-auto mt-24 max-w-7xl px-5 sm:mt-32 sm:px-8 lg:mt-40">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-ember">02 — Cara pakai</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Dari nol ke respons <span className="font-serif font-normal italic text-muted">dalam satu menit.</span>
            </h2>
            <ol className="mt-12 space-y-0">
              {[
                { t: "Pilih endpoint", d: "Cari fitur yang kamu butuhkan di dokumentasi, lalu lihat parameter yang diperlukan." },
                { t: "Kirim permintaan GET", d: "Tempel base URL, tambahkan path dan query string. Tidak ada header khusus atau autentikasi." },
                { t: "Terima hasilnya", d: "Ambil field result dari JSON, atau langsung tampilkan gambarnya di tag <img>." },
              ].map((s, i) => (
                <li key={s.t} className="group relative flex gap-6 border-t border-line py-7 last:border-b">
                  <span className="font-mono text-sm text-dim transition-colors group-hover:text-ember">0{i + 1}</span>
                  <div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">{s.t}</h3>
                    <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={150} className="space-y-4 lg:sticky lg:top-28">
            <CodeTabs fallback={SITE_URL} path="/api/random/quote" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3 font-mono text-[11px]">
                <span className="text-mint">● 200 OK</span>
                <span className="text-dim">application/json</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-[#cfc7ba]">
                <code>
                  {"{\n  "}
                  <span className="json-key">&quot;status&quot;</span>: <span className="json-bool">true</span>,{"\n  "}
                  <span className="json-key">&quot;creator&quot;</span>: <span className="json-str">&quot;Yanxz&quot;</span>,{"\n  "}
                  <span className="json-key">&quot;result&quot;</span>
                  {": {\n    "}
                  <span className="json-key">&quot;quote&quot;</span>: <span className="json-str">&quot;Perjalanan seribu mil dimulai dengan satu langkah.&quot;</span>,{"\n    "}
                  <span className="json-key">&quot;author&quot;</span>: <span className="json-str">&quot;Lao Tzu&quot;</span>
                  {"\n  }\n}"}
                </code>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── KEUNGGULAN ───────── */}
      <section className="mx-auto mt-24 max-w-7xl px-5 sm:mt-32 sm:px-8 lg:mt-40">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ember">03 — Keunggulan</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Dirancang supaya kamu fokus membangun, <span className="font-serif font-normal italic text-muted">bukan mengurus akses.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 80} className="group border-b border-line p-7 transition-colors hover:bg-white/[0.02] sm:p-9 lg:[&:not(:nth-child(3n+1))]:border-l">
              <span className="font-mono text-xs text-dim">0{i + 1}</span>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-tight transition-colors group-hover:text-ember">{f.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="mx-auto mt-24 max-w-4xl px-5 sm:mt-32 sm:px-8 lg:mt-40">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ember">04 — FAQ</p>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Pertanyaan yang sering muncul</h2>
        </Reveal>
        <div className="mt-12 border-t border-line">
          {faqs.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <details className="group border-b border-line">
                <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-left">
                  <h3 className="font-display text-lg font-medium tracking-tight transition-colors group-hover:text-ember sm:text-xl">{f.q}</h3>
                  <span className="faq-plus grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-lg leading-none text-muted transition-transform duration-300">+</span>
                </summary>
                <p className="pb-7 pr-12 text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="mx-auto mt-24 max-w-7xl px-5 sm:mt-32 sm:px-8 lg:mt-40">
        <Reveal>
          <div className="grain relative isolate overflow-hidden rounded-[2rem] border border-linestrong bg-surface px-6 py-14 text-center sm:px-16 sm:py-20">
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
              <div className="aurora aurora-1 left-[-10%] top-[-60%] h-[420px] w-[420px]" />
              <div className="aurora aurora-2 bottom-[-70%] right-[-5%] h-[420px] w-[420px]" />
              <div className="grid-lines absolute inset-0 opacity-60" />
            </div>
            <h2 className="mx-auto max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              Mulai dengan <span className="font-serif font-normal italic text-ember-gradient">satu request.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-muted">Buka dokumentasi, pilih endpoint, tekan tombol kirim. Hasilnya langsung muncul di layar.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/docs" className="btn-primary group inline-flex w-full items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold sm:w-auto">
                Buka dokumentasi
                <ArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <a href="/api" className="btn-ghost w-full rounded-full px-8 py-4 text-sm font-medium sm:w-auto">
                Lihat indeks JSON
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
