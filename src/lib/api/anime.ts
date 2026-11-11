import type { CheerioAPI } from "cheerio";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, need, num } from "./helpers";
import { absUrl, browserHeaders, clean, cleanSlug, escapeHtml, fetchPage, imgSrc, pathParts, type El, type Page } from "./scrape";

/* Sumber: https://s2.anime-kuindo.com (WordPress, tema Animestream). */
const BASE = "https://s2.anime-kuindo.com";
const REFERER = `${BASE}/`;

const animeUrl = (slug: string) => `${BASE}/anime/${encodeURIComponent(slug)}/`;
const episodeUrl = (slug: string) => `${BASE}/${encodeURIComponent(slug)}/`;

const RESERVED = new Set([
  "anime", "genres", "genre", "season", "studio", "cast", "page", "category", "tag", "author", "wp-json", "wp-admin", "wp-content",
  "animelist", "anime-baru-dirilis", "top-rating", "movie", "jadwal", "histoy", "history", "bookmark", "blog",
]);

type LinkRef = { kind: "anime" | "episode"; slug: string; url: string };

function classify(href: string | undefined): LinkRef | null {
  const p = pathParts(href, BASE);
  if (!href || !p.length) return null;
  try {
    if (new URL(href, BASE).hostname !== new URL(BASE).hostname) return null;
  } catch {
    return null;
  }
  if (p[0] === "anime" && p[1]) return { kind: "anime", slug: p[1], url: animeUrl(p[1]) };
  if (p.length === 1 && !RESERVED.has(p[0])) return { kind: "episode", slug: p[0], url: episodeUrl(p[0]) };
  return null;
}

function slugParam(raw: string): { slug: string; hint: "anime" | "episode" | null } {
  if (/^https?:\/\//i.test(raw)) {
    const ref = classify(raw);
    if (!ref) throw new HttpError(400, "URL anime-kuindo tidak dikenali.");
    return { slug: cleanSlug(ref.slug), hint: ref.kind };
  }
  const isAnime = /^\/?anime\//i.test(raw);
  return { slug: cleanSlug(raw.replace(/^\/?anime\//i, "")), hint: isAnime ? "anime" : null };
}

async function wp<T>(path: string): Promise<T> {
  return fetchJson<T>(`${BASE}/wp-json/wp/v2/${path}`, { headers: browserHeaders(REFERER, { accept: "application/json" }) }, 15000);
}

/** Kartu anime/episode (article.bs) di beranda, pencarian, dan rekomendasi. */
function card($: CheerioAPI, el: El) {
  const a = el.find("a[href]").first();
  const ref = classify(a.attr("href"));
  if (!ref) return null;
  const tt = el.find(".tt").first();
  const episodeTitle = clean(tt.find("h2").first().text());
  const ttOnly = tt.clone();
  ttOnly.find("h2").remove();
  const title = clean(ttOnly.text()) || clean(a.attr("title")) || episodeTitle;
  return {
    title,
    ...(ref.kind === "episode" ? { episode_title: episodeTitle || null } : {}),
    kind: ref.kind,
    slug: ref.slug,
    url: ref.url,
    poster: imgSrc(el.find("img").first(), BASE),
    status: clean(el.find(".status").first().text()) || null,
    type: clean(el.find(".typez").first().text()) || null,
    episode: clean(el.find(".epx").first().text()) || null,
    sub: clean(el.find(".sb").first().text()) || null,
  };
}

type Card = NonNullable<ReturnType<typeof card>>;

/** Kelompokkan kartu di beranda berdasarkan judul bagian (.releases) sesuai urutan dokumen. */
function sections($: CheerioAPI): { name: string; items: Card[] }[] {
  const out: { name: string; items: Card[] }[] = [];
  let current: { name: string; items: Card[] } | null = null;
  $(".releases, article.bs").each((_, node) => {
    const el = $(node);
    if (el.hasClass("releases")) {
      current = { name: clean(el.find("h1, h2, h3").first().text()) || clean(el.text()), items: [] };
      out.push(current);
      return;
    }
    const c = card($, el);
    if (!c) return;
    if (!current) {
      current = { name: "", items: [] };
      out.push(current);
    }
    current.items.push(c);
  });
  return out.filter((s) => s.items.length);
}

function hasNextPage($: CheerioAPI, page: number): boolean {
  return $(`.hpage a[href*="/page/${page + 1}/"], .pagination a[href*="/page/${page + 1}/"], a.next.page-numbers`).length > 0;
}

/** Blok metadata seri (ada di halaman seri maupun halaman episode). */
function seriesInfo($: CheerioAPI) {
  const scope = $(".single-info, .bigcontent").first();
  if (!scope.length) return null;
  const meta: Record<string, string> = {};
  scope.find(".spe span").each((_, s) => {
    const text = clean($(s).text());
    const i = text.indexOf(":");
    if (i > 0) meta[text.slice(0, i).trim()] = text.slice(i + 1).trim();
  });
  const rating = clean(scope.find(".rating strong").first().text()).replace(/^Rating\s*/i, "");
  const epCount = Number(meta["Episode"] ?? meta["Episodes"]);
  const synopsis =
    clean(scope.find(".desc").first().text()) ||
    clean($(".synp .entry-content, .entry-content[itemprop='description']").first().text());
  return {
    title: clean(scope.find(".infox h1, .infox h2, h1.entry-title").first().text()) || null,
    alternative_titles: clean(scope.find(".alter").first().text()) || null,
    poster: imgSrc(scope.find(".thumb img").first(), BASE),
    rating: rating && Number.isFinite(Number(rating)) ? Number(rating) : rating || null,
    status: meta["Status"] ?? null,
    type: meta["Tipe"] ?? meta["Type"] ?? null,
    studio: meta["Studio"] ?? null,
    released: meta["Dirilis"] ?? meta["Released"] ?? null,
    season: meta["Season"] ?? null,
    duration: meta["Durasi"] ?? meta["Duration"] ?? null,
    total_episodes: Number.isFinite(epCount) ? epCount : meta["Episode"] ?? null,
    casts: (meta["Casts"] ?? "").split(",").map((c) => c.trim()).filter(Boolean),
    genres: scope.find(".genxed a").map((_, g) => clean($(g).text())).get().filter(Boolean),
    synopsis: synopsis || null,
  };
}

type EpisodeRef = { episode: string | null; title: string; slug: string; url: string; date: string | null };

function episodeList($: CheerioAPI): EpisodeRef[] {
  const out: EpisodeRef[] = [];
  const seen = new Set<string>();
  // Halaman episode: .episodelist — Halaman seri: .eplister
  $(".episodelist li, .eplister li").each((_, li) => {
    const el = $(li);
    const ref = classify(el.find("a[href]").first().attr("href"));
    if (!ref || ref.kind !== "episode" || seen.has(ref.slug)) return;
    seen.add(ref.slug);
    const span = clean(el.find(".playinfo span").first().text());
    const title = clean(el.find(".playinfo h3, .epl-title").first().text()) || clean(el.find("a").first().attr("title"));
    const numText = clean(el.find(".epl-num").first().text()) || span.match(/^Eps?\.?\s*([\d.]+)/i)?.[1] || title.match(/Episode\s+([\d.]+)/i)?.[1] || "";
    const date = clean(el.find(".epl-date").first().text()) || (span.includes(" - ") ? span.split(" - ").pop()!.trim() : "");
    out.push({ episode: numText || null, title, slug: ref.slug, url: ref.url, date: date || null });
  });
  return out;
}

type Server = { index: number; name: string; url: string; iframe: string };

function iframeTag(url: string): string {
  return `<iframe src="${escapeHtml(url)}" width="100%" style="aspect-ratio:16/9;border:0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}

function httpsUrl(raw: string | undefined | null): string | null {
  const u = absUrl(raw, BASE);
  if (!u) return null;
  const parsed = new URL(u);
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  return parsed.protocol === "https:" ? parsed.toString() : null;
}

/** Link player: <select class="mirror"> berisi HTML iframe ter-encode base64, plus iframe bawaan. */
function servers($: CheerioAPI): Server[] {
  const out: Server[] = [];
  const seen = new Set<string>();
  const add = (name: string, raw: string | null | undefined) => {
    const url = httpsUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ index: out.length + 1, name: name || `Server ${out.length + 1}`, url, iframe: iframeTag(url) });
  };
  $("select.mirror option, .mirror option").each((_, o) => {
    const value = clean($(o).attr("value"));
    if (!value) return;
    let decoded = value;
    if (!/^https?:\/\//i.test(value) && !value.startsWith("//")) {
      try {
        decoded = Buffer.from(value, "base64").toString("utf8");
      } catch {
        return;
      }
    }
    const src = decoded.match(/<(?:iframe|embed|video|source)[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? (/^(https?:)?\/\//i.test(decoded.trim()) ? decoded.trim() : null);
    add(clean($(o).text()), src?.replace(/&amp;/g, "&"));
  });
  $("#pembed iframe, .player-embed iframe, .video-content iframe").each((_, f) => {
    add(out.length ? "" : "Default", $(f).attr("src") || $(f).attr("data-src") || $(f).attr("data-litespeed-src"));
  });
  return out;
}

function isEpisodePage($: CheerioAPI): boolean {
  return $("select.mirror, #pembed, .player-embed, .episodelist").length > 0;
}

function isSeriesPage(page: Page): boolean {
  const p = pathParts(page.url, BASE);
  return p[0] === "anime" && !!p[1] && page.$(".bigcontent, .eplister").length > 0;
}

function seriesRefFromEpisode($: CheerioAPI): { slug: string; url: string } | null {
  let found: { slug: string; url: string } | null = null;
  $(".year a[href], .naveps a[href], .headlist a[href], .single-info a[href]").each((_, a) => {
    if (found) return;
    const ref = classify($(a).attr("href"));
    if (ref?.kind === "anime") found = { slug: ref.slug, url: ref.url };
  });
  return found;
}

async function tryPage(url: string): Promise<Page | null> {
  try {
    return await fetchPage(url, REFERER);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

async function loadEpisode(slug: string): Promise<Page> {
  const page = await tryPage(episodeUrl(slug));
  if (!page || !isEpisodePage(page.$)) throw new HttpError(404, "Episode tidak ditemukan. Gunakan slug episode dari endpoint latest/detail.");
  return page;
}

/**
 * Cari halaman yang memuat metadata seri. Halaman /anime/<slug>/ kadang dialihkan
 * ke beranda untuk permintaan dari server, jadi ada cadangan lewat WP REST + halaman episode.
 */
async function loadSeries(slug: string, hint: "anime" | "episode" | null): Promise<{ page: Page; via: "series" | "episode" }> {
  if (hint !== "episode") {
    const series = await tryPage(animeUrl(slug)).catch(() => null);
    if (series && isSeriesPage(series)) return { page: series, via: "series" };

    const cats = await wp<{ id: number; count: number }[]>(`categories?slug=${encodeURIComponent(slug)}&_fields=id,count`).catch(() => []);
    const cat = Array.isArray(cats) ? cats.find((c) => c.count > 0) : undefined;
    if (cat) {
      const posts = await wp<{ slug: string }[]>(`posts?categories=${cat.id}&per_page=1&_fields=slug`).catch(() => []);
      if (Array.isArray(posts) && posts[0]?.slug) {
        const ep = await tryPage(episodeUrl(posts[0].slug));
        if (ep && isEpisodePage(ep.$)) return { page: ep, via: "episode" };
      }
    }
  }

  if (hint !== "anime") {
    const direct = await tryPage(episodeUrl(slug));
    if (direct && isEpisodePage(direct.$)) return { page: direct, via: "episode" };
  }

  // Cadangan terakhir: cari episode lewat WP REST lalu cocokkan slug serinya.
  const posts = await wp<{ slug: string }[]>(`posts?search=${encodeURIComponent(slug.replace(/-/g, " "))}&per_page=3&_fields=slug`).catch(() => []);
  for (const p of Array.isArray(posts) ? posts : []) {
    const ep = await tryPage(episodeUrl(p.slug)).catch(() => null);
    if (ep && isEpisodePage(ep.$) && seriesRefFromEpisode(ep.$)?.slug === slug) return { page: ep, via: "episode" };
  }
  throw new HttpError(404, "Anime tidak ditemukan. Gunakan slug dari endpoint search atau latest.");
}

function navRef($: CheerioAPI, rel: "prev" | "next") {
  const ref = classify($(`.naveps a[rel="${rel}"]`).first().attr("href"));
  return ref?.kind === "episode" ? { slug: ref.slug, url: ref.url } : null;
}

function downloads($: CheerioAPI) {
  const out: { title: string | null; quality: string | null; links: { name: string; url: string }[] }[] = [];
  $(".soraddlx, .soraddl").each((_, box) => {
    const title = clean($(box).find(".sorattlx, .sorattl").first().text()) || null;
    $(box)
      .find(".soraurlx, .soraurl")
      .each((_, row) => {
        const links = $(row)
          .find("a[href]")
          .map((_, a) => {
            const url = absUrl($(a).attr("href"), BASE);
            return url ? { name: clean($(a).text()), url } : null;
          })
          .get()
          .filter(Boolean);
        if (links.length) out.push({ title, quality: clean($(row).find("strong, .res").first().text()) || null, links });
      });
  });
  return out;
}

function embedHtml(title: string, url: string): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe src="${escapeHtml(url)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`;
}

export const animeEndpoints: Endpoint[] = [
  {
    category: "anime", slug: "latest", kind: "json",
    title: "Anime Terbaru",
    description: "Episode anime sub Indo yang baru dirilis di Animekuindo. Slug hasilnya bisa langsung dipakai di endpoint episode.",
    params: [{ name: "page", description: "Nomor halaman (1-200).", example: "1" }],
    handler: async ({ sp }) => {
      const page = Math.floor(num(sp, "page", 1, 1, 200));
      const { $ } = await fetchPage(page > 1 ? `${BASE}/page/${page}/` : REFERER, REFERER);
      const all = sections($);
      const section =
        all.find((s) => /rilisan terbaru|latest release/i.test(s.name)) ??
        all.find((s) => /terbaru|latest/i.test(s.name) && s.items.some((i) => i.kind === "episode")) ??
        [...all].sort((a, b) => b.items.length - a.items.length)[0];
      if (!section) throw new HttpError(page > 1 ? 404 : 502, page > 1 ? "Halaman tidak ditemukan." : "Struktur halaman Animekuindo berubah, data terbaru tidak terbaca.");
      return { source: BASE, page, has_next: hasNextPage($, page), total: section.items.length, items: section.items };
    },
  },
  {
    category: "anime", slug: "home", kind: "json",
    title: "Beranda Anime",
    description: "Semua bagian beranda Animekuindo sekaligus: terpopuler hari ini, rilisan terbaru, anime baru, top rating, dan rekomendasi.",
    params: [],
    handler: async () => {
      const { $ } = await fetchPage(REFERER, REFERER);
      const all = sections($).filter((s) => s.name);
      if (!all.length) throw new HttpError(502, "Struktur halaman Animekuindo berubah, beranda tidak terbaca.");
      return { source: BASE, total_sections: all.length, sections: all.map((s) => ({ name: s.name, total: s.items.length, items: s.items })) };
    },
  },
  {
    category: "anime", slug: "search", kind: "json",
    title: "Cari Anime",
    description: "Cari judul anime di Animekuindo. Hasil berisi slug seri untuk endpoint detail.",
    params: [
      { name: "q", required: true, description: "Kata kunci judul anime.", example: "one piece" },
      { name: "page", description: "Nomor halaman hasil (1-50).", example: "1" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const page = Math.floor(num(sp, "page", 1, 1, 50));
      const res = await tryPage(`${BASE}/${page > 1 ? `page/${page}/` : ""}?s=${encodeURIComponent(q)}`);
      const items = res
        ? res
            .$(".listupd article.bs")
            .map((_, n) => card(res.$, res.$(n)))
            .get()
            .filter(Boolean)
        : [];
      return { source: BASE, query: q, page, has_next: res ? hasNextPage(res.$, page) : false, total: items.length, items };
    },
  },
  {
    category: "anime", slug: "detail", kind: "json",
    title: "Detail Anime",
    description: "Metadata anime (judul, sinopsis, genre, studio, status, rating, poster) beserta daftar seluruh episodenya.",
    params: [{ name: "slug", required: true, description: "Slug seri dari search, slug episode dari latest, atau URL lengkap.", example: "kenja-no-mago" }],
    handler: async ({ sp }) => {
      const { slug, hint } = slugParam(need(sp, "slug", 400));
      const { page, via } = await loadSeries(slug, hint);
      const { $ } = page;
      const info = seriesInfo($);
      if (!info) throw new HttpError(502, "Metadata anime tidak terbaca dari Animekuindo.");
      const series = via === "series" ? { slug, url: animeUrl(slug) } : seriesRefFromEpisode($) ?? { slug, url: animeUrl(slug) };
      const episodes = episodeList($);
      return {
        source: series.url,
        slug: series.slug,
        ...info,
        available_episodes: episodes.length,
        latest_episode: episodes[0] ?? null,
        episodes,
      };
    },
  },
  {
    category: "anime", slug: "episode", kind: "json",
    title: "Nonton Episode",
    description: "Ambil link player video sebuah episode (siap dipasang di iframe), navigasi episode, link unduhan, dan metadata serinya.",
    params: [{ name: "slug", required: true, description: "Slug episode (dari latest/detail) atau URL episode lengkap.", example: "kenja-no-mago-episode-12-sub-indo" }],
    handler: async ({ sp, origin }) => {
      const { slug } = slugParam(need(sp, "slug", 400));
      const { $ } = await loadEpisode(slug);
      const list = servers($);
      const info = seriesInfo($);
      const series = seriesRefFromEpisode($);
      const title = clean($("h1.entry-title").first().text()) || null;
      const epNum = clean($('meta[itemprop="episodeNumber"]').first().attr("content")) || title?.match(/Episode\s+([\d.]+)/i)?.[1] || null;
      const embed = `${origin}/api/anime/embed?slug=${encodeURIComponent(slug)}`;
      return {
        source: episodeUrl(slug),
        slug,
        title,
        episode: epNum,
        released: clean($(".year .updated, .updated").first().text()) || null,
        anime: series || info ? { title: info?.title ?? null, slug: series?.slug ?? null, url: series?.url ?? null } : null,
        player: {
          total_servers: list.length,
          default: list[0]?.url ?? null,
          embed: list.length ? embed : null,
          embed_iframe: list.length ? iframeTag(embed) : null,
          servers: list,
        },
        prev_episode: navRef($, "prev"),
        next_episode: navRef($, "next"),
        downloads: downloads($),
        info,
        episodes: episodeList($),
      };
    },
  },
  {
    category: "anime", slug: "embed", kind: "html",
    title: "Embed Player",
    description: "Halaman HTML berisi player video episode, layar penuh. Pakai URL ini langsung sebagai src <iframe> di situsmu.",
    params: [
      { name: "slug", required: true, description: "Slug episode (dari latest/detail).", example: "kenja-no-mago-episode-12-sub-indo" },
      { name: "server", description: "Nomor server player, mulai dari 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const { slug } = slugParam(need(sp, "slug", 400));
      const want = Math.floor(num(sp, "server", 1, 1, 50));
      const { $ } = await loadEpisode(slug);
      const list = servers($);
      if (!list.length) throw new HttpError(404, "Player video untuk episode ini tidak ditemukan.");
      const server = list[want - 1];
      if (!server) throw new HttpError(404, `Server ${want} tidak tersedia. Episode ini punya ${list.length} server.`);
      const title = clean($("h1.entry-title").first().text()) || "Player";
      return new Response(embedHtml(title, server.url), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=600",
          "content-security-policy": "default-src 'none'; frame-src https:; style-src 'unsafe-inline'; frame-ancestors *",
          "x-robots-tag": "noindex",
        },
      });
    },
  },
];
