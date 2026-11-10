import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiStats } from "@/db/schema";

type Stats = { totalRequests: number; top: { path: string; hits: number }[] };

const EMPTY: Stats = { totalRequests: 0, top: [] };

/** Fire-and-forget: statistik tidak boleh mengganggu atau memperlambat respons API. */
export function recordHit(path: string) {
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db
        .insert(apiStats)
        .values({ path, hits: 1 })
        .onConflictDoUpdate({ target: apiStats.path, set: { hits: sql`${apiStats.hits} + 1`, updatedAt: new Date() } });
    } catch {
      /* diabaikan */
    }
  })();
}

export async function getStats(): Promise<Stats> {
  try {
    const db = await getDb();
    if (!db) return EMPTY;
    const [total] = await db.select({ total: sql<number>`coalesce(sum(${apiStats.hits}), 0)::int` }).from(apiStats);
    const top = await db.select({ path: apiStats.path, hits: apiStats.hits }).from(apiStats).orderBy(desc(apiStats.hits)).limit(5);
    return { totalRequests: total?.total ?? 0, top };
  } catch {
    return EMPTY;
  }
}
