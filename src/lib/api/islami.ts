import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { fetchJson, need, num, opt } from "./helpers";

type Ayah = { numberInSurah: number; text: string; juz?: number };
type SurahEdition = { number: number; name: string; englishName: string; englishNameTranslation: string; revelationType: string; numberOfAyahs: number; ayahs: Ayah[] };

export const islamiEndpoints: Endpoint[] = [
  {
    category: "islami", slug: "surah", kind: "json",
    title: "Al-Qur'an per Surah",
    description: "Teks Arab dan terjemahan Bahasa Indonesia untuk satu surah, bisa dipersempit ke rentang ayat.",
    params: [
      { name: "number", required: true, description: "Nomor surah (1–114).", example: "1" },
      { name: "ayah", description: "Nomor ayat tertentu. Opsional.", example: "" },
    ],
    handler: async ({ sp }) => {
      const n = Math.round(num(sp, "number", NaN, 1, 114));
      if (Number.isNaN(n)) throw new HttpError(400, "Parameter 'number' wajib diisi (1–114).");
      const d = await fetchJson<{ data: SurahEdition[] }>(`https://api.alquran.cloud/v1/surah/${n}/editions/quran-uthmani,id.indonesian`);
      const [ar, id] = d.data;
      let ayahs = ar.ayahs.map((a, i) => ({ number: a.numberInSurah, arabic: a.text, translation: id.ayahs[i].text, juz: a.juz }));
      const only = sp.get("ayah");
      if (only) {
        const a = ayahs.find((x) => x.number === Number(only));
        if (!a) throw new HttpError(404, "Ayat tidak ditemukan.");
        ayahs = [a];
      }
      return { number: ar.number, name: ar.name, latin: ar.englishName, meaning: ar.englishNameTranslation, revelation: ar.revelationType, totalAyahs: ar.numberOfAyahs, ayahs };
    },
  },
  {
    category: "islami", slug: "daftar-surah", kind: "json",
    title: "Daftar Surah",
    description: "Seluruh 114 surah beserta nama Arab, Latin, arti, jumlah ayat, dan tempat turunnya.",
    params: [],
    handler: async () => {
      const d = await fetchJson<{ data: { number: number; name: string; englishName: string; englishNameTranslation: string; numberOfAyahs: number; revelationType: string }[] }>("https://api.alquran.cloud/v1/surah");
      return d.data.map((s) => ({ number: s.number, name: s.name, latin: s.englishName, meaning: s.englishNameTranslation, totalAyahs: s.numberOfAyahs, revelation: s.revelationType }));
    },
  },
  {
    category: "islami", slug: "sholat", kind: "json",
    title: "Jadwal Sholat",
    description: "Jadwal waktu sholat harian untuk kota di Indonesia (metode Kemenag RI).",
    params: [
      { name: "kota", required: true, description: "Nama kota.", example: "Jakarta" },
      { name: "negara", description: "Nama negara. Default Indonesia.", example: "Indonesia" },
    ],
    handler: async ({ sp }) => {
      const kota = need(sp, "kota", 80);
      const negara = opt(sp, "negara", "Indonesia");
      const d = await fetchJson<{ code: number; data: { timings: Record<string, string>; date: { readable: string; hijri: { date: string; month: { en: string }; year: string } }; meta: { timezone: string } } }>(
        `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(kota)}&country=${encodeURIComponent(negara)}&method=20`,
      );
      if (d.code !== 200) throw new HttpError(404, "Kota tidak ditemukan.");
      const t = d.data.timings;
      return {
        city: kota, country: negara, date: d.data.date.readable, hijri: `${d.data.date.hijri.date} (${d.data.date.hijri.month.en} ${d.data.date.hijri.year})`, timezone: d.data.meta.timezone,
        timings: { imsak: t.Imsak, subuh: t.Fajr, terbit: t.Sunrise, dzuhur: t.Dhuhr, ashar: t.Asr, maghrib: t.Maghrib, isya: t.Isha },
      };
    },
  },
  {
    category: "islami", slug: "asmaul-husna", kind: "json",
    title: "Asmaul Husna",
    description: "99 nama Allah lengkap dengan tulisan Arab, transliterasi, dan arti.",
    params: [{ name: "number", description: "Nomor 1–99 untuk satu nama. Kosongkan untuk semua.", example: "" }],
    handler: async ({ sp }) => {
      const d = await fetchJson<{ data: { name: string; transliteration: string; number: number; en: { meaning: string } }[] }>("https://api.aladhan.com/v1/asmaAlHusna");
      const list = d.data.map((x) => ({ number: x.number, arabic: x.name, latin: x.transliteration, meaning: x.en.meaning }));
      const n = sp.get("number");
      if (n) {
        const item = list.find((x) => x.number === Number(n));
        if (!item) throw new HttpError(404, "Nomor harus antara 1 dan 99.");
        return item;
      }
      return list;
    },
  },
];
