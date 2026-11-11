import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, need, num, opt } from "./helpers";
import { browserHeaders, clean, cleanSlug } from "./scrape";

/* Sumber: https://z2.idlixku.com (IDLIX). Situsnya menyediakan API JSON di /api/*, gambar dari TMDB. */
const BASE = "https://z2.idlixku.com";
const TMDB = "https://image.tmdb.org/t/p";

type J = Record<string, unknown>;
type Kind = "movie" | "series";

const isObj = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): J[] => arr(v).filter(isObj);

/** Ambil nilai pertama yang terisi dari beberapa nama kunci (camelCase maupun snake_case). */
function get(o: J | null | undefined, ...keys: string[]): unknown {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
const str = (o: J | null | undefined, ...keys: string[]): string | null => {
  const v = get(o, ...keys);
  return typeof v === "string" ? clean(v) || null : typeof v === "number" ? String(v) : null;
};
const numv = (o: J | null | undefined, ...keys: string[]): number | null => {
  const v = get(o, ...keys);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const rating = (o: J | null | undefined): number | null => {
  const n = numv(o, "voteAverage", "vote_average");
  return n === null ? null : Math.round(n * 10) / 10;
};
const img = (path: unknown, size: string): string | null => {
  if (typeof path !== "string" || !path.trim()) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith("/") ? `${TMDB}/${size}${path}` : null;
};
const year = (date: string | null) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

function genreNames(v: unknown): string[] {
  return arr(v)
    .map((g) => (typeof g === "string" ? g : isObj(g) ? str(g, "name", "title") : null))
    .filter((g): g is string => !!g);
}

function kindOf(o: J, fallback: Kind | null = null): Kind {
  const raw = (str(o, "contentType", "content_type", "type") ?? "").toLowerCase();
  if (/series|tv|show/.test(raw)) return "series";
  if (raw.includes("movie")) return "movie";
  if (fallback) return fallback;
  return numv(o, "numberOfSeasons", "number_of_seasons") ? "series" : "movie";
}

const pageUrl = (kind: Kind, slug: string) => `${BASE}/${kind === "movie" ? "movie" : "series"}/${slug}`;
const episodeUrl = (slug: string, s: number, e: number) => `${BASE}/series/${slug}/season/${s}/episode/${e}`;

/** Variasi header: identitas polos dulu, lalu header mirip browser. */
const HEADER_SETS: Record<string, string>[] = [
  { accept: "application/json, text/plain, */*", origin: BASE, referer: `${BASE}/` },
  browserHeaders(`${BASE}/`, { accept: "application/json, text/plain, */*", origin: BASE }),
];

async function api(path: string, params: Record<string, string | number | undefined> = {}): Promise<J> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${BASE}/api/${path}${qs ? `?${qs}` : ""}`;
  let blocked: string | null = null;
  for (const headers of HEADER_SETS) {
    try {
      const d = await fetchJson<unknown>(url, { headers }, 15000);
      if (!isObj(d)) throw new HttpError(502, "IDLIX mengirim respons yang tidak dikenali.");
      return d;
    } catch (e) {
      const m = e instanceof HttpError && e.status === 502 ? e.message.match(/status (403|429|503)/) : null;
      if (!m) throw e;
      blocked = m[1];
    }
  }
  throw new HttpError(502, `IDLIX menolak permintaan dari server ini (HTTP ${blocked}, perlindungan Cloudflare).`);
}

/** Kartu film/serial di daftar, pencarian, dan beranda. */
function card(raw: J, fallback: Kind | null = null) {
  // Item beranda kadang membungkus datanya di dalam `content`.
  const inner = isObj(raw.content) ? raw.content : null;
  const o: J = inner ? { ...inner, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null && v !== "" && !isObj(v))) } : raw;
  const slug = str(o, "slug");
  const title = str(o, "title", "name");
  if (!slug || !title) return null;
  const kind = kindOf(o, fallback);
  const date = str(o, "releaseDate", "release_date", "firstAirDate", "first_air_date");
  return {
    id: str(o, "id"),
    type: kind,
    title,
    original_title: str(o, "originalTitle", "original_title"),
    slug,
    year: year(date),
    release_date: date,
    rating: rating(o),
    quality: str(o, "quality"),
    runtime: numv(o, "runtime", "duration"),
    seasons: kind === "series" ? numv(o, "numberOfSeasons", "number_of_seasons") : null,
    episodes: kind === "series" ? numv(o, "numberOfEpisodes", "number_of_episodes") : null,
    country: str(o, "country"),
    language: str(o, "originalLanguage", "original_language"),
    genres: genreNames(o.genres),
    views: numv(o, "viewCount", "view_count"),
    poster: img(get(o, "posterPath", "poster_path"), "w500"),
    backdrop: img(get(o, "backdropOverride", "backdropPath", "backdrop_path"), "w1280"),
    overview: str(o, "overview", "description"),
    url: pageUrl(kind, slug),
  };
}

const cards = (list: unknown, fallback: Kind | null = null) =>
  objs(list)
    .map((o) => card(o, fallback))
    .filter((c): c is NonNullable<ReturnType<typeof card>> => c !== null);

/** Pemeran: nama, peran, dan foto. */
function castList(v: unknown) {
  return objs(v)
    .map((raw, i) => {
      const person = isObj(raw.person) ? raw.person : isObj(raw.cast) ? raw.cast : null;
      const o: J = person ? { ...person, ...Object.fromEntries(Object.entries(raw).filter(([, x]) => !isObj(x) && x !== null && x !== "")) } : raw;
      const name = str(o, "name", "originalName", "original_name");
      if (!name) return null;
      const profile = get(o, "profilePath", "profile_path", "photo", "image");
      return {
        order: numv(o, "order", "castOrder", "cast_order") ?? i + 1,
        id: str(o, "id", "personId", "person_id"),
        tmdb_id: numv(o, "tmdbId", "tmdb_id"),
        name,
        character: str(o, "character", "characterName", "character_name", "role"),
        department: str(o, "knownForDepartment", "known_for_department", "department"),
        photo: img(profile, "w342"),
        photo_original: img(profile, "original"),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

function seasonList(v: unknown, slug: string) {
  return objs(v).map((s) => {
    const n = numv(s, "seasonNumber", "season_number") ?? 1;
    return {
      season: n,
      name: str(s, "name", "title"),
      episodes: numv(s, "episodeCount", "episode_count"),
      air_date: str(s, "airDate", "air_date"),
      poster: img(get(s, "posterPath", "poster_path"), "w500"),
      overview: str(s, "overview"),
    };
  }).sort((a, b) => a.season - b.season).map((s) => ({ ...s, url: episodeUrl(slug, s.season, 1) }));
}

function episodeItem(e: J, slug: string, season: number) {
  const n = numv(e, "episodeNumber", "episode_number") ?? 1;
  return {
    episode: n,
    id: str(e, "id"),
    name: str(e, "name", "title"),
    air_date: str(e, "airDate", "air_date"),
    runtime: numv(e, "runtime", "duration"),
    rating: rating(e),
    available: e.hasVideo !== false,
    still: img(get(e, "stillPath", "still_path"), "w500"),
    overview: str(e, "overview"),
    url: episodeUrl(slug, season, n),
  };
}

/** Terima slug polos atau URL halaman IDLIX. */
function parseTarget(raw: string, tipe: string): { slug: string; kind: Kind | null; season: number | null; episode: number | null } {
  const forced: Kind | null = /^(movie|film)$/i.test(tipe) ? "movie" : /^(series|serial|tv)$/i.test(tipe) ? "series" : null;
  if (tipe && !forced) throw new HttpError(400, "Parameter 'tipe' tidak dikenal. Pilihan: movie, series.");
  const m = raw.match(/\/(?:watch\/)?(movies?|series)\/([^/?#]+)(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?/i);
  if (m) {
    return {
      slug: cleanSlug(m[2]),
      kind: forced ?? (m[1].toLowerCase().startsWith("movie") ? "movie" : "series"),
      season: m[3] ? Number(m[3]) : null,
      episode: m[4] ? Number(m[4]) : null,
    };
  }
  if (/^https?:\/\//i.test(raw)) throw new HttpError(400, "URL IDLIX tidak dikenali. Contoh: https://z2.idlixku.com/movie/<slug>.");
  return { slug: cleanSlug(raw), kind: forced, season: null, episode: null };
}

/** Ambil detail; bila tipe tidak diketahui, coba film dulu lalu serial. */
async function fetchDetail(slug: string, kind: Kind | null): Promise<{ kind: Kind; data: J }> {
  const enc = encodeURIComponent(slug);
  if (kind) return { kind, data: await api(`${kind === "movie" ? "movies" : "series"}/${enc}`) };
  try {
    return { kind: "movie", data: await api(`movies/${enc}`) };
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 404) throw e;
  }
  try {
    return { kind: "series", data: await api(`series/${enc}`) };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new HttpError(404, `Film atau serial '${slug}' tidak ditemukan di IDLIX.`);
    throw e;
  }
}

function detailOut(kind: Kind, d: J) {
  const slug = str(d, "slug") ?? "";
  const date = str(d, "releaseDate", "release_date", "firstAirDate", "first_air_date");
  const cast = castList(get(d, "cast", "casts", "credits"));
  return {
    id: str(d, "id"),
    type: kind,
    title: str(d, "title", "name"),
    original_title: str(d, "originalTitle", "original_title"),
    slug,
    tagline: str(d, "tagline"),
    overview: str(d, "overview", "description"),
    year: year(date),
    release_date: date,
    status: str(d, "status"),
    rating: rating(d),
    certification: str(d, "certification"),
    quality: str(d, "quality"),
    runtime: numv(d, "runtime", "duration"),
    country: str(d, "country"),
    language: str(d, "originalLanguage", "original_language"),
    genres: genreNames(d.genres),
    views: numv(d, "viewCount", "view_count"),
    tmdb_id: numv(d, "tmdbId", "tmdb_id"),
    imdb_id: str(d, "imdbId", "imdb_id"),
    poster: img(get(d, "posterPath", "poster_path"), "w500"),
    backdrop: img(get(d, "backdropPath", "backdrop_path"), "w1280"),
    logo: img(get(d, "logoPath", "logo_path"), "w500"),
    trailer: str(d, "trailerUrl", "trailer_url"),
    available: d.hasVideo !== false,
    ...(kind === "series"
      ? {
          total_seasons: numv(d, "numberOfSeasons", "number_of_seasons"),
          total_episodes: numv(d, "numberOfEpisodes", "number_of_episodes"),
          seasons: seasonList(d.seasons, slug),
        }
      : {}),
    cast_total: cast.length,
    cast,
    url: pageUrl(kind, slug),
  };
}

const slugParams = [
  { name: "slug", required: true, description: "Slug atau URL halaman film/serial di IDLIX (ambil dari hasil search).", example: "toy-story-5-2026" },
  { name: "tipe", description: "movie atau series. Kosongkan untuk deteksi otomatis.", example: "", options: ["movie", "series"] },
];

const SORTS = ["latest", "popular", "rating", "trending"];
const listParams = [
  { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
  { name: "limit", description: "Jumlah per halaman, 1 sampai 40. Default 20.", example: "20" },
  { name: "sort", description: `Urutan dari IDLIX, mis. ${SORTS.join(", ")}. Kosongkan untuk urutan bawaan.`, example: "" },
  { name: "genre", description: "Slug genre dari /api/film/genres.", example: "" },
];

async function listing(kind: Kind, sp: URLSearchParams) {
  const page = num(sp, "page", 1, 1, 5000);
  const limit = num(sp, "limit", 20, 1, 40);
  const sort = opt(sp, "sort").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 30);
  const genre = opt(sp, "genre").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const d = await api(kind === "movie" ? "movies" : "series", { page, limit, sort, genre });
  const items = cards(get(d, "data", "results", "items"), kind);
  const p = isObj(d.pagination) ? d.pagination : null;
  if (!items.length) throw new HttpError(404, "Tidak ada judul di halaman ini.");
  return {
    type: kind,
    page: numv(p, "page") ?? page,
    limit: numv(p, "limit") ?? limit,
    total: numv(p, "total"),
    total_pages: numv(p, "totalPages", "total_pages"),
    sort: sort || null,
    genre: genre || null,
    count: items.length,
    items,
  };
}

export const filmEndpoints: Endpoint[] = [
  {
    category: "film", slug: "home", kind: "json",
    title: "Beranda IDLIX",
    description: "Semua bagian beranda IDLIX: unggulan, sedang tren, film terbaru, dan serial terbaru.",
    params: [],
    handler: async () => {
      const d = await api("homepage");
      const sections = [...objs(d.above), ...objs(d.below)]
        .map((s) => {
          const items = cards(s.data, s.type === "latest_movies" ? "movie" : s.type === "latest_series" ? "series" : null);
          return { type: str(s, "type"), title: str(s, "title", "name", "label"), count: items.length, items };
        })
        .filter((s) => s.count > 0);
      if (!sections.length) throw new HttpError(502, "Beranda IDLIX tidak mengirim data.");
      return { total_sections: sections.length, sections };
    },
  },
  {
    category: "film", slug: "search", kind: "json",
    title: "Cari Film & Serial",
    description: "Cari film atau serial di IDLIX berdasarkan judul. Pakai slug hasilnya untuk endpoint detail dan cast.",
    params: [
      { name: "q", required: true, description: "Judul yang dicari.", example: "avatar" },
      { name: "tipe", description: "Saring hasil: movie atau series.", example: "", options: ["movie", "series"] },
      { name: "limit", description: "Jumlah hasil, 1 sampai 40. Default 20.", example: "20" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const tipe = opt(sp, "tipe").toLowerCase();
      if (tipe && tipe !== "movie" && tipe !== "series") throw new HttpError(400, "Parameter 'tipe' tidak dikenal. Pilihan: movie, series.");
      const d = await api("search", { q });
      let items = cards(get(d, "results", "data", "items"));
      if (tipe) items = items.filter((i) => i.type === tipe);
      items = items.slice(0, num(sp, "limit", 20, 1, 40));
      if (!items.length) throw new HttpError(404, `'${q}' tidak ditemukan di IDLIX.`);
      return { query: q, total: numv(d, "total") ?? items.length, count: items.length, items };
    },
  },
  {
    category: "film", slug: "movies", kind: "json",
    title: "Daftar Film",
    description: "Jelajahi katalog film IDLIX per halaman, bisa disaring per genre dan diurutkan.",
    params: listParams,
    handler: async ({ sp }) => listing("movie", sp),
  },
  {
    category: "film", slug: "series", kind: "json",
    title: "Daftar Serial",
    description: "Jelajahi katalog serial TV dan drama IDLIX per halaman, bisa disaring per genre dan diurutkan.",
    params: listParams,
    handler: async ({ sp }) => listing("series", sp),
  },
  {
    category: "film", slug: "genres", kind: "json",
    title: "Daftar Genre",
    description: "Semua genre di IDLIX beserta slug untuk parameter genre pada daftar film dan serial.",
    params: [],
    handler: async () => {
      const d = await api("genres");
      const genres = objs(get(d, "data", "genres", "results"))
        .map((g) => ({ id: str(g, "id"), name: str(g, "name", "title"), slug: str(g, "slug") }))
        .filter((g) => g.name && g.slug);
      if (!genres.length) throw new HttpError(502, "IDLIX tidak mengirim daftar genre.");
      return { total: genres.length, genres };
    },
  },
  {
    category: "film", slug: "detail", kind: "json",
    title: "Detail Film / Serial",
    description: "Metadata lengkap: sinopsis, genre, rating, durasi, poster, trailer, daftar pemeran, dan daftar season untuk serial.",
    params: slugParams,
    handler: async ({ sp }) => {
      const t = parseTarget(need(sp, "slug", 300), opt(sp, "tipe"));
      const { kind, data } = await fetchDetail(t.slug, t.kind);
      return detailOut(kind, data);
    },
  },
  {
    category: "film", slug: "cast", kind: "json",
    title: "Pemeran Film / Serial",
    description: "Daftar pemeran sebuah film atau serial: nama aktor, nama peran, dan foto.",
    params: [...slugParams, { name: "limit", description: "Batasi jumlah pemeran, 1 sampai 100. Default semua.", example: "" }],
    handler: async ({ sp }) => {
      const t = parseTarget(need(sp, "slug", 300), opt(sp, "tipe"));
      const { kind, data } = await fetchDetail(t.slug, t.kind);
      const d = detailOut(kind, data);
      if (!d.cast.length) throw new HttpError(404, `Data pemeran '${d.title ?? t.slug}' belum tersedia di IDLIX.`);
      const cast = d.cast.slice(0, num(sp, "limit", 100, 1, 100));
      return { title: d.title, type: kind, slug: d.slug, year: d.year, poster: d.poster, total: d.cast.length, count: cast.length, cast, url: d.url };
    },
  },
  {
    category: "film", slug: "season", kind: "json",
    title: "Daftar Episode per Season",
    description: "Daftar episode satu season sebuah serial: nomor, judul, tanggal tayang, durasi, dan gambar.",
    params: [
      { name: "slug", required: true, description: "Slug atau URL serial di IDLIX.", example: "oh-my-guard-2026" },
      { name: "season", description: "Nomor season. Default 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const t = parseTarget(need(sp, "slug", 300), "series");
      const season = num(sp, "season", t.season ?? 1, 0, 200);
      let d: J;
      try {
        d = await api(`series/${encodeURIComponent(t.slug)}/season/${season}`);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) throw new HttpError(404, `Season ${season} dari '${t.slug}' tidak ditemukan di IDLIX.`);
        throw e;
      }
      const s = isObj(d.season) ? d.season : d;
      const episodes = objs(s.episodes).map((e) => episodeItem(e, t.slug, season)).sort((a, b) => a.episode - b.episode);
      if (!episodes.length) throw new HttpError(404, `Season ${season} dari '${t.slug}' belum punya episode.`);
      const series = isObj(d.series) ? d.series : null;
      return {
        title: str(series, "title", "name") ?? str(d, "title"),
        slug: t.slug,
        season,
        name: str(s, "name", "title"),
        air_date: str(s, "airDate", "air_date"),
        poster: img(get(s, "posterPath", "poster_path"), "w500"),
        overview: str(s, "overview"),
        total: episodes.length,
        episodes,
      };
    },
  },
  {
    category: "film", slug: "episode", kind: "json",
    title: "Detail Episode",
    description: "Detail satu episode serial beserta navigasi ke episode sebelum dan sesudahnya.",
    params: [
      { name: "slug", required: true, description: "Slug serial, atau URL episode di IDLIX.", example: "oh-my-guard-2026" },
      { name: "season", description: "Nomor season. Default 1.", example: "1" },
      { name: "episode", description: "Nomor episode. Default 1.", example: "1" },
    ],
    handler: async ({ sp, origin }) => {
      const t = parseTarget(need(sp, "slug", 300), "series");
      const season = num(sp, "season", t.season ?? 1, 0, 200);
      const episode = num(sp, "episode", t.episode ?? 1, 0, 5000);
      let d: J;
      try {
        d = await api(`series/${encodeURIComponent(t.slug)}/season/${season}/episode/${episode}`);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) throw new HttpError(404, `Episode ${episode} season ${season} dari '${t.slug}' tidak ditemukan di IDLIX.`);
        throw e;
      }
      const ep = isObj(d.episode) ? d.episode : null;
      if (!ep) throw new HttpError(404, `Episode ${episode} season ${season} dari '${t.slug}' tidak ditemukan di IDLIX.`);
      const series = isObj(d.series) ? d.series : null;
      const s = isObj(d.season) ? d.season : null;
      const numbers = objs(s?.episodes).map((e) => numv(e, "episodeNumber", "episode_number")).filter((n): n is number => n !== null).sort((a, b) => a - b);
      const link = (n: number | undefined) => (n === undefined ? null : `${origin}/api/film/episode?slug=${encodeURIComponent(t.slug)}&season=${season}&episode=${n}`);
      return {
        title: str(series, "title", "name"),
        slug: t.slug,
        season,
        season_name: str(s, "name", "title"),
        ...episodeItem(ep, t.slug, season),
        poster: img(get(series, "posterPath", "poster_path"), "w500"),
        total_episodes: numbers.length || null,
        prev: link(numbers.filter((n) => n < episode).pop()),
        next: link(numbers.find((n) => n > episode)),
        seasons: seasonList(get(d, "allSeasons", "all_seasons") ?? series?.seasons, t.slug).map((x) => ({ season: x.season, name: x.name, episodes: x.episodes })),
      };
    },
  },
];
