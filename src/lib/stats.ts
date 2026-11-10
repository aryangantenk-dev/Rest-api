import { after } from "next/server";
import { getStore, type Stats } from "@/db/store";

const EMPTY: Stats = { totalRequests: 0, top: [] };

/**
 * Statistik tidak boleh mengganggu atau memperlambat respons API, jadi dicatat
 * setelah respons terkirim. `after` menjaga fungsi serverless tetap hidup sampai
 * pencatatan selesai (tanpa itu permintaannya bisa terputus di Vercel).
 */
export function recordHit(path: string) {
  const store = getStore();
  if (!store) return;
  const task = () =>
    store.recordHit(path).catch(() => {
      /* diabaikan */
    });
  try {
    after(task);
  } catch {
    void task();
  }
}

export async function getStats(): Promise<Stats> {
  try {
    return (await getStore()?.getStats()) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
