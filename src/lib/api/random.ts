import crypto from "node:crypto";
import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, need, num, opt, pick } from "./helpers";
import { dares, facts, gombal, jokes, pantun, quotes, truths } from "./data";

export const randomEndpoints: Endpoint[] = [
  {
    category: "random", slug: "quote", kind: "json",
    title: "Kutipan Bijak",
    description: "Kutipan inspiratif berbahasa Indonesia dari tokoh dunia, berganti di setiap permintaan.",
    params: [],
    handler: async () => pick(quotes),
  },
  {
    category: "random", slug: "fact", kind: "json",
    title: "Fakta Unik",
    description: "Fakta menarik seputar sains, alam, dan Indonesia.",
    params: [],
    handler: async () => ({ fact: pick(facts) }),
  },
  {
    category: "random", slug: "joke", kind: "json",
    title: "Jokes Receh",
    description: "Tebak-tebakan dan candaan receh untuk memecah suasana.",
    params: [],
    handler: async () => pick(jokes),
  },
  {
    category: "random", slug: "pantun", kind: "json",
    title: "Pantun",
    description: "Pantun nasihat dan jenaka dalam bahasa Indonesia.",
    params: [],
    handler: async () => {
      const text = pick(pantun);
      return { pantun: text, lines: text.split("\n") };
    },
  },
  {
    category: "random", slug: "gombal", kind: "json",
    title: "Gombalan",
    description: "Kata-kata gombal manis yang siap kamu kirimkan.",
    params: [],
    handler: async () => ({ gombal: pick(gombal) }),
  },
  {
    category: "random", slug: "truth", kind: "json",
    title: "Truth",
    description: "Pertanyaan permainan Truth or Dare.",
    params: [],
    handler: async () => ({ truth: pick(truths) }),
  },
  {
    category: "random", slug: "dare", kind: "json",
    title: "Dare",
    description: "Tantangan permainan Truth or Dare.",
    params: [],
    handler: async () => ({ dare: pick(dares) }),
  },
  {
    category: "random", slug: "number", kind: "json",
    title: "Angka Acak",
    description: "Bilangan bulat acak yang aman secara kriptografis di antara dua batas.",
    params: [
      { name: "min", description: "Nilai minimum. Default 1.", example: "1" },
      { name: "max", description: "Nilai maksimum. Default 100.", example: "100" },
      { name: "count", description: "Jumlah angka (1–100). Default 1.", example: "5" },
    ],
    handler: async ({ sp }) => {
      const min = Math.floor(num(sp, "min", 1, -1e9, 1e9));
      const max = Math.floor(num(sp, "max", 100, -1e9, 1e9));
      if (min > max) throw new HttpError(400, "'min' tidak boleh lebih besar dari 'max'.");
      const count = Math.round(num(sp, "count", 1, 1, 100));
      const numbers = Array.from({ length: count }, () => crypto.randomInt(min, max + 1));
      return { min, max, result: count === 1 ? numbers[0] : numbers };
    },
  },
  {
    category: "random", slug: "color", kind: "json",
    title: "Warna Acak",
    description: "Palet warna acak lengkap dengan kode HEX dan RGB.",
    params: [{ name: "count", description: "Jumlah warna (1–20). Default 5.", example: "5" }],
    handler: async ({ sp }) => {
      const count = Math.round(num(sp, "count", 5, 1, 20));
      const colors = Array.from({ length: count }, () => {
        const n = crypto.randomInt(0, 0xffffff + 1);
        const hex = `#${n.toString(16).padStart(6, "0")}`;
        return { hex, rgb: `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` };
      });
      return { colors };
    },
  },
  {
    category: "random", slug: "dice", kind: "json",
    title: "Lempar Dadu",
    description: "Lempar satu atau beberapa dadu dengan jumlah sisi yang bisa diatur.",
    params: [
      { name: "dice", description: "Jumlah dadu (1–20). Default 2.", example: "2" },
      { name: "sides", description: "Jumlah sisi (2–1000). Default 6.", example: "6" },
    ],
    handler: async ({ sp }) => {
      const dice = Math.round(num(sp, "dice", 2, 1, 20));
      const sides = Math.round(num(sp, "sides", 6, 2, 1000));
      const rolls = Array.from({ length: dice }, () => crypto.randomInt(1, sides + 1));
      return { dice, sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
    },
  },
  {
    category: "random", slug: "coin", kind: "json",
    title: "Lempar Koin",
    description: "Gambar atau angka? Biarkan semesta yang memutuskan.",
    params: [],
    handler: async () => {
      const heads = crypto.randomInt(2) === 0;
      return { result: heads ? "gambar" : "angka" };
    },
  },
  {
    category: "random", slug: "choose", kind: "json",
    title: "Pilih Acak",
    description: "Pilih satu opsi secara acak dari daftar yang kamu berikan, cocok untuk undian.",
    params: [{ name: "options", required: true, description: "Daftar opsi dipisah koma.", example: "nasi goreng, mie ayam, bakso, sate" }],
    handler: async ({ sp }) => {
      const options = need(sp, "options", 2000).split(",").map((s) => s.trim()).filter(Boolean);
      if (options.length < 2) throw new HttpError(400, "Berikan minimal dua opsi.");
      return { options, chosen: options[crypto.randomInt(options.length)] };
    },
  },
  {
    category: "random", slug: "dog", kind: "json",
    title: "Foto Anjing",
    description: "Foto anjing acak dari berbagai ras. Opsional filter berdasarkan ras.",
    params: [{ name: "breed", description: "Nama ras (mis. husky, corgi, beagle).", example: "husky" }],
    handler: async ({ sp }) => {
      const breed = opt(sp, "breed").toLowerCase().replace(/[^a-z]/g, "");
      const d = await fetchJson<{ message: string; status: string }>(breed ? `https://dog.ceo/api/breed/${breed}/images/random` : "https://dog.ceo/api/breeds/image/random");
      if (d.status !== "success") throw new HttpError(404, "Ras tidak ditemukan.");
      return { image: d.message };
    },
  },
];

/** Untuk endpoint gambar acak: redirect=1 langsung mengalihkan ke berkas gambar (cocok untuk <img src>). */
function imageOut<T extends { image: string }>(sp: URLSearchParams, payload: T): T | Response {
  if (opt(sp, "redirect") === "1") return new Response(null, { status: 302, headers: { location: payload.image, "cache-control": "no-store" } });
  return payload;
}

const redirectParam = { name: "redirect", description: "Isi 1 untuk langsung dialihkan ke berkas gambar.", example: "" };

const NEKOS_IMAGE = ["neko", "waifu", "husbando", "kitsune"];
const NEKOS_GIF = [
  "hug", "pat", "kiss", "cuddle", "smile", "wave", "cry", "dance", "happy", "laugh", "blush", "wink", "poke", "slap", "bite",
  "highfive", "handhold", "nod", "sleep", "think", "thumbsup", "yawn", "baka", "bored", "facepalm", "feed", "pout", "shrug", "smug", "stare", "tickle",
];

type NekosItem = { url: string; artist_name?: string; artist_href?: string; source_url?: string; anime_name?: string };
async function nekos(category: string): Promise<NekosItem> {
  const d = await fetchJson<{ results?: NekosItem[] }>(`https://nekos.best/api/v2/${category}`);
  const item = d.results?.[0];
  if (!item?.url) throw new HttpError(502, "Sumber gambar anime tidak mengirim hasil.");
  return item;
}

type Wall = { id: string; url: string; path: string; resolution: string; file_size: number; file_type: string; colors?: string[]; thumbs?: { large?: string } };
async function wallhaven(q: string, categories: string, atleast = "1920x1080"): Promise<Wall> {
  const d = await fetchJson<{ data?: Wall[] }>(
    `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(q)}&categories=${categories}&purity=100&sorting=random&atleast=${atleast}&seed=${crypto.randomBytes(3).toString("hex")}`,
  );
  const list = d.data ?? [];
  if (!list.length) throw new HttpError(404, "Tidak ada gambar yang cocok. Coba kata kunci lain.");
  return list[crypto.randomInt(list.length)];
}
const wallOut = (w: Wall) => ({ image: w.path, thumbnail: w.thumbs?.large ?? null, resolution: w.resolution, size: w.file_size, type: w.file_type, colors: w.colors ?? [], source: w.url });

const SCENERY: Record<string, string> = {
  acak: "landscape", gunung: "mountains", pantai: "beach", hutan: "forest", danau: "lake", laut: "ocean", sawah: "rice field",
  air_terjun: "waterfall", langit: "sky", senja: "sunset", malam: "night sky", kota: "cityscape", salju: "snow landscape", gurun: "desert",
};

const moreEndpoints: Endpoint[] = [
  {
    category: "random", slug: "anime", kind: "json",
    title: "Gambar Anime",
    description: "Ilustrasi anime acak yang aman untuk semua umur: neko, waifu, husbando, atau kitsune, lengkap dengan kredit artisnya.",
    params: [{ name: "tipe", description: `Pilihan: ${NEKOS_IMAGE.join(", ")}. Default acak.`, example: "waifu" }, redirectParam],
    handler: async ({ sp }) => {
      const tipe = opt(sp, "tipe").toLowerCase() || pick(NEKOS_IMAGE);
      if (!NEKOS_IMAGE.includes(tipe)) throw new HttpError(400, `Tipe tidak dikenal. Pilihan: ${NEKOS_IMAGE.join(", ")}.`);
      const r = await nekos(tipe);
      return imageOut(sp, { type: tipe, image: r.url, artist: r.artist_name ?? null, artist_url: r.artist_href ?? null, source: r.source_url ?? null });
    },
  },
  {
    category: "random", slug: "animegif", kind: "json",
    title: "GIF Reaksi Anime",
    description: "GIF reaksi anime acak untuk perintah bot seperti peluk, tepuk, atau tampar. Menyertakan judul anime asalnya.",
    params: [{ name: "aksi", description: "Mis. hug, pat, kiss, slap, cry, dance, wave. Default acak.", example: "hug" }, redirectParam],
    handler: async ({ sp }) => {
      const aksi = opt(sp, "aksi").toLowerCase() || pick(NEKOS_GIF);
      if (!NEKOS_GIF.includes(aksi)) throw new HttpError(400, `Aksi tidak dikenal. Pilihan: ${NEKOS_GIF.join(", ")}.`);
      const r = await nekos(aksi);
      return imageOut(sp, { action: aksi, image: r.url, anime: r.anime_name ?? null });
    },
  },
  {
    category: "random", slug: "pemandangan", kind: "json",
    title: "Pemandangan",
    description: "Foto pemandangan alam resolusi tinggi secara acak: gunung, pantai, hutan, senja, dan lainnya.",
    params: [{ name: "tema", description: `Pilihan: ${Object.keys(SCENERY).join(", ")}. Default acak.`, example: "gunung" }, redirectParam],
    handler: async ({ sp }) => {
      const tema = opt(sp, "tema", "acak").toLowerCase().replace(/\s+/g, "_");
      const q = SCENERY[tema];
      if (!q) throw new HttpError(400, `Tema tidak dikenal. Pilihan: ${Object.keys(SCENERY).join(", ")}.`);
      return imageOut(sp, { theme: tema, ...wallOut(await wallhaven(q, "100")) });
    },
  },
  {
    category: "random", slug: "wallpaper", kind: "json",
    title: "Wallpaper",
    description: "Wallpaper acak minimal Full HD untuk ponsel atau desktop. Bisa disaring dengan kata kunci dan kategori.",
    params: [
      { name: "q", description: "Kata kunci opsional, sebaiknya bahasa Inggris.", example: "cyberpunk" },
      { name: "kategori", description: "umum, anime, atau semua. Default semua.", example: "anime" },
      { name: "orientasi", description: "desktop atau hp. Default desktop.", example: "desktop" },
      redirectParam,
    ],
    handler: async ({ sp }) => {
      const kat = opt(sp, "kategori", "semua").toLowerCase();
      const hp = opt(sp, "orientasi", "desktop").toLowerCase() === "hp";
      const w = await wallhaven(opt(sp, "q").slice(0, 80), kat === "anime" ? "010" : kat === "umum" ? "100" : "110", hp ? "1080x1920&ratios=portrait" : "1920x1080&ratios=landscape");
      return imageOut(sp, wallOut(w));
    },
  },
  {
    category: "random", slug: "cat", kind: "json",
    title: "Foto Kucing",
    description: "Foto kucing acak yang menggemaskan beserta ukuran gambarnya.",
    params: [redirectParam],
    handler: async ({ sp }) => {
      const d = await fetchJson<{ id: string; url: string; width: number; height: number }[]>("https://api.thecatapi.com/v1/images/search");
      if (!d[0]?.url) throw new HttpError(502, "Sumber gambar tidak mengirim hasil.");
      return imageOut(sp, { image: d[0].url, width: d[0].width, height: d[0].height });
    },
  },
  {
    category: "random", slug: "fox", kind: "json",
    title: "Foto Rubah",
    description: "Foto rubah acak dari randomfox.ca.",
    params: [redirectParam],
    handler: async ({ sp }) => {
      const d = await fetchJson<{ image?: string; link?: string }>("https://randomfox.ca/floof/");
      if (!d.image) throw new HttpError(502, "Sumber gambar tidak mengirim hasil.");
      return imageOut(sp, { image: d.image, source: d.link ?? null });
    },
  },
  {
    category: "random", slug: "meme", kind: "json",
    title: "Meme",
    description: "Meme acak dari Reddit. Default mengambil dari komunitas Indonesia; bisa diganti ke subreddit lain.",
    params: [{ name: "subreddit", description: "Nama subreddit sumber. Default indonesia.", example: "indonesia" }, redirectParam],
    handler: async ({ sp }) => {
      const sub = opt(sp, "subreddit", "indonesia").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30) || "indonesia";
      type M = { postLink?: string; subreddit?: string; title?: string; url?: string; nsfw?: boolean; spoiler?: boolean; author?: string; ups?: number; code?: number; message?: string };
      for (let i = 0; i < 3; i++) {
        const d = await fetchJson<M>(`https://meme-api.com/gimme/${sub}`);
        if (!d.url) throw new HttpError(404, d.message ?? "Subreddit tidak ditemukan atau tidak punya meme bergambar.");
        if (d.nsfw || d.spoiler) continue;
        return imageOut(sp, { title: d.title ?? null, image: d.url, subreddit: d.subreddit ?? sub, author: d.author ?? null, upvotes: d.ups ?? 0, source: d.postLink ?? null });
      }
      throw new HttpError(404, "Tidak menemukan meme yang aman dari subreddit tersebut. Coba lagi.");
    },
  },
];

randomEndpoints.push(...moreEndpoints);
