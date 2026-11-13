import { desc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./index";
import { apiStats, bannedIps, shortLinks } from "./schema";

/**
 * Penyimpanan untuk statistik pemakaian dan pemendek URL. Dua backend didukung:
 *
 *  1. Supabase lewat REST (HTTPS) — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *     Paling cocok untuk serverless (Vercel/Netlify): tanpa koneksi Postgres/pool.
 *     Tabel & fungsi dibuat sekali dengan supabase/schema.sql.
 *  2. PostgreSQL langsung — set DATABASE_URL. Tabel dibuat otomatis.
 *
 * Tanpa keduanya `getStore()` mengembalikan null dan fitur terkait dinonaktifkan.
 */
export type Stats = { totalRequests: number; top: { path: string; hits: number }[] };

export interface Store {
  kind: "supabase" | "postgres";
  /** Melempar error bila penyimpanan tidak bisa dihubungi. */
  ping(): Promise<void>;
  recordHit(path: string): Promise<void>;
  getStats(): Promise<Stats>;
  /** Mengembalikan kode milik `url` (membuatnya dengan `code` bila belum ada), atau null bila `code` sudah dipakai. */
  shorten(url: string, code: string): Promise<{ code: string; hits: number } | null>;
  /** Mengembalikan URL tujuan dan menambah hitungan klik, atau null bila kode tidak dikenal. */
  resolve(code: string): Promise<string | null>;
  /** Daftar IP yang diblokir. */
  listBans(): Promise<Ban[]>;
  banIp(ip: string, reason: string): Promise<void>;
  unbanIp(ip: string): Promise<void>;
}

export type Ban = { ip: string; reason: string; created_at: string | null };

/* ---------- Supabase (PostgREST) ---------- */

const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

function supabaseStore(): Store {
  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}`, "content-type": "application/json" },
        body: JSON.stringify(args),
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Supabase ${fn} gagal (${res.status})`);
      const body = await res.text();
      return (body ? JSON.parse(body) : null) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async function table<T>(method: string, query: string, body?: unknown, prefer?: string): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
        method,
        headers: {
          apikey: supabaseKey,
          authorization: `Bearer ${supabaseKey}`,
          "content-type": "application/json",
          ...(prefer ? { prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Supabase ${method} ${query.split("?")[0]} gagal (${res.status})`);
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    kind: "supabase",
    listBans: async () => (await table<Ban[] | null>("GET", "banned_ips?select=ip,reason,created_at&order=created_at.desc&limit=5000")) ?? [],
    async banIp(ip, reason) {
      await table("POST", "banned_ips?on_conflict=ip", { ip, reason: reason.slice(0, 300) }, "resolution=merge-duplicates,return=minimal");
    },
    async unbanIp(ip) {
      await table("DELETE", `banned_ips?ip=eq.${encodeURIComponent(ip)}`, undefined, "return=minimal");
    },
    async ping() {
      await rpc("api_stats_summary");
    },
    async recordHit(path) {
      await rpc("record_api_hit", { p_path: path });
    },
    async getStats() {
      const s = await rpc<Stats | null>("api_stats_summary");
      return { totalRequests: Number(s?.totalRequests ?? 0), top: s?.top ?? [] };
    },
    shorten: (url, code) => rpc<{ code: string; hits: number } | null>("shorten_url", { p_url: url, p_code: code }),
    resolve: (code) => rpc<string | null>("resolve_short_link", { p_code: code }),
  };
}

/* ---------- PostgreSQL langsung (Drizzle) ---------- */

function postgresStore(): Store {
  const db = async () => {
    const d = await getDb();
    if (!d) throw new Error("DATABASE_URL belum diatur");
    return d;
  };
  return {
    kind: "postgres",
    async listBans() {
      const rows = await (await db()).select().from(bannedIps).orderBy(desc(bannedIps.createdAt)).limit(5000);
      return rows.map((r) => ({ ip: r.ip, reason: r.reason, created_at: r.createdAt?.toISOString() ?? null }));
    },
    async banIp(ip, reason) {
      await (await db())
        .insert(bannedIps)
        .values({ ip, reason: reason.slice(0, 300) })
        .onConflictDoUpdate({ target: bannedIps.ip, set: { reason: reason.slice(0, 300) } });
    },
    async unbanIp(ip) {
      await (await db()).delete(bannedIps).where(eq(bannedIps.ip, ip));
    },
    async ping() {
      await (await db()).execute(sql`select 1`);
    },
    async recordHit(path) {
      await (await db())
        .insert(apiStats)
        .values({ path, hits: 1 })
        .onConflictDoUpdate({ target: apiStats.path, set: { hits: sql`${apiStats.hits} + 1`, updatedAt: new Date() } });
    },
    async getStats() {
      const d = await db();
      const [total] = await d.select({ total: sql<number>`coalesce(sum(${apiStats.hits}), 0)::int` }).from(apiStats);
      const top = await d.select({ path: apiStats.path, hits: apiStats.hits }).from(apiStats).orderBy(desc(apiStats.hits)).limit(5);
      return { totalRequests: total?.total ?? 0, top };
    },
    async shorten(url, code) {
      const d = await db();
      const [existing] = await d.select().from(shortLinks).where(eq(shortLinks.url, url)).limit(1);
      if (existing) return { code: existing.code, hits: existing.hits };
      const created = await d.insert(shortLinks).values({ code, url }).onConflictDoNothing().returning({ code: shortLinks.code });
      return created.length ? { code, hits: 0 } : null;
    },
    async resolve(code) {
      const d = await db();
      const [row] = await d
        .update(shortLinks)
        .set({ hits: sql`${shortLinks.hits} + 1` })
        .where(eq(shortLinks.code, code))
        .returning({ url: shortLinks.url });
      return row?.url ?? null;
    },
  };
}

let store: Store | null | undefined;

export function getStore(): Store | null {
  if (store === undefined) {
    store = supabaseUrl && supabaseKey ? supabaseStore() : hasDatabase ? postgresStore() : null;
  }
  return store;
}
