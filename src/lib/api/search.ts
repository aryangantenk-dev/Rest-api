import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, fetchRaw, need, num, opt } from "./helpers";
import { browserHeaders, clean, fetchPage } from "./scrape";

const UA = browserHeaders("https://www.google.com/")["user-agent"];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/* ---------------------------------- Pinterest --------------------------------- */

type PinImage = { url?: string; width?: number; height?: number };
type PinRaw = {
  id?: string;
  type?: string;
  title?: string;
  grid_title?: string;
  description?: string;
  auto_alt_text?: string;
  seo_alt_text?: string;
  link?: string | null;
  domain?: string | null;
  images?: Record<string, PinImage>;
  pinner?: { username?: string; full_name?: string };
  board?: { name?: string };
  videos?: { video_list?: Record<string, { url?: string }> } | null;
};

export type PinResult = {
  id: string | null;
  title: string | null;
  description: string | null;
  image: string;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  video: string | null;
  uploader: string | null;
  board: string | null;
  url: string | null;
};

function cookieJar(res: Response): string {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

function mapPin(p: PinRaw): PinResult | null {
  const img = p.images?.orig ?? p.images?.["736x"] ?? p.images?.["474x"];
  if (!img?.url) return null;
  const vids = p.videos?.video_list ?? {};
  const video = vids.V_720P?.url ?? vids.V_EXP7?.url ?? Object.values(vids).find((v) => v.url?.endsWith(".mp4"))?.url ?? null;
  return {
    id: p.id ?? null,
    title: clean(p.title || p.grid_title) || null,
    description: clean(p.description || p.seo_alt_text || p.auto_alt_text) || null,
    image: img.url,
    thumbnail: p.images?.["236x"]?.url ?? null,
    width: img.width ?? null,
    height: img.height ?? null,
    video,
    uploader: p.pinner?.username ?? null,
    board: p.board?.name ?? null,
    url: p.id ? `https://www.pinterest.com/pin/${p.id}/` : null,
  };
}

async function pinterestSearch(q: string, limit: number): Promise<{ source: string; items: PinResult[] }> {
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(q)}&rs=typed`;
  const pageUrl = `https://www.pinterest.com${sourceUrl}`;

  // 1) Buka halaman pencarian untuk mendapat cookie sesi + csrf.
  let cookies = "";
  let html = "";
  try {
    const first = await fetchRaw(pageUrl, { headers: browserHeaders("https://www.pinterest.com/") }, 12000);
    cookies = cookieJar(first);
    html = await first.text();
  } catch {
    /* lanjut ke percobaan API tanpa cookie */
  }
  const csrf = /csrftoken=([^;]+)/.exec(cookies)?.[1] ?? "";

  // 2) Resource API internal Pinterest.
  try {
    const data = JSON.stringify({
      options: { query: q, scope: "pins", rs: "typed", redux_normalize_feed: true, source_url: sourceUrl, page_size: Math.min(50, Math.max(25, limit)) },
      context: {},
    });
    const api = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}&_=${Date.now()}`;
    const json = await fetchJson<{ resource_response?: { data?: { results?: PinRaw[] } } }>(
      api,
      {
        headers: {
          "user-agent": UA,
          accept: "application/json, text/javascript, */*, q=0.01",
          "accept-language": "id-ID,id;q=0.9,en;q=0.8",
          referer: pageUrl,
          "x-requested-with": "XMLHttpRequest",
          "x-pinterest-appstate": "active",
          "x-pinterest-pws-handler": "www/search/[scope].js",
          "x-pinterest-source-url": sourceUrl,
          "x-app-version": "c056fb7",
          ...(csrf ? { "x-csrftoken": csrf } : {}),
          ...(cookies ? { cookie: cookies } : {}),
        },
      },
      12000,
    );
    const items = (json.resource_response?.data?.results ?? []).map(mapPin).filter((x): x is PinResult => !!x);
    if (items.length) return { source: "api", items: items.slice(0, limit) };
  } catch {
    /* jatuh ke hasil dari HTML */
  }

  // 3) Cadangan: ambil URL gambar yang tertanam di HTML halaman pencarian.
  const seen = new Set<string>();
  const items: PinResult[] = [];
  for (const m of html.matchAll(/https:\\?\/\\?\/i\.pinimg\.com\\?\/(?:originals|736x|474x|236x)\\?\/([0-9a-f]{2}\\?\/[0-9a-f]{2}\\?\/[0-9a-f]{2}\\?\/[0-9a-f]{32}\.(?:jpg|png|webp|gif))/g)) {
    const key = m[1].replace(/\\/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: null, title: null, description: null,
      image: `https://i.pinimg.com/736x/${key}`,
      thumbnail: `https://i.pinimg.com/236x/${key}`,
      width: null, height: null, video: null, uploader: null, board: null, url: null,
    });
    if (items.length >= limit) break;
  }
  if (!items.length) throw new HttpError(502, "Pinterest menolak permintaan dari server ini. Coba lagi beberapa saat lagi.");
  return { source: "html", items };
}

/* ----------------------------------- YouTube ---------------------------------- */

type YtRuns = { runs?: { text?: string }[]; simpleText?: string };
const ytText = (t?: YtRuns) => clean(t?.simpleText ?? t?.runs?.map((r) => r.text ?? "").join("") ?? "") || null;

type YtVideo = {
  videoId?: string;
  title?: YtRuns;
  thumbnail?: { thumbnails?: { url?: string }[] };
  lengthText?: YtRuns;
  viewCountText?: YtRuns;
  publishedTimeText?: YtRuns;
  ownerText?: YtRuns & { runs?: { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] };
  detailedMetadataSnippets?: { snippetText?: YtRuns }[];
};

function walk(node: unknown, out: YtVideo[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 14) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  if (o.videoRenderer && typeof o.videoRenderer === "object") {
    out.push(o.videoRenderer as YtVideo);
    return;
  }
  for (const v of Object.values(o)) walk(v, out, depth + 1);
}

/* ---------------------------------- Endpoint ---------------------------------- */

/* ------------------------------ MCPEDL & pencarian web ------------------------------ */

const MCPEDL_SORT: Record<string, string> = { relevan: "relevance", populer: "popularity_all", terbaru: "created_at", diperbarui: "updated_at" };
const MCPEDL_TYPES: Record<number, string> = {
  1: "Add-On", 2: "World", 3: "Texture Pack", 4: "Seed", 5: "Skin", 6: "Skin Pack", 7: "Server", 8: "ModPE", 9: "Script",
};

type WebHit = { title: string; url: string; domain: string; snippet: string | null };

function webHit(title: string, href: string, snippet: string): WebHit | null {
  if (!title || !/^https?:\/\//.test(href)) return null;
  let domain: string;
  try { domain = new URL(href).hostname.replace(/^www\./, ""); } catch { return null; }
  return { title: decodeEntities(title), url: href, domain, snippet: snippet || null };
}

/** Bing membungkus tautan hasil sebagai /ck/a?...&u=a1<base64url>; kembalikan URL aslinya. */
function bingTarget(href: string): string {
  try {
    const u = new URL(href, "https://www.bing.com");
    if (!/(^|\.)bing\.com$/.test(u.hostname) || !u.pathname.startsWith("/ck/")) return u.toString();
    const enc = u.searchParams.get("u") ?? "";
    if (!enc.startsWith("a1")) return "";
    return Buffer.from(enc.slice(2), "base64url").toString("utf8");
  } catch {
    return "";
  }
}

async function bingSearch(q: string): Promise<WebHit[]> {
  // Tanpa parameter cc/count: dengan keduanya Bing sering mengirim halaman tanpa hasil ke IP server.
  const { $ } = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=id`, "https://www.bing.com/");
  const items: WebHit[] = [];
  $("li.b_algo").each((_, r) => {
    const el = $(r);
    const a = el.find("h2 a").first();
    const hit = webHit(clean(a.text()), bingTarget(a.attr("href") ?? ""), clean(el.find(".b_caption p, p.b_lineclamp2, p").first().text()));
    if (hit) items.push(hit);
  });
  return items;
}

async function yahooSearch(q: string): Promise<WebHit[]> {
  const { $ } = await fetchPage(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, "https://search.yahoo.com/");
  const items: WebHit[] = [];
  $("div.algo").each((_, r) => {
    const el = $(r);
    const a = el.find(".compTitle a[href]").first();
    let href = a.attr("href") ?? "";
    // Tautan dibungkus: https://r.search.yahoo.com/.../RU=<url ter-encode>/RK=...
    const ru = /\/RU=([^/]+)\//.exec(href);
    if (ru) {
      try { href = decodeURIComponent(ru[1]); } catch { return; }
    }
    if (/(^|\.)yahoo\.com$/.test(href.replace(/^https?:\/\//, "").split("/")[0])) return;
    const hit = webHit(clean(el.find("h3.title").first().text()) || clean(a.attr("aria-label")), href, clean(el.find(".compText p").first().text()));
    if (hit) items.push(hit);
  });
  return items;
}

async function ddgSearch(q: string): Promise<WebHit[]> {
  const { $ } = await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=id-id`, "https://html.duckduckgo.com/");
  const items: WebHit[] = [];
  $(".result").each((_, r) => {
    const el = $(r);
    if (el.hasClass("result--ad")) return;
    const a = el.find("a.result__a").first();
    let href = a.attr("href") ?? "";
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    if (/duckduckgo\.com\/y\.js/.test(href)) return;
    const hit = webHit(clean(a.text()), href, clean(el.find(".result__snippet").text()));
    if (hit) items.push(hit);
  });
  return items;
}

export const searchEndpoints: Endpoint[] = [
  {
    category: "search", slug: "pinterest", kind: "json",
    title: "Pinterest",
    description: "Cari gambar di Pinterest dan dapatkan tautan gambar resolusi penuh. Cocok untuk fitur .pin pada bot.",
    params: [
      { name: "q", required: true, description: "Kata kunci pencarian.", example: "aesthetic wallpaper" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 40. Default 20.", example: "10" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 120);
      const { source, items } = await pinterestSearch(q, num(sp, "limit", 20, 1, 40));
      return { query: q, source, total: items.length, items };
    },
  },
  {
    category: "search", slug: "lahelu", kind: "json",
    title: "Lahelu",
    description: "Cari meme di lahelu.com: judul, media, jumlah vote, komentar, tagar, dan pengunggahnya.",
    params: [
      { name: "q", required: true, description: "Kata kunci meme.", example: "kucing" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 30. Default 15.", example: "10" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      type Post = {
        postId?: string; postID?: string; title?: string; totalUpvotes?: number; totalDownvotes?: number; totalComments?: number;
        createTime?: number; hashtags?: string[]; isSensitive?: boolean; media?: string; mediaType?: number; mediaWidth?: number;
        mediaHeight?: number; userUsername?: string; userAvatar?: string; topicTitle?: string;
        content?: { type?: number; value?: string }[];
      };
      const d = await fetchJson<{ postInfos?: Post[] }>(`https://lahelu.com/api/post/get-search?query=${encodeURIComponent(q)}`, {
        headers: { "user-agent": UA, accept: "application/json", referer: "https://lahelu.com/" },
      });
      const fix = (u?: string) => (u ? (u.startsWith("http") ? u : `https://cache.lahelu.com/${u.replace(/^\/+/, "")}`) : null);
      const items = (d.postInfos ?? [])
        .filter((p) => !p.isSensitive)
        .slice(0, num(sp, "limit", 15, 1, 30))
        .map((p) => {
          const id = p.postId ?? p.postID ?? null;
          const media = fix(p.media ?? p.content?.find((c) => c.value)?.value);
          return {
            id,
            title: clean(p.title),
            media,
            media_type: media && /\.(mp4|webm)(\?|$)/i.test(media) ? "video" : "image",
            width: p.mediaWidth ?? null,
            height: p.mediaHeight ?? null,
            upvotes: p.totalUpvotes ?? 0,
            downvotes: p.totalDownvotes ?? 0,
            comments: p.totalComments ?? 0,
            hashtags: p.hashtags ?? [],
            topic: p.topicTitle || null,
            user: p.userUsername ?? null,
            avatar: fix(p.userAvatar),
            created_at: p.createTime ? new Date(p.createTime).toISOString() : null,
            url: id ? `https://lahelu.com/post/${id}` : null,
          };
        });
      if (!items.length) throw new HttpError(404, `Meme dengan kata kunci '${q}' tidak ditemukan.`);
      return { query: q, total: items.length, items };
    },
  },
  {
    category: "search", slug: "mcpedl", kind: "json",
    title: "MCPEDL",
    description: "Cari addon, map, texture pack, shader, dan skin Minecraft Bedrock di mcpedl.com.",
    params: [
      { name: "q", required: true, description: "Kata kunci, mis. shader atau one block.", example: "shader" },
      { name: "page", description: "Nomor halaman hasil (20 per halaman). Default 1.", example: "1" },
      { name: "urut", description: "relevan, populer, terbaru, atau diperbarui. Default relevan.", example: "relevan", options: Object.keys(MCPEDL_SORT) },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const page = num(sp, "page", 1, 1, 500);
      const sortKey = opt(sp, "urut", "relevan").toLowerCase();
      const sort = MCPEDL_SORT[sortKey];
      if (!sort) throw new HttpError(400, `Parameter 'urut' tidak dikenal. Pilihan: ${Object.keys(MCPEDL_SORT).join(", ")}.`);
      type McItem = {
        slug?: string; title?: string; summary?: string; image?: string; created_at?: string; updated_at?: string; downloadCount?: number;
        display_name?: string; user_nicename?: string; user_avatar?: string; average_rating?: string | number; type_id?: number; cf_tags?: { name?: string }[];
      };
      const d = await fetchJson<{ meta?: { total?: number; page_count?: number }; results?: McItem[] }>(
        `https://api.mcpedl.com/api/search/advanced?${new URLSearchParams({ q, page: String(page), sort })}`,
        { headers: { ...browserHeaders("https://mcpedl.com/"), accept: "application/json, text/plain, */*", origin: "https://mcpedl.com" } },
        15000,
      );
      const items = (d.results ?? [])
        .filter((r) => r.slug && r.title)
        .map((r) => ({
          slug: r.slug,
          title: clean(r.title),
          type: MCPEDL_TYPES[r.type_id ?? 0] ?? null,
          url: `https://mcpedl.com/${r.slug}/`,
          image: r.image || null,
          description: clean(r.summary) || null,
          author: r.display_name ?? null,
          author_url: r.user_nicename ? `https://mcpedl.com/user/${r.user_nicename}/` : null,
          author_avatar: r.user_avatar || null,
          rating: Number(r.average_rating) ? Math.round(Number(r.average_rating) * 10) / 10 : null,
          downloads: r.downloadCount ?? null,
          tags: (r.cf_tags ?? []).map((t) => t.name ?? "").filter(Boolean),
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
        }));
      if (!items.length) throw new HttpError(404, `Tidak ada hasil MCPEDL untuk '${q}'.`);
      return { query: q, page, pages: d.meta?.page_count ?? null, total: d.meta?.total ?? items.length, count: items.length, items };
    },
  },
  {
    category: "search", slug: "cnn", kind: "json",
    title: "CNN Indonesia",
    description: "Cari berita di CNN Indonesia: judul, ringkasan, kanal, waktu terbit, gambar, dan tautan artikel.",
    params: [
      { name: "q", required: true, description: "Kata kunci berita.", example: "banjir" },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
      { name: "limit", description: "Jumlah berita per halaman, 1 sampai 20. Default 10.", example: "10" },
      { name: "urut", description: "terbaru atau relevan. Default terbaru.", example: "terbaru", options: ["terbaru", "relevan"] },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const page = num(sp, "page", 1, 1, 50);
      const limit = num(sp, "limit", 10, 1, 20);
      const latest = opt(sp, "urut", "terbaru").toLowerCase() !== "relevan";
      const base = "https://www.cnnindonesia.com/";
      type CnnImage = { strnmfile?: string; strposfile?: string; ratio?: string; extension?: string };
      type CnnItem = { strjudul?: string; strringkasan?: string; url?: string; strnmkanal?: string; strnmkota?: string; dtnewsdate?: string; image?: CnnImage[] };
      // Halaman pencarian CNN hanya berisi kerangka; datanya diambil dari API ini oleh skrip halaman.
      const qs = new URLSearchParams({
        query: q, idtype: "1", typechannel: "", start: String((page - 1) * limit), limit: String(limit),
        idparentkanal: "", fromdate: "", todate: "", isrelevance: latest ? "0" : "1", pageType: "search",
      });
      const d = await fetchJson<{ data?: CnnItem[]; total?: number }>(
        `${base}api/v3/search?${qs}`,
        { headers: { ...browserHeaders(`${base}search/?query=${encodeURIComponent(q)}`), accept: "application/json" } },
        15000,
      );
      const items = (d.data ?? [])
        .filter((it) => it.url && it.strjudul)
        .map((it) => {
          const img = it.image?.find((i) => i.strposfile === "cover") ?? it.image?.[0];
          const date = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(it.dtnewsdate ?? "");
          return {
            title: clean(it.strjudul),
            url: it.url,
            summary: clean(it.strringkasan) || null,
            image: img?.strnmfile ? `https://akcdn.detik.net.id/visual/${img.strnmfile}${img.ratio ?? ""}${img.extension ?? ".jpeg"}?w=650&q=90` : null,
            channel: clean(it.strnmkanal) || null,
            city: clean(it.strnmkota) || null,
            published_at: date ? `${date[1]}-${date[2]}-${date[3]}T${date[4]}+07:00` : null,
          };
        });
      if (!items.length) throw new HttpError(404, `Tidak ada berita CNN Indonesia untuk '${q}'.`);
      return { query: q, page, total: d.total ?? items.length, count: items.length, items };
    },
  },
  {
    category: "search", slug: "youtube", kind: "json",
    title: "YouTube",
    description: "Cari video YouTube: judul, kanal, durasi, jumlah tayangan, thumbnail, dan tautan videonya.",
    params: [
      { name: "q", required: true, description: "Kata kunci video.", example: "lofi hip hop" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 150);
      const res = await fetchRaw(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=id&gl=ID&sp=EgIQAQ%253D%253D`,
        { headers: browserHeaders("https://www.youtube.com/", { cookie: "CONSENT=YES+cb; SOCS=CAI" }) },
        15000,
      );
      const html = await res.text();
      const m = /var ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/.exec(html) ?? /ytInitialData"\]\s*=\s*(\{[\s\S]+?\});/.exec(html);
      if (!m) throw new HttpError(502, "YouTube tidak mengirim data pencarian. Coba lagi beberapa saat lagi.");
      let data: unknown;
      try { data = JSON.parse(m[1]); } catch { throw new HttpError(502, "Data pencarian YouTube tidak bisa dibaca."); }
      const vids: YtVideo[] = [];
      walk(data, vids);
      const items = vids
        .filter((v) => v.videoId)
        .slice(0, num(sp, "limit", 10, 1, 20))
        .map((v) => {
          const owner = v.ownerText?.runs?.[0];
          const base = owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl;
          return {
            id: v.videoId,
            title: ytText(v.title),
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            duration: ytText(v.lengthText),
            views: ytText(v.viewCountText),
            published: ytText(v.publishedTimeText),
            channel: owner?.text ?? null,
            channel_url: base ? `https://www.youtube.com${base}` : null,
            description: ytText(v.detailedMetadataSnippets?.[0]?.snippetText),
          };
        });
      if (!items.length) throw new HttpError(404, `Tidak ada video YouTube untuk '${q}'.`);
      return { query: q, total: items.length, items };
    },
  },
  {
    category: "search", slug: "npm", kind: "json",
    title: "NPM",
    description: "Cari paket di registry npm: nama, versi terbaru, deskripsi, jumlah unduhan, dan tautannya.",
    params: [
      { name: "q", required: true, description: "Kata kunci paket.", example: "baileys" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const limit = num(sp, "limit", 10, 1, 20);
      type Pkg = {
        package?: {
          name?: string; version?: string; description?: string; keywords?: string[]; date?: string; license?: string;
          links?: { npm?: string; homepage?: string; repository?: string }; publisher?: { username?: string };
        };
        downloads?: { weekly?: number; monthly?: number };
      };
      const d = await fetchJson<{ total?: number; objects?: Pkg[] }>(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=${limit}`);
      const items = (d.objects ?? [])
        .filter((o) => o.package?.name)
        .map((o) => ({
          name: o.package?.name,
          version: o.package?.version ?? null,
          description: clean(o.package?.description) || null,
          keywords: (o.package?.keywords ?? []).slice(0, 10),
          license: o.package?.license ?? null,
          publisher: o.package?.publisher?.username ?? null,
          downloads_weekly: o.downloads?.weekly ?? null,
          downloads_monthly: o.downloads?.monthly ?? null,
          updated_at: o.package?.date ?? null,
          url: o.package?.links?.npm ?? `https://www.npmjs.com/package/${o.package?.name}`,
          homepage: o.package?.links?.homepage ?? null,
          repository: o.package?.links?.repository ?? null,
          install: `npm i ${o.package?.name}`,
        }));
      if (!items.length) throw new HttpError(404, `Tidak ada paket npm untuk '${q}'.`);
      return { query: q, total: d.total ?? items.length, count: items.length, items };
    },
  },
  {
    category: "search", slug: "myanimelist", kind: "json",
    title: "MyAnimeList",
    description: "Cari anime atau manga di MyAnimeList: skor, tipe, status, periode tayang, dan gambar sampul. Genre dan sinopsis ikut tampil bila sumber detail (Jikan) bisa dihubungi.",
    params: [
      { name: "q", required: true, description: "Judul yang dicari.", example: "one piece" },
      { name: "tipe", description: "anime atau manga. Default anime.", example: "anime", options: ["anime", "manga"] },
      { name: "limit", description: "Jumlah hasil, 1 sampai 15. Default 5.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const tipe = opt(sp, "tipe", "anime").toLowerCase() === "manga" ? "manga" : "anime";
      type A = {
        mal_id: number; url: string; title: string; title_english?: string | null; title_japanese?: string | null; type?: string | null;
        episodes?: number | null; chapters?: number | null; volumes?: number | null; status?: string | null; score?: number | null;
        rank?: number | null; year?: number | null; synopsis?: string | null; genres?: { name: string }[];
        images?: { jpg?: { large_image_url?: string; image_url?: string } }; aired?: { string?: string }; published?: { string?: string };
        studios?: { name: string }[]; authors?: { name: string }[];
      };
      const limit = num(sp, "limit", 5, 1, 15);
      let d: { data?: A[] } = {};
      try {
        d = await fetchJson<{ data?: A[] }>(`https://api.jikan.moe/v4/${tipe}?q=${encodeURIComponent(q)}&limit=${limit}&sfw=true`, undefined, 6000);
      } catch (e) {
        if (e instanceof HttpError && e.status === 400) throw e;
      }
      if (!d.data?.length) {
        // Jikan sering tidak bisa dihubungi dari server; pakai pencarian bawaan MyAnimeList.
        type M = { id: number; name: string; url: string; image_url?: string; payload?: { media_type?: string; start_year?: number; aired?: string; published?: string; score?: string; status?: string } };
        const m = await fetchJson<{ categories?: { type?: string; items?: M[] }[] }>(
          `https://myanimelist.net/search/prefix.json?type=${tipe}&keyword=${encodeURIComponent(q)}&v=1`,
          { headers: { ...browserHeaders("https://myanimelist.net/"), accept: "application/json" } },
        );
        const list = (m.categories ?? []).filter((c) => c.type === tipe).flatMap((c) => c.items ?? []).slice(0, limit);
        if (!list.length) throw new HttpError(404, `'${q}' tidak ditemukan di MyAnimeList.`);
        return {
          query: q, type: tipe, source: "myanimelist", total: list.length,
          items: list.map((a) => ({
            id: a.id,
            title: a.name,
            title_english: null,
            title_japanese: null,
            type: a.payload?.media_type ?? null,
            ...(tipe === "anime" ? { episodes: null, studios: [] } : { chapters: null, volumes: null, authors: [] }),
            status: a.payload?.status ?? null,
            score: Number(a.payload?.score) || null,
            rank: null,
            year: a.payload?.start_year || null,
            period: a.payload?.aired ?? a.payload?.published ?? null,
            genres: [],
            // Buang awalan thumbnail (/r/116x180) dan tanda tangan supaya dapat gambar ukuran penuh.
            image: a.image_url ? a.image_url.replace(/\/r\/\d+x\d+\//, "/").replace(/\?.*$/, "") : null,
            synopsis: null,
            url: a.url,
          })),
        };
      }
      const items = (d.data ?? []).map((a) => ({
        id: a.mal_id,
        title: a.title,
        title_english: a.title_english ?? null,
        title_japanese: a.title_japanese ?? null,
        type: a.type ?? null,
        ...(tipe === "anime" ? { episodes: a.episodes ?? null, studios: (a.studios ?? []).map((s) => s.name) } : { chapters: a.chapters ?? null, volumes: a.volumes ?? null, authors: (a.authors ?? []).map((s) => s.name) }),
        status: a.status ?? null,
        score: a.score ?? null,
        rank: a.rank ?? null,
        year: a.year ?? null,
        period: a.aired?.string ?? a.published?.string ?? null,
        genres: (a.genres ?? []).map((g) => g.name),
        image: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null,
        synopsis: clean(a.synopsis) || null,
        url: a.url,
      }));
      if (!items.length) throw new HttpError(404, `'${q}' tidak ditemukan di MyAnimeList.`);
      return { query: q, type: tipe, source: "jikan", total: items.length, items };
    },
  },
  {
    category: "search", slug: "steam", kind: "json",
    title: "Steam",
    description: "Cari game di Steam Store beserta harga dalam Rupiah, diskon, dan platform yang didukung.",
    params: [
      { name: "q", required: true, description: "Nama game.", example: "stardew valley" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 10. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      type G = { id: number; name: string; tiny_image?: string; metascore?: string; price?: { currency?: string; initial?: number; final?: number }; platforms?: Record<string, boolean> };
      const d = await fetchJson<{ items?: G[] }>(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=id&l=indonesian`);
      const items = (d.items ?? []).slice(0, num(sp, "limit", 10, 1, 10)).map((g) => {
        const init = g.price?.initial ?? 0;
        const fin = g.price?.final ?? 0;
        return {
          id: g.id,
          name: g.name,
          url: `https://store.steampowered.com/app/${g.id}/`,
          image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`,
          thumbnail: g.tiny_image ?? null,
          free: !g.price,
          currency: g.price?.currency ?? null,
          price: g.price ? fin / 100 : 0,
          original_price: g.price ? init / 100 : 0,
          discount_percent: init > fin && init > 0 ? Math.round((1 - fin / init) * 100) : 0,
          metascore: g.metascore ? Number(g.metascore) : null,
          platforms: Object.entries(g.platforms ?? {}).filter(([, v]) => v).map(([k]) => k),
        };
      });
      if (!items.length) throw new HttpError(404, `Game '${q}' tidak ditemukan di Steam.`);
      return { query: q, total: items.length, items };
    },
  },
  {
    category: "search", slug: "wallpaper", kind: "json",
    title: "Wallpaper",
    description: "Cari wallpaper resolusi tinggi dari Wallhaven berdasarkan kata kunci. Hanya konten aman.",
    params: [
      { name: "q", required: true, description: "Kata kunci, sebaiknya bahasa Inggris.", example: "mountain sunset" },
      { name: "kategori", description: "umum, anime, atau semua. Default semua.", example: "semua" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 24. Default 12.", example: "6" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const kat = opt(sp, "kategori", "semua").toLowerCase();
      const categories = kat === "anime" ? "010" : kat === "umum" ? "100" : "110";
      type W = { id: string; url: string; path: string; resolution: string; file_size: number; file_type: string; colors?: string[]; views: number; favorites: number; category: string; thumbs?: { large?: string; small?: string } };
      const d = await fetchJson<{ data?: W[] }>(
        `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&categories=${categories}&purity=100&sorting=relevance&atleast=1280x720`,
      );
      const items = (d.data ?? []).slice(0, num(sp, "limit", 12, 1, 24)).map((w) => ({
        id: w.id,
        image: w.path,
        thumbnail: w.thumbs?.large ?? w.thumbs?.small ?? null,
        resolution: w.resolution,
        size: w.file_size,
        type: w.file_type,
        category: w.category,
        colors: w.colors ?? [],
        views: w.views,
        favorites: w.favorites,
        url: w.url,
      }));
      if (!items.length) throw new HttpError(404, `Tidak ada wallpaper untuk '${q}'. Coba kata kunci bahasa Inggris.`);
      return { query: q, total: items.length, items };
    },
  },
  {
    category: "search", slug: "github", kind: "json",
    title: "Repositori GitHub",
    description: "Cari repositori publik di GitHub, diurutkan berdasarkan jumlah bintang.",
    params: [
      { name: "q", required: true, description: "Kata kunci repositori.", example: "whatsapp bot baileys" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 8.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 150);
      type R = {
        full_name: string; html_url: string; description: string | null; stargazers_count: number; forks_count: number; language: string | null;
        updated_at: string; topics?: string[]; default_branch: string; license?: { spdx_id?: string } | null; owner?: { avatar_url?: string };
      };
      const d = await fetchJson<{ total_count?: number; items?: R[] }>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${num(sp, "limit", 8, 1, 20)}`,
        { headers: { accept: "application/vnd.github+json" } },
      );
      const items = (d.items ?? []).map((r) => ({
        name: r.full_name,
        url: r.html_url,
        description: r.description,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        license: r.license?.spdx_id ?? null,
        topics: r.topics ?? [],
        updated_at: r.updated_at,
        avatar: r.owner?.avatar_url ?? null,
        zip: `https://github.com/${r.full_name}/archive/refs/heads/${r.default_branch}.zip`,
      }));
      if (!items.length) throw new HttpError(404, `Tidak ada repositori untuk '${q}'.`);
      return { query: q, total_found: d.total_count ?? items.length, total: items.length, items };
    },
  },
  {
    category: "search", slug: "web", kind: "json",
    title: "Pencarian Web",
    description: "Hasil pencarian web: judul, tautan, dan cuplikan. Memakai Bing, dengan Yahoo dan DuckDuckGo sebagai cadangan.",
    params: [
      { name: "q", required: true, description: "Kata kunci pencarian.", example: "cara membuat bot whatsapp" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 200);
      const limit = num(sp, "limit", 10, 1, 20);
      // Mesin pencari kadang menolak IP server; coba berurutan sampai ada yang memberi hasil.
      const engines: [string, (query: string) => Promise<WebHit[]>][] = [
        ["bing", bingSearch], ["yahoo", yahooSearch], ["duckduckgo", ddgSearch], ["bing", bingSearch],
      ];
      let source = "";
      let items: WebHit[] = [];
      for (const [name, run] of engines) {
        try {
          items = await run(q);
        } catch {
          items = [];
        }
        if (items.length) {
          source = name;
          break;
        }
      }
      const out = items.slice(0, limit);
      if (!out.length) throw new HttpError(502, "Mesin pencari tidak mengirim hasil. Coba lagi beberapa saat lagi.");
      return { query: q, source, total: out.length, items: out };
    },
  },
];
