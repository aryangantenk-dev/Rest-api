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
    id: "random",
    name: "Random",
    tagline: "Hiburan & keacakan",
    description: "Kutipan, fakta, jokes, pantun, gombalan, truth or dare, lempar dadu, dan pemilih acak.",
    seoTitle: "REST API Random: Quotes, Pantun, Jokes, Dadu, Truth or Dare",
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
];

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c])) as Record<CategoryId, Category>;
