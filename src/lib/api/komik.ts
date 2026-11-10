import type { CheerioAPI } from "cheerio";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { binaryResponse, fetchRaw, need, num, opt } from "./helpers";
import { absUrl, browserHeaders, clean, cleanSlug, fetchPage, imgSrc, pathParts, type El } from "./scrape";

/* Sumber: https://komiku.org (HTML di-scrape, fragmen daftar dari api.komiku.org). */
const BASE = "https://komiku.org";
const API = "https://api.komiku.org";
const REFERER = `${BASE}/`;
const IMAGE_HOSTS = /(^|\.)komiku\.(org|to|id|co\.id|com)$/i;

const mangaUrl = (slug: string) => `${BASE}/manga/${encodeURIComponent(slug)}/`;
const chapterUrl = (slug: string) => `${BASE}/${encodeURIComponent(slug)}/`;

function mangaSlug(href: string | undefined): string | null {
  const p = pathParts(href, BASE);
  const i = p.indexOf("manga");
  return i >= 0 && p[i + 1] ? p[i + 1] : null;
}

function chapterSlug(href: string | undefined): string | null {
  const p = pathParts(href, BASE);
  return p.length === 1 && /chapter/i.test(p[0]) ? p[0] : null;
}

/** Terima slug polos atau URL komiku lengkap. */
function slugParam(raw: string, kind: "manga" | "chapter"): string {
  if (/^https?:\/\//i.test(raw)) {
    const s = kind === "manga" ? mangaSlug(raw) : chapterSlug(raw);
    if (!s) throw new HttpError(400, "URL komiku tidak dikenali.");
    return cleanSlug(s);
  }
  return cleanSlug(raw.replace(/^\/?manga\//i, ""));
}

function typeFromFlag($el: El): string | null {
  const srcs = $el
    .find("img")
    .map((_, i) => `${i.attribs?.src ?? ""} ${i.attribs?.["data-src"] ?? ""}`)
    .get()
    .join(" ");
  if (/\/jp\.(png|svg|webp)/i.test(srcs)) return "Manga";
  if (/\/kr\.(png|svg|webp)/i.test(srcs)) return "Manhwa";
  if (/\/cn\.(png|svg|webp)/i.test(srcs)) return "Manhua";
  return null;
}

function cover($: CheerioAPI, $el: El): string | null {
  let out: string | null = null;
  $el.find("img").each((_, i) => {
    if (out) return;
    const src = imgSrc($(i), BASE);
    if (src && !/\/asset\/img\//i.test(src)) out = src;
  });
  return out;
}

function chapterRef($a: El) {
  const href = $a.attr("href");
  const slug = chapterSlug(href);
  if (!slug) return null;
  return { title: clean($a.text()).replace(/^(Awal|Terbaru)\s*:\s*/i, "") || null, slug, url: chapterUrl(slug) };
}

/** Kartu di beranda (.ls2 = terbaru, .ls4 = peringkat). */
function homeCard($: CheerioAPI, el: El) {
  const slug = mangaSlug(el.find('a[href*="/manga/"]').first().attr("href"));
  if (!slug) return null;
  const info = clean(el.find(".ls2t, .ls4s").first().text()).split("·").map((s) => s.trim());
  const rank = Number(clean(el.find(".rank-num").first().text()));
  const tail = info[1] ?? "";
  const views = /views?/i.test(tail) ? Number(tail.replace(/[^\d]/g, "")) : null;
  let latest: ReturnType<typeof chapterRef> = null;
  el.find("a").each((_, a) => {
    latest = chapterRef($(a)) ?? latest;
  });
  return {
    ...(Number.isFinite(rank) && rank > 0 ? { rank } : {}),
    title: clean(el.find("h3, h4").first().text()),
    slug,
    url: mangaUrl(slug),
    thumbnail: cover($, el),
    type: typeFromFlag(el),
    genre: info[0] || null,
    ...(views !== null ? { views } : { updated: tail || null }),
    latest_chapter: latest,
  };
}

/** Kartu hasil pencarian / pustaka (.bge) dari api.komiku.org. */
function listCards($: CheerioAPI) {
  const out: unknown[] = [];
  $(".bge").each((_, node) => {
    const el = $(node);
    const slug = mangaSlug(el.find('a[href*="/manga/"]').first().attr("href"));
    if (!slug) return;
    const inf = el.find(".tpe1_inf").first();
    const type = clean(inf.find("b").first().text()) || null;
    const genre = clean(inf.text()).replace(type ?? "", "").trim() || null;
    const chapters = el
      .find(".new1 a")
      .map((_, a) => chapterRef($(a)))
      .get()
      .filter(Boolean);
    // .judul2 berisi judul alternatif (pencarian) atau "Genre | 6 jam lalu | Berwarna" (pustaka).
    const sub = clean(el.find(".judul2").first().text());
    const meta = sub.includes("|") ? sub.split("|").map((x) => x.trim()) : [];
    const description = clean(el.find(".kan p").first().text());
    const updated = meta.find((x) => /lalu|baru/i.test(x)) ?? description.match(/^Update\s+(.+?)\.?$/i)?.[1] ?? null;
    out.push({
      title: clean(el.find("h3").first().text()),
      alternative_title: meta.length ? null : sub || null,
      slug,
      url: mangaUrl(slug),
      thumbnail: cover($, el),
      type,
      genre,
      updated,
      colored: meta.length ? meta.some((x) => /berwarna/i.test(x)) : null,
      description: description && !/^Update\s/i.test(description) ? description : null,
      first_chapter: chapters[0] ?? null,
      latest_chapter: chapters.length > 1 ? chapters[chapters.length - 1] : null,
    });
  });
  return out;
}

async function fetchFragment(pathAndQuery: string) {
  return fetchPage(`${API}${pathAndQuery}`, REFERER, { "hx-request": "true", origin: BASE });
}

function isoDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : raw || null;
}

export const komikEndpoints: Endpoint[] = [
  {
    category: "komik", slug: "latest", kind: "json",
    title: "Komik Terbaru",
    description: "Daftar komik yang baru saja update chapter di Komiku (manga, manhwa, manhua).",
    params: [{ name: "tipe", description: "Filter opsional: manga, manhwa, atau manhua.", example: "" }],
    handler: async ({ sp }) => {
      const tipe = opt(sp, "tipe").toLowerCase();
      if (tipe && !["manga", "manhwa", "manhua"].includes(tipe)) throw new HttpError(400, "Parameter 'tipe' harus manga, manhwa, atau manhua.");
      const { $ } = await fetchPage(REFERER, REFERER);
      let items = $("#Terbaru article, #Terbaru .ls2, #Terbaru .ls4")
        .map((_, n) => homeCard($, $(n)))
        .get()
        .filter(Boolean);
      const seen = new Set<string>();
      items = items.filter((i) => (seen.has(i.slug) ? false : (seen.add(i.slug), true)));
      if (tipe) items = items.filter((i) => i.type?.toLowerCase() === tipe);
      if (!items.length && !tipe) throw new HttpError(502, "Struktur halaman Komiku berubah, data terbaru tidak terbaca.");
      return { source: BASE, total: items.length, items };
    },
  },
  {
    category: "komik", slug: "populer", kind: "json",
    title: "Komik Populer",
    description: "Peringkat komik paling banyak dibaca di Komiku, harian dan mingguan.",
    params: [{ name: "periode", description: "harian (bawaan) atau mingguan.", example: "harian" }],
    handler: async ({ sp }) => {
      const periode = opt(sp, "periode", "harian").toLowerCase();
      if (!["harian", "mingguan"].includes(periode)) throw new HttpError(400, "Parameter 'periode' harus harian atau mingguan.");
      const { $ } = await fetchPage(REFERER, REFERER);
      const panel = $(`#rank-${periode}`);
      const scope = panel.length ? panel : $("#Rekomendasi_Komik");
      const items = scope
        .find(".ls4")
        .map((_, n) => homeCard($, $(n)))
        .get()
        .filter(Boolean);
      if (!items.length) throw new HttpError(502, "Struktur halaman Komiku berubah, peringkat tidak terbaca.");
      return { source: BASE, periode, total: items.length, items };
    },
  },
  {
    category: "komik", slug: "search", kind: "json",
    title: "Cari Komik",
    description: "Cari komik di Komiku berdasarkan judul. Hasil berisi slug untuk dipakai di endpoint detail.",
    params: [{ name: "q", required: true, description: "Kata kunci judul komik.", example: "one piece" }],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const { $ } = await fetchFragment(`/?post_type=manga&s=${encodeURIComponent(q)}`);
      const items = listCards($);
      return { source: BASE, query: q, total: items.length, items };
    },
  },
  {
    category: "komik", slug: "list", kind: "json",
    title: "Daftar Komik",
    description: "Jelajahi pustaka Komiku dengan filter tipe, genre, status, dan urutan. Mendukung halaman.",
    params: [
      { name: "page", description: "Nomor halaman (1-500).", example: "1" },
      { name: "tipe", description: "manga, manhwa, atau manhua.", example: "manhwa" },
      { name: "genre", description: "Slug genre, lihat /api/komik/genre.", example: "action" },
      { name: "status", description: "ongoing atau end.", example: "" },
      { name: "order", description: "modified (update terbaru), date (baru ditambahkan), atau rand (acak).", example: "modified" },
    ],
    handler: async ({ sp }) => {
      const page = Math.floor(num(sp, "page", 1, 1, 500));
      const tipe = opt(sp, "tipe").toLowerCase();
      const genre = opt(sp, "genre").toLowerCase();
      const status = opt(sp, "status").toLowerCase();
      const order = opt(sp, "order", "modified").toLowerCase();
      if (tipe && !["manga", "manhwa", "manhua"].includes(tipe)) throw new HttpError(400, "Parameter 'tipe' harus manga, manhwa, atau manhua.");
      if (status && !["ongoing", "end"].includes(status)) throw new HttpError(400, "Parameter 'status' harus ongoing atau end.");
      if (!["modified", "date", "rand"].includes(order)) throw new HttpError(400, "Parameter 'order' harus modified, date, atau rand.");
      if (genre && !/^[a-z0-9-]{1,60}$/.test(genre)) throw new HttpError(400, "Parameter 'genre' tidak valid.");
      const qs = new URLSearchParams({ orderby: order });
      if (tipe) qs.set("tipe", tipe);
      if (genre) qs.set("genre", genre);
      if (status) qs.set("status", status);
      const { $ } = await fetchFragment(`/manga/${page > 1 ? `page/${page}/` : ""}?${qs}`);
      const items = listCards($);
      const hasNext = $(`[hx-get*="/page/${page + 1}/"], [data-hx-get*="/page/${page + 1}/"]`).length > 0;
      return { source: BASE, page, has_next: hasNext, filter: { tipe: tipe || null, genre: genre || null, status: status || null, order }, total: items.length, items };
    },
  },
  {
    category: "komik", slug: "genre", kind: "json",
    title: "Daftar Genre Komik",
    description: "Semua genre yang tersedia di Komiku beserta jumlah komiknya.",
    params: [],
    handler: async () => {
      const { $ } = await fetchPage(REFERER, REFERER);
      const genres = $('select[name="genre"]')
        .first()
        .find("option")
        .map((_, o) => {
          const slug = clean($(o).attr("value"));
          if (!slug) return null;
          const m = clean($(o).text()).match(/^(.*?)\s*\(([\d.,]+)\)\s*$/);
          return { name: m ? m[1] : clean($(o).text()), slug, count: m ? Number(m[2].replace(/[.,]/g, "")) : null };
        })
        .get()
        .filter(Boolean);
      if (!genres.length) throw new HttpError(502, "Struktur halaman Komiku berubah, genre tidak terbaca.");
      return { source: BASE, total: genres.length, genres };
    },
  },
  {
    category: "komik", slug: "detail", kind: "json",
    title: "Detail Komik",
    description: "Metadata lengkap satu komik: judul, sinopsis, genre, author, status, sampul, dan daftar seluruh chapter.",
    params: [{ name: "slug", required: true, description: "Slug komik (dari search/latest) atau URL komiku lengkap.", example: "komik-one-piece-indo" }],
    handler: async ({ sp }) => {
      const slug = slugParam(need(sp, "slug", 400), "manga");
      const { $ } = await fetchPage(mangaUrl(slug), REFERER);
      const title = clean($("#Judul h1").first().text()).replace(/^Komik\s+/i, "");
      if (!title && !$("#Daftar_Chapter, table.inftable").length) throw new HttpError(404, "Komik tidak ditemukan.");

      const info: Record<string, string> = {};
      $("table.inftable tr").each((_, tr) => {
        const td = $(tr).find("td");
        const key = clean(td.eq(0).text()).replace(/:$/, "");
        const val = td.eq(1).text().split("\n").map(clean).filter(Boolean).join(", ");
        if (key && val) info[key] = val;
      });

      let genres = $("ul.genre li").map((_, li) => clean($(li).text())).get().filter(Boolean);
      if (!genres.length && info["Genre"]) genres = info["Genre"].split(",").map((g) => g.trim());

      const chapters: { title: string; slug: string; url: string; date: string | null; views: number | null }[] = [];
      $("#Daftar_Chapter tr").each((_, tr) => {
        const row = $(tr);
        const a = row.find("td.judulseries a, a[href*='chapter']").first();
        const cs = chapterSlug(a.attr("href"));
        if (!cs) return;
        const views = clean(row.find(".pembaca").first().text()).replace(/[^\d]/g, "");
        chapters.push({ title: clean(a.text()), slug: cs, url: chapterUrl(cs), date: isoDate(clean(row.find(".tanggalseries").first().text())), views: views ? Number(views) : null });
      });

      const img = $("#Informasi .ims img, #Informasi img").first();
      return {
        source: mangaUrl(slug),
        slug,
        title: title || info["Judul"] || null,
        alternative_title: clean($("#Judul .j2").first().text()) || info["Judul Alternatif"] || info["Judul Indonesia"] || null,
        cover: imgSrc(img, BASE),
        type: info["Tipe"] ?? info["Jenis Komik"] ?? null,
        theme: info["Tema"] ?? info["Konsep Cerita"] ?? null,
        author: info["Author"] ?? info["Pengarang"] ?? info["Komikus"] ?? null,
        status: info["Status"] ?? null,
        rating: info["Rating"] ?? info["Umur Pembaca"] ?? null,
        reading_direction: info["Cara Baca"] ?? null,
        genres,
        synopsis: clean($("p.desc").first().text()) || clean($("#Sinopsis p").first().text()) || null,
        total_chapters: chapters.length,
        first_chapter: chapters[chapters.length - 1] ?? null,
        latest_chapter: chapters[0] ?? null,
        chapters,
      };
    },
  },
  {
    category: "komik", slug: "chapter", kind: "json",
    title: "Baca Chapter",
    description: "Ambil semua URL gambar halaman dari satu chapter beserta navigasi chapter sebelum/sesudahnya.",
    params: [
      { name: "slug", required: true, description: "Slug chapter (dari detail/latest) atau URL chapter lengkap.", example: "one-piece-chapter-1" },
      { name: "proxy", description: "Isi 1 agar URL gambar dilewatkan ke /api/komik/image (anti-hotlink).", example: "" },
    ],
    handler: async ({ sp, origin }) => {
      const slug = slugParam(need(sp, "slug", 400), "chapter");
      const useProxy = /^(1|true|ya|yes)$/i.test(opt(sp, "proxy"));
      const page = await fetchPage(chapterUrl(slug), REFERER);
      const { $ } = page;

      const seen = new Set<string>();
      const images: string[] = [];
      $("#Baca_Komik img").each((_, i) => {
        const src = imgSrc($(i), BASE);
        if (!src || seen.has(src) || /komiku-promosi|\/asset\/img\//i.test(src)) return;
        seen.add(src);
        images.push(useProxy ? `${origin}/api/komik/image?url=${encodeURIComponent(src)}` : src);
      });
      if (!images.length) {
        if (!$("#Baca_Komik").length) throw new HttpError(404, "Chapter tidak ditemukan.");
        throw new HttpError(502, "Gambar chapter tidak terbaca dari Komiku.");
      }

      // .nxpr berisi [sebelumnya?, halaman komik, berikutnya?]
      let manga: string | null = null;
      let prev: string | null = null;
      let next: string | null = null;
      $(".nxpr a").each((_, a) => {
        const href = $(a).attr("href");
        const ms = mangaSlug(href);
        const cs = chapterSlug(href);
        if (ms) manga = manga ?? ms;
        else if (cs && cs !== slug) {
          if (manga) next = next ?? cs;
          else prev = prev ?? cs;
        }
      });

      const ref = (s: string | null) => (s ? { slug: s, url: chapterUrl(s) } : null);
      const mangaRef = manga as string | null;
      return {
        source: chapterUrl(slug),
        slug,
        title: clean($("#Judul h1").first().text()) || null,
        manga: mangaRef ? { slug: mangaRef, url: mangaUrl(mangaRef) } : null,
        prev_chapter: ref(prev),
        next_chapter: ref(next),
        total_images: images.length,
        images,
      };
    },
  },
  {
    category: "komik", slug: "image", kind: "image",
    title: "Proxy Gambar Komik",
    description: "Tampilkan gambar dari server Komiku lewat proxy (mengatasi blokir hotlink). Hanya menerima host komiku.",
    params: [{ name: "url", required: true, description: "URL gambar dari endpoint chapter/detail.", example: "https://img.komiku.org/komiku-promosi.webp" }],
    handler: async ({ sp }) => {
      const raw = need(sp, "url", 1000);
      const u = absUrl(raw, BASE);
      const parsed = u ? new URL(u) : null;
      if (!parsed || parsed.protocol !== "https:" || !IMAGE_HOSTS.test(parsed.hostname)) {
        throw new HttpError(400, "Hanya URL gambar https dari host komiku yang diizinkan.");
      }
      const res = await fetchRaw(parsed.toString(), { headers: browserHeaders(REFERER, { accept: "image/avif,image/webp,image/*,*/*;q=0.8" }) }, 20000);
      const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
      if (!type.startsWith("image/")) throw new HttpError(502, "Server sumber tidak mengirim gambar.");
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4_300_000) throw new HttpError(413, "Gambar terlalu besar untuk diproxy (maks ±4 MB). Gunakan URL aslinya.");
      return binaryResponse(buf, type, "public, max-age=86400, s-maxage=604800, immutable");
    },
  },
];
