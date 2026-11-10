import type { Endpoint } from "./types";
import { HttpError } from "./types";
import { need, num, opt } from "./helpers";
import { fancyFonts, loremWords, morseMap } from "./data";

const words = (s: string) => s.replace(/[_\-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().split(/\s+/).filter(Boolean);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

function toRoman(n: number): string {
  const t: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of t) while (n >= v) { out += s; n -= v; }
  return out;
}
function fromRoman(s: string): number {
  const m: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const a = m[s[i]], b = m[s[i + 1]];
    total += b && a < b ? -a : a;
  }
  return total;
}

function stylize(text: string, font: (typeof fancyFonts)[string]): string {
  return Array.from(text).map((ch) => {
    if (font.map?.[ch]) return font.map[ch];
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) return String.fromCodePoint(font.upper + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(font.lower + c - 97);
    if (font.digit && c >= 48 && c <= 57) return String.fromCodePoint(font.digit + c - 48);
    return ch;
  }).join("");
}

const reverseMorse = Object.fromEntries(Object.entries(morseMap).map(([k, v]) => [v, k]));

export const textEndpoints: Endpoint[] = [
  {
    category: "text", slug: "case", kind: "json",
    title: "Konversi Huruf",
    description: "Ubah teks menjadi UPPER, lower, Title Case, camelCase, snake_case, kebab-case, dan lainnya sekaligus.",
    params: [{ name: "text", required: true, description: "Teks input.", example: "yanxz rest api gratis" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text");
      const w = words(text);
      return {
        upper: text.toUpperCase(), lower: text.toLowerCase(), title: w.map(cap).join(" "),
        sentence: cap(text.charAt(0)) .slice(0, 1) + text.slice(1).toLowerCase(),
        camel: w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join(""), pascal: w.map(cap).join(""),
        snake: w.map((x) => x.toLowerCase()).join("_"), kebab: w.map((x) => x.toLowerCase()).join("-"),
        constant: w.map((x) => x.toUpperCase()).join("_"),
      };
    },
  },
  {
    category: "text", slug: "slug", kind: "json",
    title: "Slug Generator",
    description: "Buat slug URL yang bersih dan ramah SEO dari judul apa pun, termasuk karakter beraksen.",
    params: [{ name: "text", required: true, description: "Judul atau kalimat.", example: "Panduan Lengkap REST API untuk Pemula!" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text");
      const slug = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " dan ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return { text, slug };
    },
  },
  {
    category: "text", slug: "count", kind: "json",
    title: "Penghitung Teks",
    description: "Hitung karakter, kata, kalimat, paragraf, dan estimasi waktu baca.",
    params: [{ name: "text", required: true, description: "Teks yang dianalisis.", example: "Halo dunia. Ini adalah contoh teks untuk dihitung." }],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 20000);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      return {
        characters: text.length, charactersNoSpaces: text.replace(/\s/g, "").length, words: wordCount,
        sentences: (text.match(/[^.!?]+[.!?]*/g) ?? []).filter((s) => s.trim()).length,
        paragraphs: text.split(/\n{2,}/).filter((s) => s.trim()).length,
        readingTimeSeconds: Math.ceil((wordCount / 220) * 60),
      };
    },
  },
  {
    category: "text", slug: "reverse", kind: "json",
    title: "Balik Teks",
    description: "Balik urutan karakter atau urutan kata, dan cek apakah teks itu palindrom.",
    params: [{ name: "text", required: true, description: "Teks input.", example: "katak" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text");
      const chars = Array.from(text);
      const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      return { text, reversed: chars.reverse().join(""), reversedWords: text.split(/\s+/).reverse().join(" "), isPalindrome: clean.length > 0 && clean === Array.from(clean).reverse().join("") };
    },
  },
  {
    category: "text", slug: "fancy", kind: "json",
    title: "Fancy Text",
    description: "Ubah teks biasa menjadi berbagai gaya huruf Unicode (bold, italic, script, fraktur, monospace, dll).",
    params: [{ name: "text", required: true, description: "Teks input (huruf latin).", example: "Yanxz API" }],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 300);
      return { text, styles: Object.fromEntries(Object.entries(fancyFonts).map(([k, f]) => [k, stylize(text, f)])) };
    },
  },
  {
    category: "text", slug: "morse", kind: "json",
    title: "Kode Morse",
    description: "Terjemahkan teks ke kode Morse atau sebaliknya.",
    params: [
      { name: "text", required: true, description: "Teks biasa atau kode morse (pisahkan huruf dengan spasi, kata dengan /).", example: "SOS Yanxz" },
      { name: "mode", description: "encode atau decode. Default: encode.", example: "encode" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 1000);
      const mode = opt(sp, "mode", "encode").toLowerCase();
      if (mode === "decode") {
        const out = text.split(/\s*\/\s*/).map((w) => w.split(/\s+/).map((c) => reverseMorse[c] ?? "?").join("")).join(" ");
        return { mode, input: text, output: out.toUpperCase() };
      }
      if (mode !== "encode") throw new HttpError(400, "mode harus 'encode' atau 'decode'.");
      const out = text.toLowerCase().split(/\s+/).map((w) => Array.from(w).map((c) => morseMap[c] ?? "").filter(Boolean).join(" ")).join(" / ");
      return { mode, input: text, output: out };
    },
  },
  {
    category: "text", slug: "binary", kind: "json",
    title: "Teks ⇄ Biner",
    description: "Konversi teks UTF-8 ke biner, heksadesimal, dan sebaliknya.",
    params: [
      { name: "text", required: true, description: "Teks biasa, atau deretan biner 8-bit bila mode decode.", example: "Yanxz" },
      { name: "mode", description: "encode atau decode. Default: encode.", example: "encode" },
    ],
    handler: async ({ sp }) => {
      const text = need(sp, "text", 2000);
      if (opt(sp, "mode", "encode") === "decode") {
        const bits = text.replace(/[^01]/g, "");
        if (!bits || bits.length % 8) throw new HttpError(400, "Biner harus kelipatan 8 bit.");
        const bytes = Uint8Array.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
        return { mode: "decode", input: text, output: new TextDecoder().decode(bytes) };
      }
      const bytes = Array.from(new TextEncoder().encode(text));
      return { mode: "encode", input: text, binary: bytes.map((b) => b.toString(2).padStart(8, "0")).join(" "), hex: bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ") };
    },
  },
  {
    category: "text", slug: "roman", kind: "json",
    title: "Angka Romawi",
    description: "Konversi angka (1–3999) ke angka Romawi dan sebaliknya.",
    params: [{ name: "value", required: true, description: "Angka biasa atau angka Romawi.", example: "2025" }],
    handler: async ({ sp }) => {
      const v = need(sp, "value", 20).toUpperCase();
      if (/^\d+$/.test(v)) {
        const n = Number(v);
        if (n < 1 || n > 3999) throw new HttpError(400, "Angka harus antara 1 dan 3999.");
        return { input: n, roman: toRoman(n) };
      }
      if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(v)) throw new HttpError(400, "Angka Romawi tidak valid.");
      return { input: v, number: fromRoman(v) };
    },
  },
  {
    category: "text", slug: "lorem", kind: "json",
    title: "Lorem Ipsum",
    description: "Buat teks placeholder dengan jumlah paragraf dan kata sesuai kebutuhan desainmu.",
    params: [
      { name: "paragraphs", description: "Jumlah paragraf (1–10). Default 3.", example: "3" },
      { name: "words", description: "Kata per paragraf (5–120). Default 40.", example: "40" },
    ],
    handler: async ({ sp }) => {
      const p = Math.round(num(sp, "paragraphs", 3, 1, 10));
      const w = Math.round(num(sp, "words", 40, 5, 120));
      const para = () => {
        const list = Array.from({ length: w }, () => loremWords[Math.floor(Math.random() * loremWords.length)]);
        const s = list.join(" ");
        return s.charAt(0).toUpperCase() + s.slice(1) + ".";
      };
      const paragraphs = Array.from({ length: p }, para);
      return { paragraphs, text: paragraphs.join("\n\n") };
    },
  },
];
