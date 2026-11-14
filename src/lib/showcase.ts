/**
 * Situs dan aplikasi yang memakai API ini, ditampilkan di beranda (bagian "Contoh").
 * Untuk menambah contoh baru cukup tambahkan satu entri di sini.
 */
export type ShowcaseSite = {
  name: string;
  /** Alamat lengkap yang dibuka tombol kunjungan. */
  url: string;
  /** Jenis situs, satu atau dua kata. */
  kind: string;
  tagline: string;
  description: string;
  /** Kategori dokumentasi yang paling relevan (id kategori). */
  category: string;
  /** Fitur di situs itu dan endpoint yang melayaninya, ditulis "kategori/slug". */
  uses: { feature: string; endpoints: string[] }[];
};

export const showcase: ShowcaseSite[] = [
  {
    name: "yukbaca",
    url: "https://www.yukbaca.biz.id/",
    kind: "Baca komik",
    tagline: "Rak baca komik harianmu",
    description:
      "Situs baca manga, manhwa, dan manhua: update chapter terbaru, peringkat harian, jelajah genre, sampai pembaca chapter. Seluruh datanya diambil dari kategori Komik.",
    category: "komik",
    uses: [
      { feature: "Update terbaru", endpoints: ["komik/latest"] },
      { feature: "Peringkat harian", endpoints: ["komik/populer"] },
      { feature: "Jelajah genre", endpoints: ["komik/genre", "komik/list"] },
      { feature: "Detail dan baca chapter", endpoints: ["komik/detail", "komik/chapter"] },
    ],
  },
];

/** Nama host tanpa "https://" dan garis miring penutup, untuk ditampilkan. */
export function showcaseHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
