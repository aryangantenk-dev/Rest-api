import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { BaseUrlBox, LiveRequests } from "@/components/client-utils";
import { CodeTabs } from "@/components/code-tabs";
import { ArrowIcon, CategoryIcon, ChevronIcon, ExternalIcon } from "@/components/icons";
import { Stagger } from "@/components/motion";
import { TryConsole, type ConsoleEndpoint } from "@/components/try-console";
import { categories } from "@/lib/api/categories";
import { allMeta } from "@/lib/api/registry";
import { APPEAL_URL } from "@/lib/guard";
import { colorizeJson } from "@/lib/highlight";
import { RATE_LIMIT } from "@/lib/limits";
import { SITE_CREATOR, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const steps = [
  { t: "Pilih endpoint", d: "Cari fitur yang kamu butuhkan di dokumentasi, lalu lihat parameter yang diperlukan." },
  { t: "Kirim permintaan GET", d: "Tempel base URL, tambahkan path dan query string. Tidak ada header khusus atau autentikasi." },
  { t: "Terima hasilnya", d: "Ambil field result dari JSON, atau langsung tampilkan gambarnya di tag <img>." },
];

const features = [
  { t: "Tanpa API key", d: "Tidak ada pendaftaran, token, atau kuota tersembunyi. Salin URL-nya, langsung jalan." },
  { t: "CORS terbuka", d: "Panggil dari browser, aplikasi mobile, bot WhatsApp atau Telegram, bahkan dari file HTML lokal." },
  { t: "Format respons seragam", d: "Setiap endpoint JSON mengembalikan status, creator, dan result, jadi parser cukup ditulis sekali." },
  { t: "Playground di setiap endpoint", d: "Ada form uji coba dan contoh kode siap salin untuk cURL, JavaScript, Python, dan PHP." },
  { t: "Gambar dibuat saat diminta", d: "QR Code, avatar, kartu canvas, dan placeholder dirender sebagai PNG tanpa penyimpanan file." },
  { t: "Pesan error yang jelas", d: "Parameter salah? Kamu mendapat kode HTTP yang tepat beserta penjelasan dalam bahasa Indonesia." },
];

const faqs = [
  { q: `Apakah ${SITE_NAME} benar-benar gratis dan tanpa API key?`, a: `Ya. Semua endpoint bisa dipanggil langsung tanpa registrasi maupun API key. Untuk menjaga kualitas layanan, berlaku batas ${RATE_LIMIT} permintaan per menit untuk setiap alamat IP. IP yang berulang kali melewati batas akan diblokir dan bisa mengajukan banding ke owner lewat WhatsApp.` },
  { q: "Bagaimana format respons yang dikembalikan?", a: "Endpoint data mengembalikan JSON dengan pola { status, creator, result }. Bila terjadi kesalahan, kamu menerima { status: false, code, error } disertai kode HTTP yang sesuai. Endpoint kategori Image, Canvas, dan beberapa endpoint tools mengembalikan file gambar PNG secara langsung." },
  { q: "Bolehkah dipakai untuk bot WhatsApp, Telegram, atau Discord?", a: "Tentu. CORS terbuka dan responsnya ringan sehingga cocok dipakai pada bot, aplikasi web, dan proyek hobi. Mohon tidak menyalahgunakannya untuk spam atau aktivitas yang melanggar hukum." },
  { q: "Dari mana data cuaca, gempa, dan jadwal sholat berasal?", a: `Gempa diambil langsung dari BMKG, cuaca dari Open-Meteo, dan jadwal sholat serta Al-Qur'an dari layanan terbuka yang terpercaya. ${SITE_NAME} merapikan datanya agar konsisten dan mudah dipakai.` },
  { q: "Bagaimana jika sebuah endpoint mengalami gangguan?", a: "Endpoint yang bergantung pada layanan pihak ketiga akan mengembalikan kode 502 atau 504 beserta penjelasan. Coba lagi beberapa saat kemudian; endpoint lain tidak terpengaruh." },
  { q: "Bagaimana cara menyarankan endpoint baru?", a: "Kirim usulanmu ke owner lewat WhatsApp. Tautannya ada di bagian bawah halaman ini." },
];

const sampleResponse = JSON.stringify({ status: true, creator: SITE_CREATOR, result: { quote: "Perjalanan seribu mil dimulai dengan satu langkah.", author: "Lao Tzu" } }, null, 2);

const pickPaths = ["random/quote", "info/gempa", "islami/sholat", "info/cuaca"];

export default function Home() {
  const meta = allMeta();

  const consoleList: ConsoleEndpoint[] = meta
    .filter((e) => e.kind !== "html")
    .map((e) => {
      const path = e.path.replace(/^\/api\//, "");
      const sp = new URLSearchParams();
      for (const p of e.params) if (p.required && p.example) sp.set(p.name, p.example);
      const qs = sp.toString();
      return { path, title: e.title, sample: qs ? `${path}?${qs}` : path };
    });
  const picks = pickPaths.map((p) => consoleList.find((e) => e.path === p)).filter((e): e is ConsoleEndpoint => !!e);

  const facts = [
    { k: "Endpoint aktif", v: meta.length.toLocaleString("id-ID") },
    { k: "Kategori", v: String(categories.length) },
    { k: "Batas per IP", v: `${RATE_LIMIT} / menit` },
  ];

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
      {/* ───────── Pembuka: judul + konsol uji coba ───────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:pb-24 lg:pt-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10">
          <div className="lg:col-span-5">
            <h1 className="font-mono text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-[2.5rem] lg:text-5xl lg:leading-[1.1]">
              {meta.length} endpoint REST API. Gratis, tanpa API key.
            </h1>
            <p className="mt-6 max-w-[60ch] text-lg text-muted">
              {`${SITE_NAME} menyatukan AI, downloader, canvas, pencarian, data BMKG, Al-Qur'an, komik, anime, dan film dalam satu base URL. Tidak perlu daftar: salin URL, kirim GET, terima JSON.`}
            </p>

            <div className="mt-8">
              <BaseUrlBox fallback={SITE_URL} />
            </div>

            <div className="mt-4">
              <Link href="/docs" className="btn btn-secondary w-full sm:w-auto">
                Buka dokumentasi
                <ArrowIcon />
              </Link>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-7 lg:row-span-2">
            <TryConsole endpoints={consoleList} picks={picks} fallback={SITE_URL} sample={sampleResponse} />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 self-start border-t border-line pt-6 lg:col-span-5">
            {facts.map((f) => (
              <div key={f.k}>
                <dt className="text-sm text-muted">{f.k}</dt>
                <dd className="tnum mt-1 font-mono text-2xl font-bold">{f.v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-sm text-muted">Permintaan dilayani</dt>
              <dd className="mt-1 font-mono text-2xl font-bold">
                <LiveRequests />
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ───────── Kategori ───────── */}
      <section id="kategori" className="border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-[2rem]">{categories.length} kategori, satu base URL</h2>
          <p className="mt-4 max-w-[65ch] text-muted">Setiap kategori punya halaman dokumentasi sendiri, lengkap dengan parameter, playground, dan contoh kode.</p>

          <Stagger className="mt-10 grid grid-cols-1 gap-2 md:grid-cols-2">
            {categories.map((c, i) => {
              const count = meta.filter((e) => e.category === c.id).length;
              return (
                <li key={c.id} style={{ "--i": i } as CSSProperties}>
                  <Link
                    href={`/docs/${c.id}`}
                    className="group flex min-h-[4.5rem] items-center gap-4 border border-line bg-bg px-4 py-3 transition-colors duration-150 hover:border-control hover:bg-subtle"
                  >
                    <CategoryIcon id={c.id} className="h-6 w-6 shrink-0 text-ok" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-base font-bold">{c.name}</span>
                      <span className="block text-sm text-muted">{c.tagline}</span>
                    </span>
                    <span className="tnum shrink-0 font-mono text-sm text-muted">
                      {count}
                      <span className="sr-only"> endpoint</span>
                    </span>
                    <ArrowIcon className="shrink-0 text-muted transition-transform duration-150 ease-out group-hover:translate-x-1 group-hover:text-fg" />
                  </Link>
                </li>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* ───────── Cara pakai ───────── */}
      <section id="mulai" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-5">
            <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-[2rem]">Dari URL ke respons dalam tiga langkah</h2>
            <ol className="mt-8 space-y-6">
              {steps.map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center border border-control font-mono text-sm font-bold" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-mono text-lg font-bold">{s.t}</h3>
                    <p className="mt-1 max-w-[55ch] text-muted">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="min-w-0 space-y-2 lg:col-span-7">
            <CodeTabs fallback={SITE_URL} path="/api/random/quote" />
            <div className="bg-code text-codefg">
              <div className="flex min-h-11 items-center gap-4 border-b border-codeline px-4 font-mono text-sm text-codemuted">
                <span className="inline-flex items-center gap-2 font-semibold text-codeok">
                  <span className="h-2 w-2 bg-codeok" aria-hidden />
                  200 OK
                </span>
                <span>application/json</span>
              </div>
              <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: colorizeJson(sampleResponse) }} />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Keunggulan ───────── */}
      <section className="border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="max-w-[24ch] font-mono text-2xl font-bold tracking-tight sm:text-[2rem]">Fokus membangun, bukan mengurus akses</h2>
          <ul className="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.t} className="border-t-2 border-fg pt-4">
                <h3 className="font-mono text-lg font-bold">{f.t}</h3>
                <p className="mt-2 text-muted">{f.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-[2rem]">Pertanyaan yang sering muncul</h2>
          <div className="mt-8 border-t border-line">
            {faqs.map((f) => (
              <details key={f.q} className="border-b border-line">
                <summary className="flex min-h-14 items-center justify-between gap-4 py-3 transition-colors duration-150 hover:text-ok">
                  <h3 className="text-base font-semibold sm:text-lg">{f.q}</h3>
                  <ChevronIcon className="chev shrink-0 text-muted" />
                </summary>
                <p className="faq-body max-w-[65ch] pb-6 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Kontak ───────── */}
      <section className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-[2rem]">Belum ketemu jawabannya?</h2>
            <p className="mt-3 max-w-[60ch] text-muted">Tanya langsung ke owner, laporkan endpoint yang bermasalah, atau usulkan fitur baru.</p>
          </div>
          <a href={APPEAL_URL} target="_blank" rel="noopener" className="btn btn-secondary shrink-0">
            Hubungi lewat WhatsApp
            <ExternalIcon />
            <span className="sr-only">(terbuka di tab baru)</span>
          </a>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
