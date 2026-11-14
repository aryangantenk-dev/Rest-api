/*
  Pembatas sederhana di memori (per instance server) untuk rute login. Ini lapisan pertama;
  batas yang berlaku di semua instance ada di database (fungsi auth_otp_issue / auth_otp_check).
*/
type Slot = { count: number; reset: number };
const g = globalThis as typeof globalThis & { __yanzAuthLimit?: Map<string, Slot> };
const slots = (g.__yanzAuthLimit ??= new Map());

/** Mengembalikan 0 bila masih boleh, atau jumlah detik sampai boleh mencoba lagi. */
export function hit(bucket: string, id: string, max: number, windowMs: number): number {
  const now = Date.now();
  if (slots.size > 10_000) for (const [k, v] of slots) if (v.reset <= now) slots.delete(k);
  const key = `${bucket}:${id}`;
  let slot = slots.get(key);
  if (!slot || slot.reset <= now) {
    slot = { count: 0, reset: now + windowMs };
    slots.set(key, slot);
  }
  slot.count++;
  return slot.count > max ? Math.max(1, Math.ceil((slot.reset - now) / 1000)) : 0;
}
