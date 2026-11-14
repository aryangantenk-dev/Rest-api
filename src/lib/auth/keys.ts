import { randomInt } from "node:crypto";

/**
 * Bentuk API key: `yn-` diikuti 32 karakter acak, mis. `yn-7Kq2fXz9_Lm4RtHv3.pNc6Wd1J-b5YeQa0`.
 *
 * Isinya huruf besar, huruf kecil, angka, dan tepat tiga simbol (`_`, `.`, `-`, masing-masing
 * satu kali). Hanya tiga simbol itu yang dipakai karena aman ditulis apa adanya di dalam URL
 * (?apikey=...), di header, dan di terminal; simbol seperti # & + % $ akan merusak URL.
 * Simbol tidak pernah berada di ujung atau berdampingan, supaya key tidak terpotong saat
 * disalin dari chat.
 */
export const KEY_PREFIX = "yn-";
export const KEY_RE = /^yn-[0-9A-Za-z][0-9A-Za-z._-]{18,62}[0-9A-Za-z]$/;

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SYMBOLS = ["_", ".", "-"];
const BODY_LENGTH = 32;

export function newApiKey(): string {
  const body = Array.from({ length: BODY_LENGTH }, () => ALNUM[randomInt(ALNUM.length)]);
  const spots: number[] = [];
  while (spots.length < SYMBOLS.length) {
    const i = 3 + randomInt(BODY_LENGTH - 6);
    if (spots.every((s) => Math.abs(s - i) > 1)) spots.push(i);
  }
  // Urutan `spots` sudah acak, jadi simbol mana jatuh di posisi mana ikut acak.
  spots.forEach((at, n) => {
    body[at] = SYMBOLS[n];
  });
  return KEY_PREFIX + body.join("");
}

/** Samarkan API key untuk ditampilkan: `yn-7Kq2…Qa0`. */
export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 7)}…${key.slice(-4)}` : key;
}
