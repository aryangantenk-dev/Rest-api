import type { CategoryId } from "./types";

export type Category = {
  id: CategoryId;
  name: string;
  tagline: string;
  description: string;
  seoTitle: string;
};

export const categories: Category[] = [
  {
    id: "ai",
    name: "Artificial Intelligence",
    tagline: "Chat & generator gambar",
    description: "Endpoint AI untuk percakapan cerdas dan pembuatan gambar dari teks, tanpa perlu API key.",
    seoTitle: "REST API AI Gratis: Chat AI & Text to Image",
  },
  {
    id: "tools",
    name: "Tools",
    tagline: "Utilitas developer harian",
    description: "Kumpulan alat bantu: QR Code, pemendek URL, penerjemah, kalkulator, hash, DNS, dan info IP.",
    seoTitle: "REST API Tools: QR Code, Short URL, Translate, Hash, DNS",
  },
  {
    id: "text",
    name: "Text",
    tagline: "Olah & ubah teks",
    description: "Manipulasi teks: slug, konversi huruf, morse, biner, angka romawi, fancy text, dan lorem ipsum.",
    seoTitle: "REST API Text: Slug, Morse, Biner, Fancy Text, Lorem Ipsum",
  },
  {
    id: "image",
    name: "Image",
    tagline: "Gambar dibuat on-the-fly",
    description: "Hasilkan gambar PNG secara dinamis: placeholder, avatar inisial, text-to-picture, dan wallpaper gradien.",
    seoTitle: "REST API Image: Placeholder, Avatar, Text to Picture",
  },
  {
    id: "canvas",
    name: "Canvas",
    tagline: "Kartu & meme siap kirim",
    description: "Gambar jadi dari teks: brat, iPhone quoted chat (iqc), Windows Media Player, kartu welcome, rank, quote stiker, meme, dan lainnya.",
    seoTitle: "REST API Canvas: Brat, IQC, Welcome Card, Rank Card, Meme",
  },
  {
    id: "random",
    name: "Random",
    tagline: "Hiburan & keacakan",
    description: "Gambar acak (anime, pemandangan, wallpaper, hewan, meme) plus kutipan, fakta, jokes, pantun, gombalan, truth or dare, dadu, dan pemilih acak.",
    seoTitle: "REST API Random: Gambar Anime, Pemandangan, Quotes, Pantun",
  },
  {
    id: "search",
    name: "Search",
    tagline: "Cari di banyak situs",
    description: "Pencarian Pinterest, Lahelu, MCPEDL, CNN Indonesia, YouTube, MyAnimeList, Steam, wallpaper, GitHub, npm, dan web dalam format JSON yang rapi.",
    seoTitle: "REST API Search: Pinterest, Lahelu, MCPEDL, CNN, YouTube",
  },
  {
    id: "downloader",
    name: "Downloader",
    tagline: "Ambil link media langsung",
    description: "All-in-one downloader: TikTok, Facebook, Instagram, Twitter/X, Pinterest, MediaFire, Google Drive, dan GitHub. Hasil berupa link unduhan langsung.",
    seoTitle: "REST API Downloader: AIO, TikTok, Facebook, Instagram, MediaFire",
  },
  {
    id: "games",
    name: "Games",
    tagline: "Kuis & game untuk bot WA",
    description: "Game siap pakai untuk bot WhatsApp (Baileys): Akinator, tebak kata, asah otak, Cak Lontong, family 100, tebak gambar, tebak bendera, kuis matematika, suit, dan tic-tac-toe. Semua tanpa sesi di server, jadi cukup satu permintaan GET.",
    seoTitle: "REST API Games: Akinator, Tebak Kata, Family 100 untuk Bot WA",
  },
  {
    id: "islami",
    name: "Islami",
    tagline: "Al-Qur'an & waktu sholat",
    description: "Data Al-Qur'an lengkap dengan terjemahan Indonesia, jadwal sholat, dan Asmaul Husna.",
    seoTitle: "REST API Islami: Al-Qur'an, Jadwal Sholat, Asmaul Husna",
  },
  {
    id: "info",
    name: "Informasi",
    tagline: "Data real-time dunia nyata",
    description: "Cuaca, gempa BMKG, kurs, harga kripto, Wikipedia, GitHub, NPM, hari libur, lirik, dan kamus.",
    seoTitle: "REST API Info: Cuaca, Gempa BMKG, Kurs, Kripto, Wikipedia",
  },
  {
    id: "komik",
    name: "Komik",
    tagline: "Scraper Komiku",
    description: "Scraper komiku.org: komik terbaru & populer, pencarian, metadata lengkap, daftar chapter, dan gambar tiap halaman chapter.",
    seoTitle: "REST API Komik: Scraper Komiku Manga, Manhwa, Manhua",
  },
  {
    id: "anime",
    name: "Anime",
    tagline: "Scraper Animekuindo",
    description: "Scraper anime-kuindo.com: episode terbaru, pencarian, metadata anime, daftar episode, dan link player video siap pasang di iframe.",
    seoTitle: "REST API Anime: Scraper Animekuindo, Link Player & Embed",
  },
  {
    id: "film",
    name: "Film",
    tagline: "Sankanime, LK21 & player",
    description: "Data film dan serial dari Sankanime Movies: pencarian, trending, detail lengkap dengan pemeran, daftar episode, player video siap pasang, link stream dan unduhan. Ditambah scraper LK21 (Layarkaca21) untuk beranda, daftar, genre, detail, dan pemeran.",
    seoTitle: "REST API Film: Sankanime & LK21, Player Video, Detail & Pemeran",
  },
];

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c])) as Record<CategoryId, Category>;
