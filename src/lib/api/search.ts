import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, fetchRaw, need, num, opt } from "./helpers";
import { absUrl, browserHeaders, clean, fetchPage, imgSrc } from "./scrape";

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
    description: "Cari addon, map, texture pack, dan skin Minecraft Bedrock di mcpedl.com.",
    params: [
      { name: "q", required: true, description: "Kata kunci, mis. shader atau one block.", example: "shader" },
      { name: "page", description: "Nomor halaman hasil. Default 1.", example: "1" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const page = num(sp, "page", 1, 1, 50);
      const base = "https://mcpedl.com/";
      const url = page > 1 ? `${base}search/?page=${page}&q=${encodeURIComponent(q)}` : `${base}?s=${encodeURIComponent(q)}`;
      const { $ } = await fetchPage(url, base);
      const skip = /^(user|category|tag|search|page|addons?|maps?|texture-packs?|skins?|scripts?|mods?|seeds?|servers?|tools?|submissions?|leaderboard|about|contact|privacy|terms|login|register)$/i;
      const seen = new Set<string>();
      const items: Record<string, unknown>[] = [];
      $("a[href]").each((_, a) => {
        const el = $(a);
        const href = absUrl(el.attr("href"), base);
        if (!href) return;
        let u: URL;
        try { u = new URL(href); } catch { return; }
        if (u.hostname !== "mcpedl.com") return;
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length !== 1 || skip.test(parts[0])) return;
        // Kartu hasil = leluhur terdekat yang juga memuat gambar sampul.
        let card = el;
        for (let i = 0; i < 6 && !card.find("img").length; i++) card = card.parent();
        if (!card.find("img").length) return;
        if (seen.has(parts[0])) return;
        const title = clean(card.find("h1,h2,h3,h4").first().text()) || clean(el.attr("title")) || clean(el.text());
        if (!title || title.length < 3) return;
        seen.add(parts[0]);
        const img = card.find("img").filter((_, im) => /storage\/submissions|forgecdn|wp-content|media\./i.test($(im).attr("src") ?? $(im).attr("data-src") ?? "")).first();
        const author = card.find('a[href*="/user/"]').first();
        const text = clean(card.text());
        const tags = card
          .find("a[href]")
          .map((_, t) => {
            const p = ($(t).attr("href") ?? "").split("/").filter(Boolean);
            return p.length >= 2 && !/^(user|https?:)$/i.test(p[0]) && !p[0].includes(".") ? clean($(t).text()) : "";
          })
          .get()
          .filter(Boolean);
        items.push({
          slug: parts[0],
          title,
          url: href,
          image: imgSrc(img.length ? img : card.find("img").first(), base),
          author: clean(author.text()) || null,
          date: /\b(\d{1,2} [A-Z][a-z]{2},? \d{4})\b/.exec(text)?.[1] ?? null,
          rating: Number(/(?:^|\s)([0-5]\.\d)(?:\s|$)/.exec(text)?.[1] ?? NaN) || null,
          tags: [...new Set(tags)].slice(0, 8),
          description: clean(card.find("p").first().text()) || null,
        });
      });
      if (!items.length) throw new HttpError(404, `Tidak ada hasil MCPEDL untuk '${q}'.`);
      return { query: q, page, total: items.length, items };
    },
  },
  {
    category: "search", slug: "cnn", kind: "json",
    title: "CNN Indonesia",
    description: "Cari berita di CNN Indonesia: judul, kanal, waktu terbit, gambar, dan tautan artikel.",
    params: [
      { name: "q", required: true, description: "Kata kunci berita.", example: "banjir" },
      { name: "page", description: "Nomor halaman. Default 1.", example: "1" },
      { name: "urut", description: "terbaru atau relevan. Default terbaru.", example: "terbaru" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const page = num(sp, "page", 1, 1, 50);
      const latest = opt(sp, "urut", "terbaru").toLowerCase() !== "relevan";
      const base = "https://www.cnnindonesia.com/";
      const url = `${base}search/?query=${encodeURIComponent(q)}${latest ? "&result_type=latest" : ""}${page > 1 ? `&page=${page}` : ""}`;
      const { $ } = await fetchPage(url, base);
      const seen = new Set<string>();
      const items: Record<string, unknown>[] = [];
      $("article").each((_, art) => {
        const el = $(art);
        const a = el.find('a[href*="cnnindonesia.com"]').first();
        const href = a.attr("href");
        const title = clean(el.find("h2,h3").first().text());
        if (!href || !title || seen.has(href) || !/\/\d{14}-\d+-\d+\//.test(href)) return;
        seen.add(href);
        const meta = clean(el.find("span.text-xs, .text-cnn_black_light3, span").last().text());
        const [channel, time] = meta.split("•").map((s) => clean(s));
        const stamp = /\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/.exec(href);
        items.push({
          title,
          url: href,
          image: imgSrc(el.find("img").first(), base),
          channel: channel || /cnnindonesia\.com\/([a-z-]+)\//.exec(href)?.[1] || null,
          time: time || null,
          published_at: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}+07:00` : null,
        });
      });
      if (!items.length) throw new HttpError(404, `Tidak ada berita CNN Indonesia untuk '${q}'.`);
      return { query: q, page, total: items.length, items };
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
    category: "search", slug: "tiktok", kind: "json",
    title: "TikTok",
    description: "Cari video TikTok lengkap dengan tautan video tanpa watermark, audio, statistik, dan pembuatnya.",
    params: [
      { name: "q", required: true, description: "Kata kunci video.", example: "kucing lucu" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      const limit = num(sp, "limit", 10, 1, 20);
      type V = {
        video_id?: string; region?: string; title?: string; cover?: string; duration?: number; play?: string; wmplay?: string;
        music?: string; music_info?: { title?: string; author?: string }; play_count?: number; digg_count?: number;
        comment_count?: number; share_count?: number; create_time?: number; author?: { unique_id?: string; nickname?: string; avatar?: string };
      };
      const d = await fetchJson<{ code?: number; msg?: string; data?: { videos?: V[] } }>(
        `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(q)}&count=${limit}&cursor=0&hd=1`,
        { headers: { "user-agent": UA, accept: "application/json" } },
        15000,
      );
      if (d.code !== 0) throw new HttpError(502, `Sumber TikTok menolak permintaan: ${d.msg ?? "tidak diketahui"}.`);
      const items = (d.data?.videos ?? []).slice(0, limit).map((v) => ({
        id: v.video_id ?? null,
        title: clean(v.title),
        url: v.author?.unique_id && v.video_id ? `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id}` : null,
        cover: v.cover ?? null,
        duration: v.duration ?? null,
        video: v.play ?? null,
        video_watermark: v.wmplay ?? null,
        audio: v.music ?? null,
        music_title: v.music_info?.title ?? null,
        views: v.play_count ?? 0,
        likes: v.digg_count ?? 0,
        comments: v.comment_count ?? 0,
        shares: v.share_count ?? 0,
        author: v.author?.unique_id ?? null,
        author_name: v.author?.nickname ?? null,
        author_avatar: v.author?.avatar ?? null,
        created_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
      }));
      if (!items.length) throw new HttpError(404, `Tidak ada video TikTok untuk '${q}'.`);
      return { query: q, total: items.length, items };
    },
  },
  {
    category: "search", slug: "myanimelist", kind: "json",
    title: "MyAnimeList",
    description: "Cari anime atau manga di MyAnimeList: skor, jumlah episode, status, genre, dan sinopsis.",
    params: [
      { name: "q", required: true, description: "Judul yang dicari.", example: "one piece" },
      { name: "tipe", description: "anime atau manga. Default anime.", example: "anime" },
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
      const d = await fetchJson<{ data?: A[] }>(`https://api.jikan.moe/v4/${tipe}?q=${encodeURIComponent(q)}&limit=${num(sp, "limit", 5, 1, 15)}&sfw=true`);
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
      return { query: q, type: tipe, total: items.length, items };
    },
  },
  {
    category: "search", slug: "steam", kind: "json",
    title: "Steam",
    description: "Cari game di Steam Store beserta harga dalam Rupiah, diskon, dan platform yang didukung.",
    params: [{ name: "q", required: true, description: "Nama game.", example: "stardew valley" }],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 100);
      type G = { id: number; name: string; tiny_image?: string; metascore?: string; price?: { currency?: string; initial?: number; final?: number }; platforms?: Record<string, boolean> };
      const d = await fetchJson<{ items?: G[] }>(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=id&l=indonesian`);
      const items = (d.items ?? []).map((g) => {
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
    description: "Hasil pencarian web dari DuckDuckGo: judul, tautan, dan cuplikan. Tanpa pelacakan.",
    params: [
      { name: "q", required: true, description: "Kata kunci pencarian.", example: "cara membuat bot whatsapp" },
      { name: "limit", description: "Jumlah hasil, 1 sampai 20. Default 10.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const q = need(sp, "q", 200);
      const { $ } = await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=id-id`, "https://html.duckduckgo.com/");
      const items: Record<string, unknown>[] = [];
      $(".result").each((_, r) => {
        const el = $(r);
        if (el.hasClass("result--ad")) return;
        const a = el.find("a.result__a").first();
        let href = a.attr("href") ?? "";
        const uddg = /[?&]uddg=([^&]+)/.exec(href);
        if (uddg) href = decodeURIComponent(uddg[1]);
        if (href.startsWith("//")) href = `https:${href}`;
        const title = clean(a.text());
        if (!title || !/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) return;
        items.push({
          title: decodeEntities(title),
          url: href,
          domain: new URL(href).hostname.replace(/^www\./, ""),
          snippet: clean(el.find(".result__snippet").text()) || null,
        });
      });
      const out = items.slice(0, num(sp, "limit", 10, 1, 20));
      if (!out.length) throw new HttpError(502, "Mesin pencari tidak mengirim hasil. Coba lagi beberapa saat lagi.");
      return { query: q, total: out.length, items: out };
    },
  },
];
