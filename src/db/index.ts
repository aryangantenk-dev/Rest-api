import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/**
 * Database bersifat OPSIONAL.
 *
 * Koneksi dibuat saat pertama kali dipakai (bukan saat modul di-import), sehingga
 * `next build` di Vercel/Netlify tidak gagal ketika DATABASE_URL belum diatur.
 * Tanpa database, seluruh situs & endpoint tetap jalan; hanya statistik dan
 * pemendek URL yang nonaktif.
 */
const databaseUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();

export const hasDatabase = databaseUrl.length > 0;

/** Tabel dibuat otomatis agar deploy ke database baru tidak butuh langkah migrasi manual. */
const SCHEMA_SQL = `
  create table if not exists api_stats (
    path varchar(120) primary key,
    hits integer not null default 0,
    updated_at timestamp not null default now()
  );
  create table if not exists short_links (
    id serial primary key,
    code varchar(16) not null unique,
    url text not null,
    hits integer not null default 0,
    created_at timestamp not null default now()
  );
`;

function poolConfig(raw: string): PoolConfig {
  const base: PoolConfig = { max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ...base, connectionString: raw };
  }
  // `sslmode` di connection string menimpa opsi `ssl` milik pg dan memaksa verifikasi
  // sertifikat penuh, yang gagal di Postgres terkelola (Supabase, Neon, dll.) karena
  // CA-nya tidak ada di trust store Node. Jadi kita atur SSL secara eksplisit.
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  // Hostname kosong = koneksi lewat unix socket.
  const local = !url.hostname || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  const ssl = sslmode === "disable" || (local && !sslmode) ? false : { rejectUnauthorized: sslmode === "verify-full" || sslmode === "verify-ca" };
  return { ...base, connectionString: url.toString(), ssl };
}

type DbState = { pool: Pool; ready: Promise<NodePgDatabase> | null };

const globalForDb = globalThis as typeof globalThis & { __yanxzDb?: DbState };

/**
 * Mengembalikan instance Drizzle, atau `null` bila database tidak dikonfigurasi.
 * Melempar error bila database dikonfigurasi tetapi tidak bisa dihubungi.
 */
export async function getDb(): Promise<NodePgDatabase | null> {
  if (!hasDatabase) return null;

  let state = globalForDb.__yanxzDb;
  if (!state) {
    const pool = new Pool(poolConfig(databaseUrl));
    // Koneksi idle yang diputus server tidak boleh menjatuhkan proses.
    pool.on("error", () => {});
    state = globalForDb.__yanxzDb = { pool, ready: null };
  }

  if (!state.ready) {
    const { pool } = state;
    state.ready = pool.query(SCHEMA_SQL).then(() => drizzle(pool));
    // Jika gagal (mis. database sedang mati), coba lagi pada permintaan berikutnya.
    state.ready.catch(() => {
      if (globalForDb.__yanxzDb) globalForDb.__yanxzDb.ready = null;
    });
  }
  return state.ready;
}
