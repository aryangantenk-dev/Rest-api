import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { isPrivateHost, need, num, opt } from "./helpers";
import { escapeHtml } from "./scrape";
import { sankaDecode, viaProxy } from "./filmproxy";

/**
 * Sankanime Movies (https://sankanime.web.id/movies).
 *
 * Situsnya adalah aplikasi React yang mengambil data dari API JSON berbasis TMDB.
 * API itu menolak IP server Vercel, jadi dipanggil lewat Supabase Edge Function
 * (supabase/functions/film-proxy; env SANKA_PROXY_URL + SANKA_PROXY_KEY).
 * API sumbernya membatasi 45 permintaan per menit, jadi jawaban disimpan sebentar
 * di memori dan jumlah panggilan keluar dibatasi.
 */

const SK_API = "https://www.sankavollerei.web.id/plananimek/movie";
const SK_SITE = "https://sankanime.web.id";
const SK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type J = Record<string, unknown>;
type SkType = "movie" | "tv";

const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numv = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const yearOf = (v: unknown): number | null => {
  const m = /^(\d{4})/.exec(str(v) ?? "");
  return m ? Number(m[1]) : null;
};
const notNull = <T>(v: T | null): v is T => v !== null;

/* ------------------------------------------------------------ pengambilan */

const SK_TTL = 5 * 60_000;
const SK_MAX_PER_MINUTE = 30;
const skCache = new Map<string, { at: number; data: J }>();
const skCalls: number[] = [];

async function skGet(path: string, what = "Data", ttl = SK_TTL): Promise<J> {
  const now = Date.now();
  const hit = skCache.get(path);
  if (hit && now - hit.at < ttl) return hit.data;

  while (skCalls.length && now - skCalls[0] > 60_000) skCalls.shift();
  if (skCalls.length >= SK_MAX_PER_MINUTE) throw new HttpError(429, "Permintaan ke Sankanime sedang padat. Coba lagi sekitar satu menit lagi.");
  skCalls.push(now);

  const r = await viaProxy(`${SK_API}${path}`, { via: "sanka", accept: "application/json, text/plain, */*", referer: `${SK_SITE}/`, origin: true });
  if (r.status === 404) throw new HttpError(404, `${what} tidak ditemukan di Sankanime.`);
  if (r.status === 403 || r.status === 429 || r.status === 503 || /^\s*</.test(r.text)) {
    throw new HttpError(502, `Sankanime menolak permintaan dari server perantara (HTTP ${r.status}).`);
  }
  let data: J;
  try {
    data = obj(sankaDecode(r.text));
  } catch (e) {
    if (r.status < 200 || r.status >= 300) throw new HttpError(502, `Sankanime merespons dengan status ${r.status}.`);
    throw e;
  }
  if (data.status === false || data.success === false || r.status < 200 || r.status >= 300) {
    const msg = str(data.message) ?? str(data.error);
    // Untuk id yang tidak dikenal, API sumber menjawab HTTP 500 alih-alih 404.
    if (r.status === 500 && /^\/(detail|person)\//.test(path)) throw new HttpError(404, `${what} tidak ditemukan di Sankanime (sumber menjawab HTTP 500).`);
    if (r.status >= 500) throw new HttpError(502, `Sankanime sedang bermasalah (HTTP ${r.status})${msg ? `: ${msg}` : "."}`);
    throw new HttpError(404, `${what} tidak ditemukan di Sankanime${msg ? ` (${msg})` : ""}.`);
  }
  if (skCache.size >= 300) {
    const oldest = skCache.keys().next().value;
    if (oldest !== undefined) skCache.delete(oldest);
  }
  skCache.set(path, { at: now, data });
  return data;
}

/* ------------------------------------------------------------- parameter */

function skType(sp: URLSearchParams, fallback: SkType | null = "movie"): SkType {
  const raw = opt(sp, "tipe", opt(sp, "type")).toLowerCase();
  if (!raw) {
    if (fallback) return fallback;
    throw new HttpError(400, "Parameter 'tipe' wajib diisi: movie atau tv.");
  }
  if (raw === "movie" || raw === "film") return "movie";
  if (raw === "tv" || raw === "series" || raw === "serial") return "tv";
  throw new HttpError(400, "Parameter 'tipe' tidak dikenal. Pilihan: movie, tv.");
}

/** Terima id TMDB ("19995") atau slug Sankanime ("avatar-19995"). */
function skId(sp: URLSearchParams, name = "id"): number {
  const raw = need(sp, name, 200);
  const m = /(?:^|-)(\d{1,9})$/.exec(raw);
  if (!m) throw new HttpError(400, `Parameter '${name}' harus berupa id angka atau slug yang diakhiri id, contoh: 19995 atau avatar-19995.`);
  return Number(m[1]);
}

function skPosInt(sp: URLSearchParams, name: string, min = 1): number | null {
  const raw = opt(sp, name);
  if (!raw) return null;
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < min) throw new HttpError(400, `Parameter '${name}' harus berupa angka mulai dari ${min}.`);
  return Number(raw);
}

/* ------------------------------------------------------------------ kartu */

const SK_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};
const slugify = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const skLink = (origin: string, slug: string, q: Record<string, string | number | null | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  return `${origin}/api/film/${slug}?${qs}`;
};

function skCard(v: unknown, origin: string) {
  const o = obj(v);
  const id = numv(o.tmdbId) ?? numv(o.id);
  const title = str(o.title) ?? str(o.name);
  if (id === null || !title) return null;
  const type: SkType = o.type === "tv" ? "tv" : "movie";
  const rank = numv(o.rank);
  return {
    ...(rank !== null ? { rank } : {}),
    id,
    type,
    title,
    slug: str(o.slug),
    year: yearOf(o.release_date),
    release_date: str(o.release_date),
    rating: numv(o.rating),
    language: str(o.original_language),
    genres: arr(o.genre_ids).map((g) => SK_GENRES[Number(g)]).filter(Boolean),
    adult: o.adult === true,
    synopsis: str(o.synopsis),
    poster: str(o.poster),
    cover: str(o.cover),
    detail: skLink(origin, "sanka-detail", { id, tipe: type }),
  };
}
const skCards = (v: unknown, origin: string) => arr(v).map((x) => skCard(x, origin)).filter(notNull);

function skPaged(d: J, origin: string, page: number) {
  const p = obj(d.pagination);
  const items = skCards(d.data, origin);
  return {
    page: numv(p.current_page) ?? page,
    total_pages: numv(p.total_pages),
    has_next: p.has_next_page === true,
    total: items.length,
    items,
  };
}

/* ----------------------------------------------------------------- player */

type SkServer = { no: number; name: string; server: string; host: string; url: string; embeddable: boolean | null; note: string | null; embed: string | null };

const publicHttps = (raw: unknown): URL | null => {
  const s = str(raw);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && !isPrivateHost(u.hostname) ? u : null;
  } catch {
    return null;
  }
};

/** Boleh-tidaknya sebuah host player dipasang di situs lain dilihat dari header-nya; hasilnya diingat per host. */
const skHostCache = new Map<string, { at: number; ttl: number; v: { embeddable: boolean | null; note: string | null } }>();

async function skInspect(u: URL): Promise<{ embeddable: boolean | null; note: string | null }> {
  const hit = skHostCache.get(u.hostname);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.v;
  let v: { embeddable: boolean | null; note: string | null };
  let ttl = 6 * 3600_000;
  try {
    const res = await fetch(u.href, {
      headers: { "user-agent": SK_UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    await res.body?.cancel();
    const fa = /frame-ancestors([^;]*)/i.exec(res.headers.get("content-security-policy") || "");
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if ((fa && !/(^|\s)(\*|https:)(\s|$)/.test(fa[1])) || xfo === "deny" || xfo === "sameorigin") {
      v = { embeddable: false, note: "Server ini tidak mengizinkan player-nya dipasang di situs lain." };
    } else if (res.ok) {
      v = { embeddable: true, note: null };
    } else {
      v = { embeddable: null, note: `Belum bisa dipastikan: server player menjawab HTTP ${res.status} saat diperiksa.` };
      ttl = 10 * 60_000;
    }
  } catch {
    v = { embeddable: null, note: "Belum bisa dipastikan: server player tidak menjawab saat diperiksa." };
    ttl = 10 * 60_000;
  }
  skHostCache.set(u.hostname, { at: Date.now(), ttl, v });
  return v;
}

type SkEpRef = { season: number; episode: number };

function skWatchParams(sp: URLSearchParams) {
  return { id: skId(sp), type: skType(sp), season: skPosInt(sp, "season", 0), episode: skPosInt(sp, "episode") };
}

const skWatchQuery = (id: number, type: SkType, ep: SkEpRef | null) => ({ id, tipe: type, season: ep?.season, episode: ep?.episode });

async function skWatch(id: number, type: SkType, wantSeason: number | null, wantEpisode: number | null, origin: string) {
  if (type === "movie" && (wantSeason !== null || wantEpisode !== null)) {
    throw new HttpError(400, "Parameter 'season' dan 'episode' hanya untuk tipe=tv.");
  }
  const ep: SkEpRef | null = type === "tv" ? { season: wantSeason ?? 1, episode: wantEpisode ?? 1 } : null;
  const what = type === "tv" ? `Serial dengan id ${id}` : `Film dengan id ${id}`;
  const d = await skGet(`/servers?type=${type}&id=${id}${ep ? `&season=${ep.season}&episode=${ep.episode}` : ""}`, what);
  // Tanpa id yang sah, API sumber diam-diam mengembalikan judul lain.
  if (numv(d.tmdbId) !== id || (str(d.type) ?? type) !== type) throw new HttpError(404, `${what} tidak ditemukan di Sankanime.`);
  const title = str(d.title);
  if (!title) throw new HttpError(404, `${what} tidak ditemukan di Sankanime. Periksa id dan parameter 'tipe' (movie atau tv).`);

  const seasons = arr(d.seasonsList)
    .map((s) => {
      const o = obj(s);
      const season = numv(o.season_number);
      return season === null ? null : { season, name: str(o.name), total: numv(o.episode_count) ?? 0, air_date: str(o.air_date) };
    })
    .filter(notNull)
    .sort((a, b) => a.season - b.season);

  let prev: SkEpRef | null = null;
  let next: SkEpRef | null = null;
  if (ep) {
    if (seasons.length && !seasons.some((s) => s.season === ep.season)) throw new HttpError(404, `Season ${ep.season} tidak ada. Season yang tersedia: ${seasons.map((s) => s.season).join(", ")}.`);
    // Season 0 berisi episode spesial; navigasinya tidak disambung ke season biasa.
    const line = seasons.filter((s) => (ep.season === 0 ? s.season === 0 : s.season >= 1));
    const at = line.findIndex((s) => s.season === ep.season);
    const cur = line[at];
    if (cur && cur.total > 0 && ep.episode > cur.total) throw new HttpError(404, `Episode ${ep.episode} tidak ada di season ${ep.season} (tersedia ${cur.total} episode).`);
    if (ep.episode > 1) prev = { season: ep.season, episode: ep.episode - 1 };
    else {
      const before = line.slice(0, Math.max(at, 0)).reverse().find((s) => s.total > 0);
      if (before) prev = { season: before.season, episode: before.total };
    }
    if (cur && ep.episode < cur.total) next = { season: ep.season, episode: ep.episode + 1 };
    else if (cur) {
      const after = line.slice(at + 1).find((s) => s.total > 0);
      if (after) next = { season: after.season, episode: 1 };
    }
  }

  const q = skWatchQuery(id, type, ep);
  const raw = arr(d.servers)
    .map((s) => {
      const o = obj(s);
      const u = publicHttps(o.url);
      const server = (str(o.server) ?? str(o.id) ?? "").toLowerCase();
      return u && /^[a-z0-9][a-z0-9_-]{0,30}$/.test(server) ? { name: str(o.name) ?? server.toUpperCase(), server, u } : null;
    })
    .filter(notNull);
  if (!raw.length) throw new HttpError(404, `Sankanime tidak punya server player untuk '${title}'.`);
  const checks = await Promise.all(raw.map((s) => skInspect(s.u)));
  const servers: SkServer[] = raw.map((s, i) => ({
    no: i + 1,
    name: s.name,
    server: s.server,
    host: s.u.hostname,
    url: s.u.href,
    embeddable: checks[i].embeddable,
    note: checks[i].note,
    embed: checks[i].embeddable === false ? null : skLink(origin, "sanka-embed", { ...q, server: s.server }),
  }));
  const best = servers.find((s) => s.embeddable === true) ?? servers.find((s) => s.embeddable === null) ?? null;
  const nav = (r: SkEpRef | null) =>
    r ? { ...r, player: skLink(origin, "sanka-player", skWatchQuery(id, type, r)), embed: skLink(origin, "sanka-embed", skWatchQuery(id, type, r)) } : null;

  return {
    id,
    type,
    title,
    label: ep ? `${title} S${ep.season} E${ep.episode}` : title,
    season: ep?.season ?? null,
    episode: ep?.episode ?? null,
    best,
    servers,
    seasons,
    prev: nav(prev),
    next: nav(next),
    query: q,
  };
}

function skEmbedHtml(w: Awaited<ReturnType<typeof skWatch>>, server: SkServer, origin: string, showNav: boolean): string {
  const usable = w.servers.filter((s) => s.embeddable !== false);
  const link = (q: Record<string, string | number | null | undefined>) => escapeHtml(skLink(origin, "sanka-embed", q));
  const bar = showNav
    ? `<nav>
${w.prev ? `<a class="ep" href="${link({ ...skWatchQuery(w.id, w.type, w.prev), server: server.server })}" title="Episode sebelumnya">&#9664; S${w.prev.season} E${w.prev.episode}</a>` : ""}
<span class="t">${escapeHtml(w.label)}</span>
<span class="s">${usable.map((s) => (s.server === server.server ? `<b>${escapeHtml(s.name)}</b>` : `<a href="${link({ ...w.query, server: s.server })}">${escapeHtml(s.name)}</a>`)).join("")}</span>
${w.next ? `<a class="ep" href="${link({ ...skWatchQuery(w.id, w.type, w.next), server: server.server })}" title="Episode berikutnya">S${w.next.season} E${w.next.episode} &#9654;</a>` : ""}
</nav>`
    : `<div class="sr"><h1>${escapeHtml(w.label)}</h1></div>`;
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="origin">
<title>${escapeHtml(w.label)}</title>
<style>
html,body{margin:0;height:100%;background:#000;color:#ddd;font:13px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{display:flex;flex-direction:column}
iframe{flex:1 1 auto;width:100%;min-height:0;border:0;background:#000}
nav{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 8px;background:#111;border-top:1px solid #222;overflow-x:auto;white-space:nowrap}
nav .t{color:#888;margin-right:auto;overflow:hidden;text-overflow:ellipsis;max-width:40vw}
nav .s{display:flex;gap:4px}
nav a,nav b{display:inline-block;padding:5px 9px;border-radius:6px;background:#222;color:#ddd;text-decoration:none;font-weight:500}
nav a:hover{background:#333}
nav b{background:#e11d48;color:#fff}
nav a.ep{background:#1d4ed8;color:#fff}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style>
</head>
<body>
<iframe src="${escapeHtml(server.url)}" title="${escapeHtml(w.label)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock" allowfullscreen referrerpolicy="origin"></iframe>
${bar}
</body>
</html>`;
}

/* ------------------------------------------------------------- endpoint */

const SK_SORT: Record<string, { movie: string; tv: string; label: string }> = {
  populer: { movie: "popularity.desc", tv: "popularity.desc", label: "Terpopuler" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc", label: "Rating tertinggi" },
  terbaru: { movie: "primary_release_date.desc", tv: "first_air_date.desc", label: "Rilis terbaru" },
};

const P_ID = { name: "id", required: true, description: "Id TMDB atau slug Sankanime dari hasil pencarian/daftar, contoh: 19995 atau avatar-19995.", example: "19995" };
const P_TIPE = { name: "tipe", description: "movie (default) atau tv. Harus sama dengan field 'type' pada hasil pencarian/daftar.", example: "movie", options: ["movie", "tv"] };
const P_SEASON = { name: "season", description: "Nomor season, hanya untuk tipe=tv. Default 1.", example: "" };
const P_EPISODE = { name: "episode", description: "Nomor episode, hanya untuk tipe=tv. Default 1.", example: "" };

export const sankaEndpoints: Endpoint[] = [
  {
    category: "film", slug: "sanka-home", kind: "json",
    title: "Sankanime: Beranda Film & Serial",
    description: "Isi beranda Sankanime Movies: film yang sedang tayang, populer, rating tertinggi, segera tayang, serta serial terbaru, populer, dan rating tertinggi.",
    params: [],
    handler: async ({ origin }) => {
      const d = obj((await skGet("/home", "Beranda")).data);
      const m = obj(d.movies);
      const t = obj(d.tv);
      return {
        source: SK_SITE,
        movies: { now_playing: skCards(m.nowPlaying, origin), popular: skCards(m.popular, origin), top_rated: skCards(m.topRated, origin), upcoming: skCards(m.upcoming, origin) },
        tv: { latest: skCards(t.latest, origin), popular: skCards(t.popular, origin), top_rated: skCards(t.topRated, origin) },
      };
    },
  },
  {
    category: "film", slug: "sanka-search", kind: "json",
    title: "Sankanime: Cari Film & Serial",
    description: "Cari film dan serial di Sankanime Movies berdasarkan judul. Tiap hasil membawa id dan type untuk dipakai di film/sanka-detail dan film/sanka-player.",
    params: [
      { name: "q", required: true, description: "Judul yang dicari.", example: "avatar" },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const q = need(sp, "q", 100);
      const page = num(sp, "page", 1, 1, 500);
      const d = await skGet(`/search?q=${encodeURIComponent(q)}&page=${page}`, `Hasil pencarian '${q}'`);
      return { source: SK_SITE, query: q, ...skPaged(d, origin, page) };
    },
  },
  {
    category: "film", slug: "sanka-trending", kind: "json",
    title: "Sankanime: Film & Serial Trending",
    description: "Daftar film atau serial yang sedang trending hari ini atau minggu ini, lengkap dengan peringkatnya.",
    params: [
      P_TIPE,
      { name: "periode", description: "day (hari ini) atau week (minggu ini, default).", example: "week", options: ["day", "week"] },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const type = skType(sp);
      const periode = opt(sp, "periode", "week").toLowerCase();
      if (periode !== "day" && periode !== "week") throw new HttpError(400, "Parameter 'periode' tidak dikenal. Pilihan: day, week.");
      const page = num(sp, "page", 1, 1, 500);
      const d = await skGet(`/trending?type=${type}&period=${periode}&page=${page}`, "Daftar trending");
      return { source: SK_SITE, type, periode, ...skPaged(d, origin, page) };
    },
  },
  {
    category: "film", slug: "sanka-list", kind: "json",
    title: "Sankanime: Daftar Film / Serial (Filter)",
    description: "Daftar film atau serial dengan urutan dan saringan: genre, tahun rilis, dan bahasa asli. Id genre didapat dari film/sanka-genre.",
    params: [
      P_TIPE,
      { name: "urut", description: "populer (default), rating, atau terbaru.", example: "populer", options: Object.keys(SK_SORT) },
      { name: "genre", description: "Id atau nama genre, contoh: 28 atau action. Boleh dikosongkan.", example: "" },
      { name: "tahun", description: "Tahun rilis, contoh: 2025. Boleh dikosongkan.", example: "" },
      { name: "bahasa", description: "Kode bahasa asli dua huruf, contoh: id, ko, ja, en. Boleh dikosongkan.", example: "" },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const type = skType(sp);
      const urut = opt(sp, "urut", "populer").toLowerCase();
      const sort = SK_SORT[urut];
      if (!sort) throw new HttpError(400, `Parameter 'urut' tidak dikenal. Pilihan: ${Object.keys(SK_SORT).join(", ")}.`);
      const page = num(sp, "page", 1, 1, 500);
      const qs = new URLSearchParams({ type, sort_by: sort[type], page: String(page) });

      const genreRaw = opt(sp, "genre").toLowerCase();
      let genre: { id: number; name: string | null } | null = null;
      if (genreRaw) {
        const m = /(?:^|-)(\d{1,6})$/.exec(genreRaw);
        const found = m ? Number(m[1]) : Number(Object.keys(SK_GENRES).find((k) => slugify(SK_GENRES[Number(k)]) === slugify(genreRaw)) ?? NaN);
        if (!Number.isFinite(found)) throw new HttpError(400, `Genre '${genreRaw}' tidak dikenal. Lihat daftarnya di film/sanka-genre.`);
        genre = { id: found, name: SK_GENRES[found] ?? null };
        qs.set("with_genres", String(found));
      }
      const tahun = opt(sp, "tahun");
      if (tahun) {
        if (!/^(19|20)\d{2}$/.test(tahun)) throw new HttpError(400, "Parameter 'tahun' harus empat angka, contoh: 2025.");
        qs.set("year", tahun);
      }
      const bahasa = opt(sp, "bahasa").toLowerCase();
      if (bahasa) {
        if (!/^[a-z]{2}$/.test(bahasa)) throw new HttpError(400, "Parameter 'bahasa' harus kode dua huruf, contoh: id, ko, ja, en.");
        qs.set("with_original_language", bahasa);
      }
      const d = await skGet(`/filter?${qs}`, "Daftar");
      return { source: SK_SITE, type, urut, label: sort.label, genre, tahun: tahun ? Number(tahun) : null, bahasa: bahasa || null, ...skPaged(d, origin, page) };
    },
  },
  {
    category: "film", slug: "sanka-genre", kind: "json",
    title: "Sankanime: Daftar Genre",
    description: "Daftar genre film dan genre serial beserta id-nya, untuk parameter 'genre' di film/sanka-list.",
    params: [],
    handler: async () => {
      const d = await skGet("/genres", "Daftar genre", 6 * 3600_000);
      const list = (v: unknown) =>
        arr(v)
          .map((g) => {
            const o = obj(g);
            const id = numv(o.id);
            const name = str(o.name);
            return id === null || !name ? null : { id, name, slug: slugify(name) };
          })
          .filter(notNull);
      return { source: SK_SITE, movie: list(d.movieGenres), tv: list(d.tvGenres) };
    },
  },
  {
    category: "film", slug: "sanka-jadwal", kind: "json",
    title: "Sankanime: Jadwal Tayang Serial",
    description: "Daftar serial yang punya episode tayang hari ini menurut Sankanime Movies.",
    params: [{ name: "page", description: "Nomor halaman. Default 1.", example: "1" }],
    handler: async ({ sp, origin }) => {
      const page = num(sp, "page", 1, 1, 500);
      const d = await skGet(`/schedule?page=${page}`, "Jadwal tayang");
      return { source: SK_SITE, ...skPaged(d, origin, page) };
    },
  },
  {
    category: "film", slug: "sanka-detail", kind: "json",
    title: "Sankanime: Detail Film / Serial",
    description: "Detail lengkap sebuah film atau serial: sinopsis, genre, durasi, sutradara, penulis, daftar pemeran beserta nama tokoh dan fotonya, trailer, daftar season, rekomendasi, serta tautan player-nya.",
    params: [P_ID, P_TIPE],
    handler: async ({ sp, origin }) => {
      const id = skId(sp);
      const type = skType(sp);
      const d = obj((await skGet(`/detail/${type}/${id}`, type === "tv" ? `Serial dengan id ${id}` : `Film dengan id ${id}`)).data);
      const title = str(d.title);
      if (!title) throw new HttpError(404, `Judul dengan id ${id} tidak ditemukan di Sankanime. Periksa parameter 'tipe' (movie atau tv).`);
      const people = (v: unknown) =>
        arr(v)
          .map((x) => {
            const o = obj(x);
            const pid = numv(o.id);
            const name = str(o.name);
            return pid === null || !name ? null : { id: pid, name };
          })
          .filter(notNull);
      const directorId = numv(d.directorId);
      const cast = arr(d.casts)
        .map((x) => {
          const o = obj(x);
          const pid = numv(o.id);
          const name = str(o.name);
          return pid === null || !name ? null : { id: pid, name, character: str(o.character), image: str(o.image), films: skLink(origin, "sanka-artis", { id: pid }) };
        })
        .filter(notNull);
      const seasons = arr(d.seasons)
        .map((x) => {
          const o = obj(x);
          const season = numv(o.season_number);
          if (season === null) return null;
          return {
            season,
            name: str(o.name),
            total: numv(o.episode_count) ?? 0,
            air_date: str(o.air_date),
            rating: numv(o.vote_average),
            overview: str(o.overview),
            poster: str(o.poster_path),
            episodes: skLink(origin, "sanka-season", { id, season }),
          };
        })
        .filter(notNull);
      const col = obj(d.collection);
      return {
        source: SK_SITE,
        id,
        type,
        title,
        slug: str(d.slug),
        tagline: str(d.tagline),
        year: yearOf(d.release_date),
        release_date: str(d.release_date),
        status: str(d.status),
        duration: str(d.duration),
        rating: numv(d.rating),
        certification: str(d.certification) ?? str(d.content_rating),
        language: str(d.original_language),
        countries: arr(d.origin_country).map(str).filter(notNull),
        genres: arr(d.genres).map((g) => ({ id: numv(obj(g).id), name: str(obj(g).name) })).filter((g) => g.id !== null && g.name),
        synopsis: str(d.synopsis),
        poster: str(d.poster),
        cover: str(d.cover),
        imdb_id: str(d.imdb_id),
        imdb_url: str(d.imdb_url),
        budget: str(d.budget_formatted),
        revenue: str(d.revenue_formatted),
        director: str(d.director) ? { id: directorId, name: str(d.director), films: directorId !== null ? skLink(origin, "sanka-artis", { id: directorId }) : null } : null,
        writers: people(d.writers),
        total_cast: cast.length,
        cast,
        trailers: arr(d.trailers)
          .map((x) => {
            const o = obj(x);
            const url = str(o.url);
            return url ? { name: str(o.name), type: str(o.type), site: str(o.site), official: o.official === true, url } : null;
          })
          .filter(notNull),
        collection: numv(col.id) !== null ? { id: numv(col.id), name: str(col.name), poster: str(col.poster), cover: str(col.backdrop) } : null,
        networks: arr(d.networks).map((x) => str(obj(x).name)).filter(notNull),
        companies: arr(d.production_companies).map((x) => str(obj(x).name)).filter(notNull),
        ...(type === "tv" ? { total_seasons: numv(d.number_of_seasons) ?? seasons.length, total_episodes: numv(d.number_of_episodes), seasons } : {}),
        player: skLink(origin, "sanka-player", { id, tipe: type }),
        embed: skLink(origin, "sanka-embed", { id, tipe: type }),
        download: skLink(origin, "sanka-download", { id, tipe: type }),
        recommendations: skCards(d.recommendations, origin),
      };
    },
  },
  {
    category: "film", slug: "sanka-season", kind: "json",
    title: "Sankanime: Daftar Episode per Season",
    description: "Daftar episode satu season sebuah serial: judul, ringkasan, tanggal tayang, durasi, gambar, dan tautan player tiap episode.",
    params: [
      { ...P_ID, description: "Id TMDB atau slug serial, contoh: 284833 atau avatar-seven-havens-284833.", example: "284833" },
      { name: "season", description: "Nomor season. Default 1.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const id = skId(sp);
      const season = skPosInt(sp, "season", 0) ?? 1;
      const d = obj((await skGet(`/detail/tv/${id}/season/${season}`, `Season ${season} serial dengan id ${id}`)).data);
      const episodes = arr(d.episodes)
        .map((x) => {
          const o = obj(x);
          const episode = numv(o.episode_number);
          if (episode === null) return null;
          const q = { id, tipe: "tv", season, episode };
          return {
            episode,
            title: str(o.name),
            overview: str(o.overview),
            air_date: str(o.air_date),
            runtime_minutes: numv(o.runtime),
            rating: numv(o.rating),
            image: str(o.still_path),
            player: skLink(origin, "sanka-player", q),
            embed: skLink(origin, "sanka-embed", q),
          };
        })
        .filter(notNull);
      if (!episodes.length && !str(d.name)) throw new HttpError(404, `Season ${season} serial dengan id ${id} tidak ditemukan di Sankanime.`);
      return { source: SK_SITE, id, type: "tv", season: numv(d.season_number) ?? season, name: str(d.name), overview: str(d.overview), air_date: str(d.air_date), poster: str(d.poster_path), total: episodes.length, episodes };
    },
  },
  {
    category: "film", slug: "sanka-artis", kind: "json",
    title: "Sankanime: Profil & Film Pemeran",
    description: "Profil seorang pemeran atau sutradara (biografi, tanggal dan tempat lahir, foto) beserta daftar film dan serialnya. Id didapat dari daftar pemeran di film/sanka-detail.",
    params: [{ name: "id", required: true, description: "Id orang dari film/sanka-detail, contoh: 65731 (Sam Worthington).", example: "65731" }],
    handler: async ({ sp, origin }) => {
      const id = skId(sp);
      const d = obj((await skGet(`/person/${id}`, `Pemeran dengan id ${id}`)).data);
      const name = str(d.name);
      if (!name) throw new HttpError(404, `Pemeran dengan id ${id} tidak ditemukan di Sankanime.`);
      const movies = skCards(d.movies, origin);
      const series = skCards(d.series, origin);
      return {
        source: SK_SITE,
        id,
        name,
        department: str(d.known_for_department),
        birthday: str(d.birthday),
        deathday: str(d.deathday),
        place_of_birth: str(d.place_of_birth),
        image: str(d.profile_path),
        biography: str(d.biography),
        total_movies: movies.length,
        total_series: series.length,
        movies,
        series,
      };
    },
  },
  {
    category: "film", slug: "sanka-player", kind: "json",
    title: "Sankanime: Player Video Film / Episode",
    description: "Daftar server player sebuah film atau satu episode serial. Tiap server berisi alamat player untuk <iframe> dan tanda bisa-tidaknya dipasang di situs lain. Untuk serial ada navigasi episode sebelumnya dan berikutnya. Pakai film/sanka-embed bila ingin halaman player siap pasang.",
    params: [P_ID, P_TIPE, P_SEASON, P_EPISODE],
    handler: async ({ sp, origin }) => {
      const p = skWatchParams(sp);
      const w = await skWatch(p.id, p.type, p.season, p.episode, origin);
      return {
        source: SK_SITE,
        id: w.id,
        type: w.type,
        title: w.title,
        season: w.season,
        episode: w.episode,
        embed: w.best ? skLink(origin, "sanka-embed", w.query) : null,
        default_server: w.best?.server ?? null,
        total_servers: w.servers.length,
        servers: w.servers,
        stream: skLink(origin, "sanka-stream", w.query),
        download: skLink(origin, "sanka-download", w.query),
        prev: w.prev,
        next: w.next,
        ...(w.type === "tv" ? { seasons: w.seasons } : {}),
      };
    },
  },
  {
    category: "film", slug: "sanka-embed", kind: "html",
    title: "Sankanime: Halaman Player (Embed)",
    description: "Halaman HTML berisi player film atau episode serial, siap dipakai sebagai src <iframe> atau dibuka langsung. Di bawah player ada tombol ganti server dan episode sebelumnya/berikutnya; tambahkan nav=0 untuk menyembunyikannya.",
    params: [
      P_ID,
      P_TIPE,
      P_SEASON,
      P_EPISODE,
      { name: "server", description: "Nama server dari film/sanka-player, contoh: hd-1. Kosongkan untuk server bawaan.", example: "" },
      { name: "nav", description: "Isi 0 untuk menyembunyikan baris tombol server dan episode.", example: "" },
    ],
    handler: async ({ sp, origin }) => {
      const p = skWatchParams(sp);
      const want = opt(sp, "server").toLowerCase();
      const w = await skWatch(p.id, p.type, p.season, p.episode, origin);
      const usable = w.servers.filter((s) => s.embeddable !== false).map((s) => s.server);
      let server: SkServer | null;
      if (want) {
        server = w.servers.find((s) => s.server === want || String(s.no) === want) ?? null;
        if (!server) throw new HttpError(404, `Server '${want}' tidak ada. Pilihan: ${w.servers.map((s) => s.server).join(", ")}.`);
        if (server.embeddable === false) throw new HttpError(404, `Server '${server.server}' tidak bisa dipakai: ${server.note}${usable.length ? ` Server yang bisa dipakai: ${usable.join(", ")}.` : ""}`);
      } else {
        server = w.best;
        if (!server) throw new HttpError(404, `Tidak ada server player '${w.label}' yang bisa dipasang di situs lain.`);
      }
      return new Response(skEmbedHtml(w, server, origin, opt(sp, "nav") !== "0"), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=600",
          "content-security-policy": "default-src 'none'; frame-src https:; style-src 'unsafe-inline'; frame-ancestors *",
          "x-robots-tag": "noindex",
        },
      });
    },
  },
  {
    category: "film", slug: "sanka-stream", kind: "json",
    title: "Sankanime: Link Stream (m3u8) & Subtitle",
    description: "Alamat stream langsung (HLS .m3u8) sebuah film atau episode beserta daftar subtitle, termasuk subtitle Indonesia bila ada. Stream ini umumnya hanya mau diputar bila permintaannya membawa header pada field 'headers' (Referer/Origin), jadi cocok untuk aplikasi atau bot, bukan untuk tag <video> biasa di browser.",
    params: [P_ID, P_TIPE, P_SEASON, P_EPISODE],
    handler: async ({ sp }) => {
      const p = skWatchParams(sp);
      if (p.type === "movie" && (p.season !== null || p.episode !== null)) throw new HttpError(400, "Parameter 'season' dan 'episode' hanya untuk tipe=tv.");
      const ep = p.type === "tv" ? { season: p.season ?? 1, episode: p.episode ?? 1 } : null;
      const what = `Stream ${p.type === "tv" ? "serial" : "film"} dengan id ${p.id}`;
      const d = await skGet(`/stream?type=${p.type}&id=${p.id}${ep ? `&season=${ep.season}&episode=${ep.episode}` : ""}`, what, 60_000);
      if (numv(d.tmdbId) !== p.id) throw new HttpError(404, `${what} tidak ditemukan di Sankanime.`);
      const sl = obj(d.streamingLink);
      const file = publicHttps(obj(sl.link).file);
      if (!file) throw new HttpError(404, `Sankanime belum punya link stream untuk '${str(d.title) ?? p.id}'. Coba film/sanka-player untuk memakai server player.`);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj(sl.headers))) if (typeof v === "string" && /^[\w-]{1,40}$/.test(k)) headers[k] = v;
      const subtitles = arr(sl.tracks)
        .map((x) => {
          const o = obj(x);
          const u = publicHttps(o.file);
          if (!u) return null;
          const inner = u.pathname.endsWith("/subtitle/proxy") ? publicHttps(u.searchParams.get("url")) : null;
          return { label: str(o.label), default: o.default === true, url: u.href, source: inner?.href ?? null };
        })
        .filter(notNull);
      return {
        source: SK_SITE,
        id: p.id,
        type: p.type,
        title: str(d.title),
        season: ep?.season ?? null,
        episode: ep?.episode ?? null,
        server: str(d.server),
        stream: { url: file.href, type: str(obj(sl.link).type) ?? "hls", headers },
        total_subtitles: subtitles.length,
        subtitles,
        poster: str(d.poster),
        cover: str(d.cover),
      };
    },
  },
  {
    category: "film", slug: "sanka-download", kind: "json",
    title: "Sankanime: Link Unduhan Film / Episode",
    description: "Daftar link unduhan sebuah film atau episode serial beserta resolusi dan ukurannya, ditambah link subtitle bila ada.",
    params: [P_ID, P_TIPE, P_SEASON, P_EPISODE],
    handler: async ({ sp }) => {
      const p = skWatchParams(sp);
      if (p.type === "movie" && (p.season !== null || p.episode !== null)) throw new HttpError(400, "Parameter 'season' dan 'episode' hanya untuk tipe=tv.");
      const ep = p.type === "tv" ? { season: p.season ?? 1, episode: p.episode ?? 1 } : null;
      const what = `Unduhan ${p.type === "tv" ? "serial" : "film"} dengan id ${p.id}`;
      const d = await skGet(`/download?id=${p.id}&type=${p.type}${ep ? `&season=${ep.season}&episode=${ep.episode}` : ""}`, what, 60_000);
      if (numv(d.tmdbId) !== p.id) throw new HttpError(404, `${what} tidak ditemukan di Sankanime.`);
      const links = arr(d.links)
        .map((x) => {
          const o = obj(x);
          const u = publicHttps(o.url);
          return u ? { name: str(o.name), quality: numv(o.quality), size: str(o.size), url: u.href } : null;
        })
        .filter(notNull);
      const subtitles = arr(d.subtitles)
        .map((x) => {
          const o = obj(x);
          const u = publicHttps(o.file);
          return u ? { label: str(o.label), url: u.href } : null;
        })
        .filter(notNull);
      return {
        source: SK_SITE,
        id: p.id,
        type: p.type,
        title: str(d.title),
        season: ep?.season ?? null,
        episode: ep?.episode ?? null,
        release_date: str(d.releaseDate),
        total: links.length,
        links,
        total_subtitles: subtitles.length,
        subtitles,
        poster: str(d.poster),
      };
    },
  },
];
