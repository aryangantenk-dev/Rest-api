import { load, type CheerioAPI } from "cheerio";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { isPrivateHost, need, num, opt } from "./helpers";
import { absUrl, clean, cleanSlug, escapeHtml, imgSrc, type El } from "./scrape";
import { proxyText } from "./filmproxy";

/*
 * Kategori film. LK21 menolak IP server Vercel, jadi semua permintaan dititipkan
 * lewat film-proxy di VPS (lihat ./filmproxy.ts dan scripts/film-proxy).
 *
 *   - LK21 : https://tv12.lk21official.cc (film) + https://tv.nontondrama.vip (serial)
 *
 * Catatan untuk sumber berikutnya (belum dipasang): data SankaMovies (sankanime.web.id/movies)
 * berasal dari https://www.sankavollerei.web.id/plananimek/movie/{home,search,filter,trending,
 * genres,detail/<type>/<id>,person/<id>}. Jawabannya dibungkus { "_encsankaa": base64url(zlib(JSON)) }
 * dan host itu juga menolak IP Vercel, jadi perlu masuk ALLOW_HOSTS film-proxy lebih dulu.
 */

/* ============================================================ LK21 ====== */

const LK = "https://tv12.lk21official.cc";
const LK_SERIES = "https://tv.nontondrama.vip";
const LK_NAME = "LK21";

const LK_RESERVED = new Set([
  "genre", "country", "year", "quality", "artist", "director", "page", "search", "populer", "latest", "rating", "release",
  "most-commented", "top-movie-today", "latest-series", "top-series-today", "series", "nontondrama", "rekomendasi-film-pintar", "404.html",
]);

type LkRef = { slug: string; series: boolean };

/** Kenali tautan judul LK21: "/<slug>" (film) atau "/nontondrama?page=<slug>" (serial). */
function lkRef(href: string | undefined, base: string): LkRef | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "nontondrama") {
    const s = u.searchParams.get("page") || "";
    return /^[a-z0-9][a-z0-9-]*$/i.test(s) ? { slug: s, series: true } : null;
  }
  if (parts.length !== 1 || LK_RESERVED.has(parts[0])) return null;
  return { slug: parts[0], series: u.hostname.endsWith("nontondrama.vip") };
}

const lkUrl = (slug: string, series: boolean) => `${series ? LK_SERIES : LK}/${slug}`;

function lkSlugParam(sp: URLSearchParams, name = "slug"): string {
  const raw = need(sp, name, 300);
  if (/^https?:\/\//i.test(raw)) {
    const ref = lkRef(raw, LK);
    if (!ref) throw new HttpError(400, `URL ${LK_NAME} tidak dikenali. Isi dengan slug, contoh: avatar-2009.`);
    return cleanSlug(ref.slug, name).toLowerCase();
  }
  return cleanSlug(raw, name).toLowerCase();
}

/** "Avatar (2009)" -> { title: "Avatar", year: 2009 } */
function splitYear(raw: string): { title: string; year: number | null } {
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(raw);
  return m ? { title: m[1].trim(), year: Number(m[2]) } : { title: raw, year: null };
}

/** "01:46" atau "2h 42m" -> menit */
function minutes(raw: string): number | null {
  let m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i.exec(raw.trim());
  if (m && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return null;
}

const numOrNull = (v: string | undefined | null): number | null => {
  const n = Number((v ?? "").replace(",", ".").trim());
  return v && Number.isFinite(n) ? n : null;
};

function lkPoster(el: El, base: string): string | null {
  const img = el.find("img").first();
  return imgSrc(img, base) || absUrl(el.find("source").last().attr("data-srcset") || el.find("source").last().attr("srcset"), base);
}

/** Kartu judul LK21 (<article> di slider maupun grid). */
function lkCard($: CheerioAPI, el: El, base: string) {
  const a = el.find('a[itemprop="url"], a[href]').first();
  const ref = lkRef(a.attr("href"), base);
  if (!ref) return null;
  const named = splitYear(clean(el.find(".poster-title").first().text()) || clean(el.find("img").first().attr("alt")));
  if (!named.title) return null;
  const episodes = numOrNull(el.find(".episode strong").first().text());
  const series = ref.series || episodes !== null || el.find(".episode").length > 0;
  const dur = clean(el.find(".duration").first().text());
  const season = /^S\.?\s*(\d+)$/i.exec(dur);
  const genres = (el.find('meta[itemprop="genre"]').attr("content") || el.find(".genre").first().text() || "")
    .split(",").map((g) => clean(g)).filter(Boolean);
  return {
    title: named.title,
    slug: ref.slug,
    type: series ? "series" : "movie",
    year: numOrNull(el.find(".year").first().text()) ?? named.year,
    rating: numOrNull(el.find('[itemprop="ratingValue"]').first().text() || el.find(".rating").first().text()),
    quality: clean(el.find(".label").first().text()) || null,
    runtime: series || !dur ? null : dur,
    runtime_minutes: series ? null : minutes(dur),
    season: season ? Number(season[1]) : null,
    episodes,
    genres,
    poster: lkPoster(el, base),
    url: lkUrl(ref.slug, series),
  };
}

type LkCard = NonNullable<ReturnType<typeof lkCard>>;

function lkCards($: CheerioAPI, scope: El, base: string): LkCard[] {
  const out: LkCard[] = [];
  const seen = new Set<string>();
  scope.find("article").each((_, n) => {
    const c = lkCard($, $(n), base);
    if (c && !seen.has(c.slug)) {
      seen.add(c.slug);
      out.push(c);
    }
  });
  return out;
}

async function lkPage(url: string): Promise<{ $: CheerioAPI; url: string }> {
  const r = await proxyText(url, { referer: `${LK}/` }, LK_NAME);
  return { $: load(r.text), url: r.finalUrl };
}

/** Halaman daftar (grid + paginasi): /populer, /genre/x, /artist/x, ... */
async function lkListing(path: string, page: number, what: string) {
  const { $, url } = await lkPage(`${LK}/${path}${page > 1 ? `/page/${page}` : ""}`);
  const items = lkCards($, $(".gallery-grid, #post-container").first().length ? $(".gallery-grid, #post-container") : $("main"), url);
  const m = /Halaman\s+(\d+)\s+dari\s+(\d+)/i.exec($("main h3").toArray().map((n) => clean($(n).text())).join(" | "));
  let totalPages = m ? Number(m[2]) : 0;
  if (!totalPages) {
    $(".pagination li a").each((_, n) => {
      const v = Number(clean($(n).text()));
      if (Number.isInteger(v) && v > totalPages) totalPages = v;
    });
  }
  if (!items.length) {
    throw new HttpError(404, totalPages && page > totalPages ? `Halaman ${page} tidak ada. ${what} hanya ${totalPages} halaman.` : `${what} tidak ditemukan di ${LK_NAME}.`);
  }
  return {
    heading: clean($("main h1").first().text()) || null,
    page,
    total_pages: Math.max(totalPages, page),
    total: items.length,
    items,
  };
}

function lkPeople($: CheerioAPI, scope: El, prefix: "artist" | "director") {
  const out: { name: string; slug: string }[] = [];
  const seen = new Set<string>();
  scope.find(`a[href*="/${prefix}/"]`).each((_, n) => {
    const m = new RegExp(`/${prefix}/([^/?#]+)`).exec($(n).attr("href") || "");
    const name = clean($(n).text());
    if (m && name && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push({ name, slug: m[1] });
    }
  });
  return out;
}

type LkEpisode = { episode: number | null; title: string | null; slug: string; url: string };
type LkSeason = { season: number; total: number; episodes: LkEpisode[] };

/** Buka halaman judul: host film dulu, lalu host serial (serial dan episodenya tinggal di host terpisah). */
async function lkOpen(slug: string): Promise<{ $: CheerioAPI; url: string }> {
  // Slug episode sudah pasti ada di host serial: lewati satu permintaan yang pasti 404.
  if (!/-season-\d+-episode-\d+/.test(slug)) {
    try {
      const page = await lkPage(`${LK}/${slug}`);
      if (page.$("h1").first().text().trim() && page.$(".movie-info").length) return page;
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e;
    }
  }
  try {
    return await lkPage(`${LK_SERIES}/${slug}`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new HttpError(404, `Judul '${slug}' tidak ditemukan di ${LK_NAME}.`);
    throw e;
  }
}

/** Daftar episode serial: <script id="season-data"> berisi JSON { "<season>": [{ episode_no, title, slug }] }. */
function lkSeasons($: CheerioAPI): LkSeason[] {
  const seasons: LkSeason[] = [];
  try {
    const data = JSON.parse($("#season-data").first().text() || "{}") as Record<string, { episode_no?: number | string; title?: string; slug?: string }[]>;
    for (const [k, list] of Object.entries(data)) {
      if (!Array.isArray(list)) continue;
      const episodes = list
        .filter((e) => e && typeof e.slug === "string" && e.slug)
        .map((e) => ({ episode: numOrNull(String(e.episode_no ?? "")), title: clean(e.title) || null, slug: e.slug as string, url: `${LK_SERIES}/${e.slug}` }))
        .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
      seasons.push({ season: Number(k) || seasons.length + 1, total: episodes.length, episodes });
    }
    seasons.sort((a, b) => a.season - b.season);
  } catch {
    /* format berubah: biarkan kosong */
  }
  return seasons;
}

async function lkDetail(slug: string) {
  const { $, url } = await lkOpen(slug);
  const info = $(".movie-info");
  const rawTitle = clean(info.find("h1").first().text());
  if (!rawTitle) throw new HttpError(404, `Judul '${slug}' tidak ditemukan di ${LK_NAME}.`);
  const named = splitYear(rawTitle);
  const series = new URL(url).hostname.endsWith("nontondrama.vip") || $("body").attr("data-web_type") === "series" || $("#season-data").length > 0;

  const tags = info.find(".info-tag span").toArray().map((n) => clean($(n).text())).filter(Boolean);
  const durTag = tags.find((t) => /^\d+h(\s*\d+m)?$|^\d+m$/i.test(t)) || null;
  const genres: { name: string; slug: string }[] = [];
  const countries: { name: string; slug: string }[] = [];
  info.find(".tag-list a[href]").each((_, n) => {
    const m = /\/(genre|country)\/([^/?#]+)/.exec($(n).attr("href") || "");
    if (m) (m[1] === "genre" ? genres : countries).push({ name: clean($(n).text()), slug: m[2] });
  });

  const meta: Record<string, string> = {};
  const detail = info.find(".detail").first();
  detail.find("p").each((_, n) => {
    const label = clean($(n).find("span").first().text()).replace(/:$/, "").toLowerCase();
    const row = $(n).clone();
    row.find("span").first().remove();
    if (label) meta[label] = clean(row.text());
  });
  const row = (label: string) => detail.find("p").filter((_, n) => clean($(n).find("span").first().text()).toLowerCase().startsWith(label)).first();

  const synEl = info.find(".synopsis").first();
  const trailer = $("a.yt-lightbox[href]").first().attr("href") || $(".trailer-series iframe").first().attr("src") || null;

  const seasons = series ? lkSeasons($) : [];

  const related: { title: string; slug: string; year: number | null; poster: string | null; url: string }[] = [];
  $(".video-list li a[href]").each((_, n) => {
    const ref = lkRef($(n).attr("href"), url);
    const title = clean($(n).find(".video-title").text());
    if (ref && title) related.push({ title, slug: ref.slug, year: numOrNull($(n).find(".video-year").text()), poster: lkPoster($(n), url), url: lkUrl(ref.slug, ref.series) });
  });
  if (!related.length) {
    for (const c of lkCards($, $(".mob-related-series"), url)) related.push({ title: c.title, slug: c.slug, year: c.year, poster: c.poster, url: lkUrl(c.slug, true) });
  }

  return {
    title: named.title,
    full_title: rawTitle,
    slug,
    type: series ? "series" : "movie",
    year: named.year,
    rating: numOrNull(info.find(".rating-number").first().attr("data-base-rating") || info.find(".rating-number").first().text()),
    votes: numOrNull(info.find(".rating-users").first().attr("data-base-votes")) ?? numOrNull((meta["votes"] || "").replace(/\./g, "")),
    tags,
    resolution: tags.find((t) => /^\d{3,4}p$/i.test(t)) || null,
    runtime: durTag,
    runtime_minutes: durTag ? minutes(durTag) : null,
    release: meta["release"] || null,
    updated: meta["updated"] || null,
    genres,
    countries,
    synopsis: clean(synEl.attr("data-full") || synEl.text()) || null,
    poster: lkPoster(detail, url) || absUrl($("#videoAd").attr("poster"), url),
    trailer,
    directors: lkPeople($, row("sutradara"), "director"),
    cast: lkPeople($, row("bintang"), "artist"),
    ...(series ? { total_seasons: seasons.length, total_episodes: seasons.reduce((n, s) => n + s.total, 0), seasons } : {}),
    related: related.slice(0, 20),
    url,
  };
}

/* ------------------------------------------------------------ player ---- */

const LK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type LkServer = {
  no: number;
  name: string;
  server: string;
  /** Alamat player yang bisa dijadikan src <iframe>; null bila tidak berhasil didapat. */
  url: string | null;
  /** true: bisa dipasang di situs mana pun. false: ditolak di luar LK21 atau videonya hilang. null: tidak sempat diperiksa. */
  embeddable: boolean | null;
  note: string | null;
  source: string;
};

const publicHttps = (raw: string): URL | null => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !isPrivateHost(u.hostname) ? u : null;
  } catch {
    return null;
  }
};

/**
 * Tautan player di halaman LK21 menunjuk halaman pembungkus (<host>/iframe3/<server>/<id>) yang hanya
 * mau dibingkai oleh domain LK21. Alamat player aslinya diminta pembungkus itu ke /api.php miliknya.
 */
async function lkResolve(source: string): Promise<string | null> {
  const u = publicHttps(source);
  const m = u ? /^\/iframe\d*\/([a-z0-9_-]+)\/([A-Za-z0-9_-]+)/i.exec(u.pathname) : null;
  if (!u || !m) return null;
  try {
    const res = await fetch(`${u.origin}/api.php`, {
      method: "POST",
      headers: { "user-agent": LK_UA, accept: "*/*", "content-type": "application/x-www-form-urlencoded", origin: u.origin, referer: u.href },
      body: new URLSearchParams({ host: m[1], id: m[2] }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { embedUrl?: unknown };
    return typeof d.embedUrl === "string" && publicHttps(d.embedUrl) ? d.embedUrl : null;
  } catch {
    return null;
  }
}

/** Baca header halaman player: boleh dibingkai situs lain atau tidak, dan apakah videonya masih ada. */
async function lkInspect(url: string, referer: string): Promise<{ embeddable: boolean | null; note: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": LK_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", referer },
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    const fa = /frame-ancestors([^;]*)/i.exec(res.headers.get("content-security-policy") || "");
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if ((fa && !/(^|\s)(\*|https:)(\s|$)/.test(fa[1])) || xfo === "deny" || xfo === "sameorigin") {
      return { embeddable: false, note: "Player ini hanya mau diputar di dalam situs LK21, tidak bisa dipasang di situs lain." };
    }
    const head = (await res.text()).slice(0, 4000);
    if (!res.ok || /<title>\s*(video not found|file not found|not found|404)/i.test(head)) {
      return { embeddable: false, note: "Video tidak tersedia di server ini." };
    }
    return { embeddable: true, note: null };
  } catch {
    return { embeddable: null, note: "Server player tidak menjawab saat diperiksa." };
  }
}

/** Halaman tonton: film (slug film) atau satu episode serial (slug serial + season/episode, atau slug episode). */
async function lkWatch(slug: string, wantSeason: number | null, wantEpisode: number | null) {
  let { $, url } = await lkOpen(slug);
  let seasons = lkSeasons($);
  const hasPlayer = () => $("#player-list a[data-url], #player-list a[href^='http'], #main-player[src]").length > 0;

  if (seasons.length && (wantSeason !== null || wantEpisode !== null || !hasPlayer())) {
    const here = new URL(url).pathname.split("/").filter(Boolean)[0] || slug;
    const current = seasons.find((se) => se.episodes.some((e) => e.slug === here));
    const season = wantSeason !== null ? seasons.find((se) => se.season === wantSeason) : current ?? seasons[0];
    if (!season) throw new HttpError(404, `Season ${wantSeason} tidak ada. Season yang tersedia: ${seasons.map((se) => se.season).join(", ")}.`);
    const ep = wantEpisode !== null ? season.episodes.find((e) => e.episode === wantEpisode) : season.episodes.find((e) => e.slug === here) ?? season.episodes[0];
    if (!ep) throw new HttpError(404, `Episode ${wantEpisode} tidak ada di season ${season.season} (tersedia ${season.total} episode).`);
    if (ep.slug !== here) {
      ({ $, url } = await lkPage(`${LK_SERIES}/${ep.slug}`));
      const again = lkSeasons($);
      if (again.length) seasons = again;
    }
  }
  if (!hasPlayer()) throw new HttpError(404, `Player video untuk '${slug}' tidak ditemukan di ${LK_NAME}.`);

  const pageSlug = new URL(url).pathname.split("/").filter(Boolean)[0] || slug;
  const info = $(".movie-info");
  const rawTitle = clean(info.find("h1").first().text()) || clean($("h1").first().text());
  const isEpisode = new URL(url).hostname.endsWith("nontondrama.vip") || $("body").attr("data-web_type") === "series";

  const raw: { name: string; server: string; source: string }[] = [];
  const seen = new Set<string>();
  $("#player-list a").each((_, n) => {
    const source = absUrl($(n).attr("data-url") || $(n).attr("href"), url);
    if (!source || !/^https:/.test(source) || seen.has(source)) return;
    seen.add(source);
    const server = clean($(n).attr("data-server") || $(n).text()).toLowerCase();
    raw.push({ name: clean($(n).text()) || server.toUpperCase(), server, source });
  });
  if (!raw.length) {
    const source = absUrl($("#main-player").attr("src"), url);
    if (source) raw.push({ name: "P2P", server: "p2p", source: source.replace(/\?.*$/, "") });
  }

  const servers: LkServer[] = await Promise.all(
    raw.slice(0, 8).map(async (r, i) => {
      const resolved = await lkResolve(r.source);
      if (!resolved) return { no: i + 1, ...r, url: null, embeddable: false, note: "Alamat player tidak berhasil diambil dari server ini." };
      return { no: i + 1, name: r.name, server: r.server, url: resolved, ...(await lkInspect(resolved, `${new URL(r.source).origin}/`)), source: r.source };
    }),
  );

  // Serial induk + posisi episode.
  const seriesLink = info.find(".detail p").filter((_, n) => /^series/i.test(clean($(n).find("span").first().text()))).find("a[href]").first();
  const seriesRef = lkRef(seriesLink.attr("href"), url);
  const series: { title: string; slug: string } | null = seriesRef ? { title: splitYear(clean(seriesLink.text())).title, slug: seriesRef.slug } : null;
  const cur = seasons.flatMap((se) => se.episodes.map((e) => ({ season: se.season, ...e }))).find((e) => e.slug === pageSlug) ?? null;
  const sm = /-season-(\d+)-episode-(\d+)/.exec(pageSlug);
  const seasonNo = cur?.season ?? (sm ? Number(sm[1]) : null);
  const episodeNo = cur?.episode ?? (sm ? Number(sm[2]) : null);
  const list = seasons.find((se) => se.season === seasonNo)?.episodes ?? [];
  const at = list.findIndex((e) => e.slug === pageSlug);

  // Navigasi episode: dari daftar season, atau dari tombol EPS di bawah player.
  const nav = (dir: "left" | "right"): string | null => {
    const a = $(`.player-action .action-right a[href]`).filter((_, n) => $(n).find(`.fa-angle-double-${dir}`).length > 0).first();
    return lkRef(a.attr("href"), url)?.slug ?? null;
  };
  const prev = at >= 0 ? (at > 0 ? list[at - 1].slug : null) : nav("left");
  const next = at >= 0 ? (at < list.length - 1 ? list[at + 1].slug : null) : nav("right");

  const download = absUrl($('.movie-action a[title^="Download"], .movie-action a[href*="dadadidi"]').first().attr("href"), url);
  const named = splitYear(rawTitle);

  return {
    title: named.title,
    slug: pageSlug,
    type: isEpisode ? ("episode" as const) : ("movie" as const),
    year: named.year,
    series,
    season: isEpisode ? seasonNo : null,
    episode: isEpisode ? episodeNo : null,
    quality: info.find(".info-tag span").toArray().map((n) => clean($(n).text())).find((t) => /^(hd|sd|cam|hdcam|ts|hdts|web-?dl|webrip|bluray|hdrip|dvdrip)$/i.test(t)) || null,
    poster: lkPoster(info.find(".detail").first(), url),
    servers,
    download,
    prev,
    next,
    seasons: seasons.map((se) => ({ season: se.season, total: se.total })),
    episodes: list.map((e) => ({ episode: e.episode, slug: e.slug })),
    url,
  };
}

function lkWatchParams(sp: URLSearchParams) {
  const slug = lkSlugParam(sp);
  const season = opt(sp, "season") ? Math.floor(num(sp, "season", 1, 1, 200)) : null;
  const episode = opt(sp, "episode") ? Math.floor(num(sp, "episode", 1, 1, 5000)) : null;
  return { slug, season, episode };
}

/** Server yang dipakai bila pengguna tidak memilih: yang pasti bisa dibingkai, lalu yang belum sempat diperiksa. */
const lkBestServer = (servers: LkServer[]) => servers.find((s) => s.url && s.embeddable === true) ?? servers.find((s) => s.url && s.embeddable === null) ?? null;

function lkEmbedHtml(title: string, url: string): string {
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
<iframe src="${escapeHtml(url)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" allowfullscreen></iframe>
</body>
</html>`;
}

const LK_SORT: Record<string, { path: string; label: string }> = {
  populer: { path: "populer", label: "Terpopuler" },
  terbaru: { path: "latest", label: "Terbaru" },
  rating: { path: "rating", label: "Rating tertinggi" },
  rilis: { path: "release", label: "Tahun rilis terbaru" },
  komentar: { path: "most-commented", label: "Komentar terbanyak" },
  unggulan: { path: "top-movie-today", label: "Unggulan hari ini" },
};

const lkEndpoints: Endpoint[] = [
  {
    category: "film", slug: "lk21-home", kind: "json",
    title: "LK21: Beranda",
    description: "Isi beranda LK21 (Layarkaca21): film unggulan, lalu tiap rak seperti Film Terbaru, Series Unggulan, Action Terbaru, dan Korea Terbaru.",
    params: [],
    handler: async () => {
      const { $, url } = await lkPage(`${LK}/`);
      const featured = lkCards($, $("#featured-slider"), url);
      const sections: { key: string | null; title: string; total: number; items: LkCard[] }[] = [];
      $("main .widget").each((_, n) => {
        const w = $(n);
        const title = clean(w.find(".header h2").first().text());
        const items = lkCards($, w, url);
        if (title && items.length) sections.push({ key: w.attr("data-type") || null, title, total: items.length, items });
      });
      if (!featured.length && !sections.length) throw new HttpError(502, `Beranda ${LK_NAME} tidak berisi daftar film (tampilan situs mungkin berubah).`);
      return { source: LK, featured, total_sections: sections.length, sections };
    },
  },
  {
    category: "film", slug: "lk21-list", kind: "json",
    title: "LK21: Daftar Film",
    description: "Daftar film LK21 menurut urutan: terpopuler, terbaru, rating tertinggi, tahun rilis, komentar terbanyak, atau unggulan hari ini. 24 judul per halaman.",
    params: [
      { name: "urut", description: "Urutan daftar. Default populer.", example: "populer", options: Object.keys(LK_SORT) },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const urut = opt(sp, "urut", "populer").toLowerCase();
      const sort = LK_SORT[urut];
      if (!sort) throw new HttpError(400, `Parameter 'urut' tidak dikenal. Pilihan: ${Object.keys(LK_SORT).join(", ")}.`);
      const page = num(sp, "page", 1, 1, 2000);
      const r = await lkListing(sort.path, page, `Daftar '${urut}'`);
      return { urut, label: sort.label, ...r };
    },
  },
  {
    category: "film", slug: "lk21-genre", kind: "json",
    title: "LK21: Film per Genre, Negara, atau Tahun",
    description: "Daftar film LK21 menurut genre (action, horror, ...), negara (usa, south-korea, ...), atau tahun rilis. 24 judul per halaman.",
    params: [
      { name: "genre", description: "Slug genre, contoh: action, horror, comedy, romance, animation.", example: "action" },
      { name: "negara", description: "Slug negara, contoh: usa, south-korea, japan, indonesia, thailand.", example: "" },
      { name: "tahun", description: "Tahun rilis, contoh: 2025.", example: "" },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const genre = opt(sp, "genre").toLowerCase();
      const negara = opt(sp, "negara").toLowerCase();
      const tahun = opt(sp, "tahun");
      const filled = [genre, negara, tahun].filter(Boolean).length;
      if (filled !== 1) throw new HttpError(400, "Isi tepat satu dari parameter 'genre', 'negara', atau 'tahun'.");
      const page = num(sp, "page", 1, 1, 2000);
      if (tahun) {
        if (!/^(19|20)\d{2}$/.test(tahun)) throw new HttpError(400, "Parameter 'tahun' harus 4 digit, contoh: 2025.");
        return { filter: "tahun", value: tahun, ...(await lkListing(`year/${tahun}`, page, `Film tahun ${tahun}`)) };
      }
      const value = cleanSlug(genre || negara, genre ? "genre" : "negara");
      if (!/^[a-z0-9-]{2,40}$/.test(value)) throw new HttpError(400, `Parameter '${genre ? "genre" : "negara"}' harus berupa slug, contoh: ${genre ? "action" : "south-korea"}.`);
      return genre
        ? { filter: "genre", value, ...(await lkListing(`genre/${value}`, page, `Genre '${value}'`)) }
        : { filter: "negara", value, ...(await lkListing(`country/${value}`, page, `Negara '${value}'`)) };
    },
  },
  {
    category: "film", slug: "lk21-detail", kind: "json",
    title: "LK21: Detail Film / Serial",
    description: "Detail lengkap satu judul LK21: sinopsis, rating, genre, negara, durasi, sutradara, pemeran, trailer, judul terkait, dan untuk serial daftar episode tiap season. Slug judul maupun slug episodenya bisa diteruskan ke film/lk21-player untuk videonya. Slug didapat dari endpoint daftar atau search/lk21.",
    params: [{ name: "slug", required: true, description: "Slug judul atau URL halaman LK21.", example: "avatar-2009" }],
    handler: async ({ sp, origin }) => {
      const d = await lkDetail(lkSlugParam(sp));
      const q = `slug=${encodeURIComponent(d.slug)}`;
      return { source: LK, ...d, player: `${origin}/api/film/lk21-player?${q}`, embed: `${origin}/api/film/lk21-embed?${q}` };
    },
  },
  {
    category: "film", slug: "lk21-pemeran", kind: "json",
    title: "LK21: Pemeran Film",
    description: "Daftar pemeran (bintang film) dan sutradara satu judul LK21. Tiap nama punya slug yang bisa dipakai di film/lk21-artis untuk melihat film lainnya. LK21 hanya menyediakan nama, tanpa foto atau nama karakter.",
    params: [{ name: "slug", required: true, description: "Slug judul atau URL halaman LK21.", example: "avatar-2009" }],
    handler: async ({ sp, origin }) => {
      const d = await lkDetail(lkSlugParam(sp));
      if (!d.cast.length && !d.directors.length) throw new HttpError(404, `${LK_NAME} tidak mencantumkan pemeran untuk '${d.full_title}'.`);
      const person = (p: { name: string; slug: string }, peran: "artis" | "sutradara") => ({
        ...p,
        films: `${origin}/api/film/lk21-artis?slug=${encodeURIComponent(p.slug)}${peran === "sutradara" ? "&peran=sutradara" : ""}`,
      });
      return {
        source: LK,
        title: d.title,
        slug: d.slug,
        type: d.type,
        year: d.year,
        poster: d.poster,
        total_cast: d.cast.length,
        cast: d.cast.map((p) => person(p, "artis")),
        directors: d.directors.map((p) => person(p, "sutradara")),
        url: d.url,
      };
    },
  },
  {
    category: "film", slug: "lk21-artis", kind: "json",
    title: "LK21: Film per Pemeran / Sutradara",
    description: "Daftar film LK21 yang dibintangi seorang pemeran, atau yang digarap seorang sutradara. Slug nama didapat dari film/lk21-pemeran atau film/lk21-detail.",
    params: [
      { name: "slug", required: true, description: "Slug nama, contoh: sam-worthington.", example: "sam-worthington" },
      { name: "peran", description: "artis (default) atau sutradara.", example: "artis", options: ["artis", "sutradara"] },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const slug = cleanSlug(need(sp, "slug", 120)).toLowerCase();
      const peran = opt(sp, "peran", "artis").toLowerCase();
      if (peran !== "artis" && peran !== "sutradara") throw new HttpError(400, "Parameter 'peran' tidak dikenal. Pilihan: artis, sutradara.");
      const page = num(sp, "page", 1, 1, 500);
      const r = await lkListing(`${peran === "artis" ? "artist" : "director"}/${slug}`, page, `${peran === "artis" ? "Pemeran" : "Sutradara"} '${slug}'`);
      const name = (r.heading || "").replace(/^(Artis|Sutradara|Director|Artist)\s+/i, "") || null;
      return { source: LK, peran, slug, name, page: r.page, total_pages: r.total_pages, total: r.total, items: r.items };
    },
  },
  {
    category: "film", slug: "lk21-player", kind: "json",
    title: "LK21: Player Film / Episode",
    description: "Daftar server player video untuk satu film atau satu episode serial LK21, lengkap dengan alamat yang bisa dijadikan src <iframe>, link unduhan, dan navigasi episode. Untuk serial, isi slug serial ditambah season dan episode, atau langsung slug episodenya. Tiap server ditandai apakah bisa dipasang di situs lain.",
    params: [
      { name: "slug", required: true, description: "Slug film, slug serial, slug episode, atau URL halaman LK21.", example: "avatar-2009" },
      { name: "season", description: "Nomor season (khusus serial). Default season pertama.", example: "1" },
      { name: "episode", description: "Nomor episode (khusus serial). Default episode pertama.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const p = lkWatchParams(sp);
      const w = await lkWatch(p.slug, p.season, p.episode);
      const embedOf = (slug: string, server?: string) => `${origin}/api/film/lk21-embed?slug=${encodeURIComponent(slug)}${server ? `&server=${encodeURIComponent(server)}` : ""}`;
      const playerOf = (slug: string | null) => (slug ? { slug, player: `${origin}/api/film/lk21-player?slug=${encodeURIComponent(slug)}`, embed: embedOf(slug) } : null);
      const best = lkBestServer(w.servers);
      return {
        source: LK,
        title: w.title,
        slug: w.slug,
        type: w.type,
        year: w.year,
        series: w.series,
        season: w.season,
        episode: w.episode,
        quality: w.quality,
        poster: w.poster,
        embed: best ? embedOf(w.slug) : null,
        default_server: best?.server ?? null,
        total_servers: w.servers.length,
        servers: w.servers.map((s) => ({
          no: s.no,
          name: s.name,
          server: s.server,
          url: s.url,
          embeddable: s.embeddable,
          note: s.note,
          embed: s.url && s.embeddable !== false ? embedOf(w.slug, s.server) : null,
          source: s.source,
        })),
        download: w.download,
        prev: playerOf(w.prev),
        next: playerOf(w.next),
        ...(w.type === "episode" ? { seasons: w.seasons, total_episodes: w.episodes.length, episodes: w.episodes } : {}),
        url: w.url,
      };
    },
  },
  {
    category: "film", slug: "lk21-embed", kind: "html",
    title: "LK21: Embed Player",
    description: "Halaman HTML berisi player video film atau episode LK21, layar penuh. Pakai URL ini langsung sebagai src <iframe> di situsmu. Tanpa parameter server, dipilih server pertama yang bisa dipasang di situs lain.",
    params: [
      { name: "slug", required: true, description: "Slug film, slug serial, slug episode, atau URL halaman LK21.", example: "avatar-2009" },
      { name: "season", description: "Nomor season (khusus serial). Default season pertama.", example: "1" },
      { name: "episode", description: "Nomor episode (khusus serial). Default episode pertama.", example: "1" },
      { name: "server", description: "Nama server (cast, hydrax, p2p) atau nomornya dari film/lk21-player. Default: otomatis.", example: "cast" },
    ],
    handler: async ({ sp }) => {
      const p = lkWatchParams(sp);
      const want = opt(sp, "server").toLowerCase();
      if (want && !/^[a-z0-9_-]{1,20}$/.test(want)) throw new HttpError(400, "Parameter 'server' diisi nama server (cast, hydrax, p2p) atau nomornya.");
      const w = await lkWatch(p.slug, p.season, p.episode);
      const usable = w.servers.filter((s) => s.url && s.embeddable !== false).map((s) => s.server);
      const hint = usable.length ? ` Server yang bisa dipakai: ${usable.join(", ")}.` : " Tidak ada server lain yang bisa dipasang di luar LK21 untuk judul ini.";
      let server: LkServer | null;
      if (want) {
        server = w.servers.find((s) => s.server === want || String(s.no) === want) ?? null;
        if (!server) throw new HttpError(404, `Server '${want}' tidak ada. Pilihan: ${w.servers.map((s) => s.server).join(", ")}.`);
        if (!server.url || server.embeddable === false) throw new HttpError(404, `Server '${server.server}' tidak bisa dipakai: ${server.note || "alamat player tidak tersedia."}${hint}`);
      } else {
        server = lkBestServer(w.servers);
        if (!server) throw new HttpError(404, `Tidak ada server player '${w.title}' yang bisa dipasang di luar situs LK21.`);
      }
      const label = w.type === "episode" && w.season !== null && w.episode !== null ? `${w.series?.title ?? w.title} S${w.season} E${w.episode}` : w.title;
      return new Response(lkEmbedHtml(label, server.url as string), {
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

export const filmEndpoints: Endpoint[] = [...lkEndpoints];
