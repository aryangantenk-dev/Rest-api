import { load } from "cheerio";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, fetchRaw, need, parseHttpUrl } from "./helpers";
import { browserHeaders, clean } from "./scrape";

const UA = browserHeaders("https://www.google.com/")["user-agent"];

type Media = { type: "video" | "image" | "audio" | "file"; url: string; quality?: string | null; thumbnail?: string | null };

const NAV = {
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return s.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function hostOf(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(www|m|mobile|web|vt|vm|id|mbasic)\./, "");
}

function requireHost(u: URL, re: RegExp, label: string): void {
  if (!re.test(u.hostname.toLowerCase())) throw new HttpError(400, `Parameter 'url' harus berupa tautan ${label}.`);
}

/* ----------------------------------- TikTok ----------------------------------- */

export async function tiktok(url: URL) {
  requireHost(url, /(^|\.)tiktok\.com$/, "TikTok");
  type D = {
    id?: string; title?: string; cover?: string; duration?: number; play?: string; wmplay?: string; hdplay?: string; music?: string;
    images?: string[]; size?: number; hd_size?: number; play_count?: number; digg_count?: number; comment_count?: number; share_count?: number;
    create_time?: number; music_info?: { title?: string; author?: string }; author?: { unique_id?: string; nickname?: string; avatar?: string };
  };
  const d = await fetchJson<{ code?: number; msg?: string; data?: D }>(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url.toString())}&hd=1`,
    { headers: { "user-agent": UA, accept: "application/json" } },
    20000,
  );
  if (d.code !== 0 || !d.data) throw new HttpError(404, `Video TikTok tidak bisa diambil: ${d.msg ?? "tautan tidak valid atau video privat"}.`);
  const v = d.data;
  const abs = (u?: string) => (u ? (u.startsWith("http") ? u : `https://www.tikwm.com${u}`) : null);
  const slides = (v.images ?? []).filter(Boolean);
  const media: Media[] = slides.length
    ? slides.map((u) => ({ type: "image" as const, url: u }))
    : ([
        abs(v.hdplay) ? { type: "video", url: abs(v.hdplay)!, quality: "hd" } : null,
        abs(v.play) ? { type: "video", url: abs(v.play)!, quality: "sd" } : null,
        abs(v.wmplay) ? { type: "video", url: abs(v.wmplay)!, quality: "watermark" } : null,
      ].filter(Boolean) as Media[]);
  if (abs(v.music)) media.push({ type: "audio", url: abs(v.music)! });
  return {
    platform: "tiktok",
    id: v.id ?? null,
    type: slides.length ? "slide" : "video",
    title: clean(v.title) || null,
    thumbnail: abs(v.cover),
    duration: v.duration ?? null,
    author: v.author?.unique_id ?? null,
    author_name: v.author?.nickname ?? null,
    author_avatar: abs(v.author?.avatar),
    music_title: v.music_info?.title ?? null,
    stats: { views: v.play_count ?? 0, likes: v.digg_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 },
    created_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    video: abs(v.hdplay) ?? abs(v.play),
    video_watermark: abs(v.wmplay),
    audio: abs(v.music),
    images: slides,
    media,
  };
}

/* --------------------------------- Twitter / X -------------------------------- */

export async function twitter(url: URL) {
  requireHost(url, /(^|\.)(twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/, "Twitter/X");
  const id = /\/status(?:es)?\/(\d+)/.exec(url.pathname)?.[1];
  if (!id) throw new HttpError(400, "Tautan harus mengarah ke sebuah tweet, mis. https://x.com/user/status/123.");
  type M = { type?: string; url?: string; thumbnail_url?: string; width?: number; height?: number; duration?: number; variants?: { content_type?: string; bitrate?: number; url?: string }[] };
  type T = {
    text?: string; created_at?: string; likes?: number; retweets?: number; replies?: number; views?: number | null; url?: string;
    author?: { name?: string; screen_name?: string; avatar_url?: string }; media?: { all?: M[] };
  };
  const d = await fetchJson<{ code?: number; message?: string; tweet?: T | null }>(`https://api.fxtwitter.com/i/status/${id}`, { headers: { "user-agent": "YanxzAPI/1.0", accept: "application/json" } }, 15000);
  if (!d.tweet) throw new HttpError(404, "Tweet tidak ditemukan, dihapus, atau akunnya privat.");
  const t = d.tweet;
  const media: Media[] = [];
  for (const m of t.media?.all ?? []) {
    if (!m.url) continue;
    if (m.type === "photo") {
      media.push({ type: "image", url: m.url });
      continue;
    }
    const mp4 = (m.variants ?? []).filter((v) => v.url && v.content_type === "video/mp4").sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    if (mp4.length) {
      for (const v of mp4) media.push({ type: "video", url: v.url!, quality: /\/(\d+x\d+)\//.exec(v.url!)?.[1] ?? null, thumbnail: m.thumbnail_url ?? null });
    } else media.push({ type: "video", url: m.url, quality: m.width && m.height ? `${m.width}x${m.height}` : null, thumbnail: m.thumbnail_url ?? null });
  }
  if (!media.length) throw new HttpError(404, "Tweet ini tidak memiliki foto atau video.");
  return {
    platform: "twitter",
    id,
    title: clean(t.text) || null,
    author: t.author?.screen_name ?? null,
    author_name: t.author?.name ?? null,
    author_avatar: t.author?.avatar_url ?? null,
    stats: { views: t.views ?? null, likes: t.likes ?? 0, retweets: t.retweets ?? 0, replies: t.replies ?? 0 },
    created_at: t.created_at ? new Date(t.created_at).toISOString() : null,
    thumbnail: media.find((m) => m.thumbnail)?.thumbnail ?? media.find((m) => m.type === "image")?.url ?? null,
    video: media.find((m) => m.type === "video")?.url ?? null,
    images: media.filter((m) => m.type === "image").map((m) => m.url),
    media,
  };
}

/* ---------------------------------- Facebook ---------------------------------- */

async function facebookDirect(url: URL) {
  const res = await fetchRaw(url.toString(), { headers: { ...browserHeaders("https://www.facebook.com/"), ...NAV }, redirect: "follow" }, 15000);
  const html = await res.text();
  const grab = (key: string) => {
    const m = new RegExp(`"${key}":"(https:[^"]+)"`).exec(html);
    return m ? unescapeJson(m[1]) : null;
  };
  const hd = grab("browser_native_hd_url") ?? grab("playable_url_quality_hd") ?? grab("hd_src");
  const sd = grab("browser_native_sd_url") ?? grab("playable_url") ?? grab("sd_src");
  if (!hd && !sd) return null;
  const title = /<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"/.exec(html)?.[1] ?? /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  const thumbRaw = /"preferred_thumbnail":\{"image":\{"uri":"([^"]+)"/.exec(html)?.[1];
  const thumb = thumbRaw ? unescapeJson(thumbRaw) : /<meta\s+property="og:image"\s+content="([^"]*)"/.exec(html)?.[1];
  return { hd, sd, title: clean(decodeEntities(title)) || null, thumbnail: thumb ? decodeEntities(thumb) : null, source: "facebook" };
}

async function facebookViaFdown(url: URL) {
  const res = await fetchRaw(
    "https://fdown.net/download.php",
    {
      method: "POST",
      headers: { ...browserHeaders("https://fdown.net/"), "content-type": "application/x-www-form-urlencoded", origin: "https://fdown.net" },
      body: new URLSearchParams({ URLz: url.toString() }).toString(),
    },
    20000,
  );
  const $ = load(await res.text());
  const sd = $("#sdlink").attr("href") ?? null;
  const hd = $("#hdlink").attr("href") ?? null;
  if (!sd && !hd) return null;
  const title = clean($(".lib-row.lib-header").first().text());
  return { hd, sd, title: title && !/^no video title$/i.test(title) ? title : null, thumbnail: $(".lib-img-show").attr("src") ?? null, source: "fdown" };
}

export async function facebook(url: URL) {
  requireHost(url, /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, "Facebook");
  let r: Awaited<ReturnType<typeof facebookDirect>> = null;
  try { r = await facebookDirect(url); } catch { /* coba sumber cadangan */ }
  if (!r) {
    try { r = await facebookViaFdown(url); } catch { /* ditangani di bawah */ }
  }
  if (!r) throw new HttpError(404, "Video Facebook tidak bisa diambil. Pastikan tautannya publik dan berisi video.");
  const media: Media[] = [];
  if (r.hd) media.push({ type: "video", url: r.hd, quality: "hd" });
  if (r.sd) media.push({ type: "video", url: r.sd, quality: "sd" });
  return { platform: "facebook", source: r.source, title: r.title, thumbnail: r.thumbnail, video: r.hd ?? r.sd, video_hd: r.hd, video_sd: r.sd, media };
}

/* ---------------------------------- Instagram --------------------------------- */

type IgNode = {
  __typename?: string; is_video?: boolean; video_url?: string; display_url?: string;
  edge_sidecar_to_children?: { edges?: { node?: IgNode }[] };
  owner?: { username?: string; full_name?: string; profile_pic_url?: string };
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  edge_media_preview_like?: { count?: number };
  edge_media_to_parent_comment?: { count?: number };
  video_view_count?: number; taken_at_timestamp?: number;
};

async function instagramGraphql(code: string): Promise<IgNode | null> {
  const lsd = "AVqbxe3J_YA";
  const body = new URLSearchParams({
    lsd,
    variables: JSON.stringify({ shortcode: code, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }),
    doc_id: "8845758582119845",
  });
  const d = await fetchJson<{ data?: { xdt_shortcode_media?: IgNode | null } }>(
    "https://www.instagram.com/graphql/query",
    {
      method: "POST",
      headers: {
        "user-agent": UA,
        accept: "*/*",
        "content-type": "application/x-www-form-urlencoded",
        "x-ig-app-id": "936619743392459",
        "x-fb-lsd": lsd,
        "x-asbd-id": "129477",
        "x-fb-friendly-name": "PolarisPostActionLoadPostQueryQuery",
        "sec-fetch-site": "same-origin",
        origin: "https://www.instagram.com",
        referer: `https://www.instagram.com/p/${code}/`,
      },
      body: body.toString(),
    },
    15000,
  );
  return d.data?.xdt_shortcode_media ?? null;
}

async function instagramEmbed(code: string) {
  const res = await fetchRaw(`https://www.instagram.com/p/${code}/embed/captioned/`, { headers: { ...browserHeaders("https://www.instagram.com/"), ...NAV } }, 15000);
  const html = await res.text();
  const media: Media[] = [];
  for (const m of html.matchAll(/\\?"video_url\\?":\\?"(https:[^"\\]+(?:\\\\?\/[^"\\]+)*)\\?"/g)) {
    const u = unescapeJson(m[1].replace(/\\\\\//g, "/").replace(/\\\\u0026/g, "&"));
    if (!media.some((x) => x.url === u)) media.push({ type: "video", url: u });
  }
  const $ = load(html);
  if (!media.length) {
    const img = $("img.EmbeddedMediaImage").attr("src");
    if (img) media.push({ type: "image", url: img });
  }
  if (!media.length) return null;
  return {
    media,
    caption: clean($(".Caption").clone().children(".CaptionUsername, .CaptionComments").remove().end().text()) || null,
    username: clean($(".UsernameText").first().text()) || clean($(".CaptionUsername").first().text()) || null,
  };
}

export async function instagram(url: URL) {
  requireHost(url, /(^|\.)(instagram\.com|instagr\.am)$/, "Instagram");
  const code = /\/(?:p|reels?|tv|share\/(?:p|reel))\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  if (!code) throw new HttpError(400, "Tautan harus berupa post, reel, atau video Instagram, mis. https://www.instagram.com/reel/XXXX/.");

  let node: IgNode | null = null;
  try { node = await instagramGraphql(code); } catch { /* coba embed */ }
  if (node) {
    const kids = node.edge_sidecar_to_children?.edges?.map((e) => e.node).filter((n): n is IgNode => !!n) ?? [node];
    const media: Media[] = kids
      .map((n): Media | null => (n.is_video && n.video_url ? { type: "video", url: n.video_url, thumbnail: n.display_url ?? null } : n.display_url ? { type: "image", url: n.display_url } : null))
      .filter((m): m is Media => !!m);
    if (media.length) {
      return {
        platform: "instagram",
        source: "graphql",
        id: code,
        type: kids.length > 1 ? "carousel" : media[0].type,
        title: clean(node.edge_media_to_caption?.edges?.[0]?.node?.text) || null,
        author: node.owner?.username ?? null,
        author_name: node.owner?.full_name ?? null,
        author_avatar: node.owner?.profile_pic_url ?? null,
        stats: { likes: node.edge_media_preview_like?.count ?? null, comments: node.edge_media_to_parent_comment?.count ?? null, views: node.video_view_count ?? null },
        created_at: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null,
        thumbnail: node.display_url ?? null,
        video: media.find((m) => m.type === "video")?.url ?? null,
        images: media.filter((m) => m.type === "image").map((m) => m.url),
        media,
      };
    }
  }

  let emb: Awaited<ReturnType<typeof instagramEmbed>> = null;
  try { emb = await instagramEmbed(code); } catch { /* ditangani di bawah */ }
  if (!emb) throw new HttpError(404, "Post Instagram tidak bisa diambil. Pastikan akunnya publik; Instagram juga kadang membatasi akses dari server.");
  return {
    platform: "instagram",
    source: "embed",
    id: code,
    type: emb.media[0].type,
    title: emb.caption,
    author: emb.username,
    thumbnail: null,
    video: emb.media.find((m) => m.type === "video")?.url ?? null,
    images: emb.media.filter((m) => m.type === "image").map((m) => m.url),
    media: emb.media,
  };
}

/* ---------------------------------- Pinterest --------------------------------- */

export async function pinterest(url: URL) {
  requireHost(url, /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, "Pinterest");
  const res = await fetchRaw(url.toString(), { headers: { ...browserHeaders("https://www.pinterest.com/"), ...NAV }, redirect: "follow" }, 15000);
  const html = await res.text();
  const finalUrl = res.url || url.toString();
  const id = /\/pin\/(?:[^/]*--)?(\d+)/.exec(finalUrl)?.[1] ?? null;

  const videos = new Set<string>();
  for (const m of html.matchAll(/https:\\?\/\\?\/v1\.pinimg\.com\\?\/videos\\?\/[^"'\\\s]+?(?:\\?\/[^"'\\\s]+?)*\.(?:mp4|m3u8)/g)) videos.add(m[0].replace(/\\/g, ""));
  const vlist = [...videos];
  const mp4 = vlist.filter((v) => v.endsWith(".mp4")).sort((a, b) => Number(/(\d{3,4})p/.exec(b)?.[1] ?? 0) - Number(/(\d{3,4})p/.exec(a)?.[1] ?? 0));
  const hls = vlist.find((v) => v.endsWith(".m3u8")) ?? null;
  // Pinterest menyimpan MP4 di jalur yang sama dengan HLS; turunkan bila hanya HLS yang muncul.
  const derived = !mp4.length && hls ? hls.replace("/hls/", "/720p/").replace(/\.m3u8$/, ".mp4") : null;

  const meta = (p: string) => {
    const m = new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`).exec(html) ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${p}"`).exec(html);
    return m ? decodeEntities(m[1]) : null;
  };
  let image = meta("og:image");
  const orig = /https:\\?\/\\?\/i\.pinimg\.com\\?\/originals\\?\/[0-9a-f/\\]+\.(?:jpg|png|webp|gif)/.exec(html)?.[0]?.replace(/\\/g, "");
  if (orig) image = orig;
  else if (image) image = image.replace(/\/(?:236x|474x|564x|736x|1200x)\//, "/originals/");

  const video = mp4[0] ?? derived;
  if (!image && !video) throw new HttpError(404, "Pin tidak ditemukan atau Pinterest menolak permintaan dari server ini.");
  const media: Media[] = [];
  for (const v of mp4) media.push({ type: "video", url: v, quality: /(\d{3,4}p)/.exec(v)?.[1] ?? null });
  if (derived) media.push({ type: "video", url: derived, quality: "720p" });
  if (image) media.push({ type: "image", url: image });
  return {
    platform: "pinterest",
    id,
    type: video ? "video" : "image",
    title: clean(meta("og:title") ?? "") || null,
    description: clean(meta("og:description") ?? meta("description") ?? "") || null,
    thumbnail: image,
    image,
    video,
    hls,
    url: id ? `https://www.pinterest.com/pin/${id}/` : finalUrl,
    media,
  };
}

/* ---------------------------------- MediaFire --------------------------------- */

export async function mediafire(url: URL) {
  requireHost(url, /(^|\.)mediafire\.com$/, "MediaFire");
  const res = await fetchRaw(url.toString(), { headers: { ...browserHeaders("https://www.mediafire.com/"), ...NAV }, redirect: "follow" }, 15000);
  const html = await res.text();
  const $ = load(html);
  const btn = $("a#downloadButton").first();
  let link = btn.attr("href") ?? "";
  const scrambled = btn.attr("data-scrambled-url");
  if ((!link || !/^https?:\/\//.test(link)) && scrambled) {
    try { link = Buffer.from(scrambled, "base64").toString("utf8"); } catch { /* abaikan */ }
  }
  if (!/^https?:\/\//.test(link)) link = /https?:\/\/download\d*\.mediafire\.com\/[^"'\s<]+/.exec(html)?.[0] ?? "";
  if (!link) {
    if (/cf-challenge|Just a moment|Attention Required/i.test(html)) throw new HttpError(502, "MediaFire menolak permintaan dari server ini (proteksi Cloudflare).");
    throw new HttpError(404, "Berkas MediaFire tidak ditemukan, dihapus, atau tautannya berupa folder.");
  }
  const name = clean($(".dl-btn-label").first().attr("title")) || clean($(".filename").first().text()) || decodeURIComponent(link.split("/").pop()?.split("?")[0] ?? "") || null;
  const size = /\(([\d.,]+\s*[KMGT]?B)\)/i.exec(clean(btn.text()))?.[1] ?? null;
  const details: Record<string, string> = {};
  $("ul.details li").each((_, li) => {
    const [k, ...v] = clean($(li).text()).split(":");
    if (k && v.length) details[k.trim().toLowerCase()] = v.join(":").trim();
  });
  return {
    platform: "mediafire",
    filename: name,
    extension: name && name.includes(".") ? name.split(".").pop()!.toLowerCase() : null,
    size: size ?? details["file size"] ?? null,
    uploaded: details["uploaded"] ?? null,
    download: link,
    media: [{ type: "file" as const, url: link }],
  };
}

/* -------------------------------- Google Drive -------------------------------- */

export async function gdrive(url: URL) {
  requireHost(url, /(^|\.)(drive|docs)\.(google|usercontent\.google)\.com$/, "Google Drive");
  const id = /\/(?:file\/d|folders|d)\/([A-Za-z0-9_-]{15,})/.exec(url.pathname)?.[1] ?? url.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new HttpError(400, "ID berkas Google Drive tidak ditemukan di tautan.");
  if (/\/folders\//.test(url.pathname)) throw new HttpError(400, "Tautan folder tidak didukung. Kirim tautan berkas.");
  const direct = `https://drive.usercontent.google.com/download?id=${id}&export=download`;
  const res = await fetchRaw(direct, { headers: browserHeaders("https://drive.google.com/"), redirect: "follow" }, 15000);
  const cd = res.headers.get("content-disposition");
  const type = res.headers.get("content-type") ?? "";
  if (cd) {
    void res.body?.cancel().catch(() => undefined);
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
    const name = star ? decodeURIComponent(star) : /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? null;
    const len = Number(res.headers.get("content-length") ?? NaN);
    return { platform: "gdrive", id, filename: name, mime: type.split(";")[0] || null, size_bytes: Number.isFinite(len) ? len : null, size: null as string | null, download: direct, view: `https://drive.google.com/file/d/${id}/view`, media: [{ type: "file" as const, url: direct }] };
  }
  const html = await res.text();
  const $ = load(html);
  const form = $("form#download-form");
  if (!form.length) throw new HttpError(404, "Berkas Google Drive tidak ditemukan atau tidak dibagikan untuk publik.");
  const qs = new URLSearchParams();
  form.find("input[name]").each((_, i) => { qs.set($(i).attr("name")!, $(i).attr("value") ?? ""); });
  const action = form.attr("action") || "https://drive.usercontent.google.com/download";
  const download = `${action}?${qs.toString()}`;
  const info = clean($(".uc-name-size").text());
  return {
    platform: "gdrive",
    id,
    filename: clean($(".uc-name-size a").first().text()) || null,
    mime: null,
    size_bytes: null,
    size: /\(([^)]+)\)\s*$/.exec(info)?.[1] ?? null,
    download,
    view: `https://drive.google.com/file/d/${id}/view`,
    media: [{ type: "file" as const, url: download }],
  };
}

/* ----------------------------------- GitHub ----------------------------------- */

export async function github(input: string) {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+))?(?:[/?#].*)?$/.exec(input.trim());
  if (!m) throw new HttpError(400, "Kirim tautan repositori GitHub atau format pengguna/repo.");
  const [, owner, repo, ref] = m;
  type R = { full_name: string; description: string | null; default_branch: string; stargazers_count: number; forks_count: number; size: number; language: string | null; html_url: string; license?: { spdx_id?: string } | null };
  type Rel = { tag_name?: string; name?: string; published_at?: string; assets?: { name: string; size: number; download_count: number; browser_download_url: string }[] };
  const h = { headers: { accept: "application/vnd.github+json" } };
  const info = await fetchJson<R>(`https://api.github.com/repos/${owner}/${repo}`, h).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) throw new HttpError(404, `Repositori ${owner}/${repo} tidak ditemukan atau privat.`);
    return null;
  });
  const full = info?.full_name ?? `${owner}/${repo}`;
  const branch = ref ?? info?.default_branch ?? "HEAD";
  const zip = branch === "HEAD" ? `https://api.github.com/repos/${full}/zipball` : `https://github.com/${full}/archive/refs/heads/${branch}.zip`;
  const rel = info ? await fetchJson<Rel>(`https://api.github.com/repos/${full}/releases/latest`, h).catch(() => null) : null;
  return {
    platform: "github",
    repo: full,
    url: info?.html_url ?? `https://github.com/${full}`,
    description: info?.description ?? null,
    branch,
    stars: info?.stargazers_count ?? null,
    forks: info?.forks_count ?? null,
    language: info?.language ?? null,
    license: info?.license?.spdx_id ?? null,
    size_kb: info?.size ?? null,
    filename: `${repo}-${branch}.zip`,
    download: zip,
    tarball: branch === "HEAD" ? `https://api.github.com/repos/${full}/tarball` : `https://github.com/${full}/archive/refs/heads/${branch}.tar.gz`,
    clone: `https://github.com/${full}.git`,
    latest_release: rel?.tag_name
      ? { tag: rel.tag_name, name: rel.name ?? null, published_at: rel.published_at ?? null, assets: (rel.assets ?? []).map((a) => ({ name: a.name, size: a.size, downloads: a.download_count, url: a.browser_download_url })) }
      : null,
    media: [{ type: "file" as const, url: zip }],
  };
}

/* ------------------------------------- AIO ------------------------------------ */

const PLATFORMS: { name: string; test: RegExp; run: (u: URL) => Promise<unknown> }[] = [
  { name: "tiktok", test: /(^|\.)tiktok\.com$/, run: tiktok },
  { name: "instagram", test: /(^|\.)(instagram\.com|instagr\.am)$/, run: instagram },
  { name: "facebook", test: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/, run: facebook },
  { name: "twitter", test: /(^|\.)(twitter\.com|x\.com)$/, run: twitter },
  { name: "pinterest", test: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, run: pinterest },
  { name: "mediafire", test: /(^|\.)mediafire\.com$/, run: mediafire },
  { name: "gdrive", test: /(^|\.)(drive|docs)\.google\.com$/, run: gdrive },
  { name: "github", test: /(^|\.)github\.com$/, run: (u) => github(u.toString()) },
];

const urlParam = (example: string) => [{ name: "url", required: true, description: "Tautan yang ingin diunduh.", example }];

function target(sp: URLSearchParams): URL {
  const raw = need(sp, "url", 2000);
  return parseHttpUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
}

export const downloaderEndpoints: Endpoint[] = [
  {
    category: "downloader", slug: "aio", kind: "json",
    title: "All in One",
    description: "Satu endpoint untuk semua: kirim tautan TikTok, Instagram, Facebook, Twitter/X, Pinterest, MediaFire, Google Drive, atau GitHub dan platformnya dikenali otomatis.",
    params: urlParam("https://www.tiktok.com/@tiktok/video/7106594312292453675"),
    handler: async ({ sp }) => {
      const u = target(sp);
      const host = u.hostname.toLowerCase();
      const p = PLATFORMS.find((x) => x.test.test(host));
      if (!p) throw new HttpError(400, `Platform '${hostOf(u)}' belum didukung. Yang didukung: ${PLATFORMS.map((x) => x.name).join(", ")}.`);
      return p.run(u);
    },
  },
  {
    category: "downloader", slug: "tiktok", kind: "json",
    title: "TikTok",
    description: "Unduh video TikTok tanpa watermark (HD bila tersedia), audio, atau seluruh foto dari post slide.",
    params: urlParam("https://www.tiktok.com/@tiktok/video/7106594312292453675"),
    handler: async ({ sp }) => tiktok(target(sp)),
  },
  {
    category: "downloader", slug: "instagram", kind: "json",
    title: "Instagram",
    description: "Ambil video reel, foto, atau seluruh isi carousel dari post Instagram publik.",
    params: urlParam("https://www.instagram.com/p/CuE2WNQs6vH/"),
    handler: async ({ sp }) => instagram(target(sp)),
  },
  {
    category: "downloader", slug: "facebook", kind: "json",
    title: "Facebook",
    description: "Ambil tautan video Facebook publik dalam kualitas HD dan SD, termasuk reel dan fb.watch.",
    params: urlParam("https://www.facebook.com/watch/?v=10153231379946729"),
    handler: async ({ sp }) => facebook(target(sp)),
  },
  {
    category: "downloader", slug: "twitter", kind: "json",
    title: "Twitter / X",
    description: "Ambil video (semua resolusi) dan foto dari sebuah tweet, lengkap dengan teks dan statistiknya.",
    params: urlParam("https://x.com/BarackObama/status/266031293945503744"),
    handler: async ({ sp }) => twitter(target(sp)),
  },
  {
    category: "downloader", slug: "pinterest", kind: "json",
    title: "Pinterest",
    description: "Unduh gambar resolusi asli atau video dari sebuah pin. Mendukung tautan pendek pin.it.",
    params: urlParam("https://www.pinterest.com/pin/99360735500167749/"),
    handler: async ({ sp }) => pinterest(target(sp)),
  },
  {
    category: "downloader", slug: "mediafire", kind: "json",
    title: "MediaFire",
    description: "Ubah tautan halaman MediaFire menjadi tautan unduh langsung beserta nama dan ukuran berkas.",
    params: urlParam("https://www.mediafire.com/file/k4makp2pk726bmb/Fonts.zip"),
    handler: async ({ sp }) => mediafire(target(sp)),
  },
  {
    category: "downloader", slug: "gdrive", kind: "json",
    title: "Google Drive",
    description: "Ubah tautan berbagi Google Drive menjadi tautan unduh langsung, termasuk berkas besar yang butuh konfirmasi.",
    params: urlParam("https://drive.google.com/file/d/1l_5RK28JRL19wpT22B-DY9We3TVXnnQQ/view"),
    handler: async ({ sp }) => gdrive(target(sp)),
  },
  {
    category: "downloader", slug: "github", kind: "json",
    title: "GitHub",
    description: "Dapatkan tautan unduh ZIP sebuah repositori dan berkas dari rilis terbarunya.",
    params: [{ name: "url", required: true, description: "Tautan repositori atau format pengguna/repo.", example: "https://github.com/WhiskeySockets/Baileys" }],
    handler: async ({ sp }) => github(need(sp, "url", 300)),
  },
];
