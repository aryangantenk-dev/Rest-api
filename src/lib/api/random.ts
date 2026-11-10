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
