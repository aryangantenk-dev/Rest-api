/** Konstanta batas pemakaian yang aman diimpor dari mana saja (tanpa dependensi server). */
const n = Number(process.env.RATE_LIMIT_PER_MIN);
export const RATE_LIMIT = Number.isFinite(n) && n >= 1 && n <= 100000 ? Math.floor(n) : 45;
