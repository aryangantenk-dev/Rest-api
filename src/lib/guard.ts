import { after } from "next/server";
import { getStore } from "@/db/store";
import { RATE_LIMIT } from "@/lib/limits";

/**
 * Pelindung API: batas permintaan per IP + blokir (ban) untuk pelanggar berulang.
 *
 *  - Maksimal RATE_LIMIT_PER_MIN (default 45) permintaan per menit per IP.
 *  - Melewati batas = HTTP 429 dan 1 pelanggaran.
 *  - BAN_AFTER_STRIKES (default 3) pelanggaran dalam 10 menit, atau banjir
 *    permintaan (> 4x batas dalam 1 menit) = IP diblokir permanen.
 *  - Blokir disimpan di database (Supabase/Postgres) sehingga berlaku di semua
 *    instance serverless. Tanpa database, blokir hanya hidup di memori instance.
 *  - Membuka blokir: /api/admin/unban?ip=...&key=ADMIN_KEY (hanya owner).
 */
const envInt = (name: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};

export { RATE_LIMIT };
export const BAN_AFTER_STRIKES = envInt("BAN_AFTER_STRIKES", 3, 1, 1000);
export const OWNER_WA = (process.env.OWNER_WHATSAPP || "62895403334081").replace(/\D/g, "");
export const APPEAL_URL = `https://wa.me/${OWNER_WA}`;

const WINDOW_MS = 60_000;
const STRIKE_TTL_MS = 10 * 60_000;
const FLOOD_FACTOR = 4;
const BAN_REFRESH_MS = 30_000;

type Bucket = { count: number; reset: number; struck: boolean };
type Strike = { n: number; exp: number };
type State = {
  buckets: Map<string, Bucket>;
  strikes: Map<string, Strike>;
  bans: Map<string, string>;
  loadedAt: number;
  loading: Promise<void> | null;
};

const g = globalThis as typeof globalThis & { __yanxzGuard?: State };
const state: State = (g.__yanxzGuard ??= { buckets: new Map(), strikes: new Map(), bans: new Map(), loadedAt: 0, loading: null });

export function clientIp(req: Request): string {
  const h = req.headers;
  const raw =
    h.get("x-real-ip") ||
    h.get("x-vercel-forwarded-for")?.split(",")[0] ||
    h.get("x-nf-client-connection-ip") ||
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0] ||
    "";
  const ip = raw.trim().toLowerCase().replace(/^::ffff:/, "");
  return /^[0-9a-f:.]{3,45}$/.test(ip) ? ip : "anon";
}

/** IP yang tidak pernah diblokir (tidak dikenal / jaringan lokal). */
function unbannable(ip: string) {
  return ip === "anon" || ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

function refreshBans(): Promise<void> {
  const store = getStore();
  if (!store) return Promise.resolve();
  state.loading ??= store
    .listBans()
    .then((rows) => {
      const next = new Map(rows.map((r) => [r.ip, r.reason] as const));
      // Blokir lokal yang belum sempat tersimpan tetap dipertahankan sebentar.
      state.bans = next;
      state.loadedAt = Date.now();
    })
    .catch(() => {
      /* database tidak bisa dihubungi: pakai data terakhir */
      state.loadedAt = Date.now() - BAN_REFRESH_MS / 2;
    })
    .finally(() => {
      state.loading = null;
    });
  return state.loading;
}

async function ensureBans() {
  const age = Date.now() - state.loadedAt;
  if (state.loadedAt === 0) {
    await refreshBans();
  } else if (age > BAN_REFRESH_MS && !state.loading) {
    const task = () => refreshBans();
    try {
      after(task);
    } catch {
      void task();
    }
  }
}

function persistBan(ip: string, reason: string) {
  state.bans.set(ip, reason);
  const store = getStore();
  if (!store) return;
  const task = () => store.banIp(ip, reason).catch(() => {});
  try {
    after(task);
  } catch {
    void task();
  }
}

export type Verdict =
  | { kind: "ok"; headers: Record<string, string> }
  | { kind: "limited"; headers: Record<string, string>; strikes: number; retryAfter: number }
  | { kind: "banned"; headers: Record<string, string>; reason: string };

export async function guard(ip: string): Promise<Verdict> {
  await ensureBans();
  const banned = state.bans.get(ip);
  if (banned !== undefined) return { kind: "banned", headers: { "x-banned": "1" }, reason: banned };

  const now = Date.now();
  if (state.buckets.size > 5000) {
    for (const [k, v] of state.buckets) if (v.reset < now) state.buckets.delete(k);
    for (const [k, v] of state.strikes) if (v.exp < now) state.strikes.delete(k);
  }
  let b = state.buckets.get(ip);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + WINDOW_MS, struck: false };
    state.buckets.set(ip, b);
  }
  b.count++;
  const retryAfter = Math.max(1, Math.ceil((b.reset - now) / 1000));
  const headers = {
    "x-ratelimit-limit": String(RATE_LIMIT),
    "x-ratelimit-remaining": String(Math.max(0, RATE_LIMIT - b.count)),
    "x-ratelimit-reset": String(retryAfter),
  };
  if (b.count <= RATE_LIMIT) return { kind: "ok", headers };

  headers["retry-after" as keyof typeof headers] = String(retryAfter);
  let s = state.strikes.get(ip);
  if (!s || s.exp < now) s = { n: 0, exp: now + STRIKE_TTL_MS };
  if (!b.struck) {
    b.struck = true;
    s.n++;
    s.exp = now + STRIKE_TTL_MS;
    state.strikes.set(ip, s);
  }
  const flood = b.count > RATE_LIMIT * FLOOD_FACTOR;
  if (!unbannable(ip) && (s.n >= BAN_AFTER_STRIKES || flood)) {
    const reason = flood
      ? `Banjir permintaan: lebih dari ${RATE_LIMIT * FLOOD_FACTOR} permintaan dalam 1 menit`
      : `Melewati batas ${RATE_LIMIT} permintaan/menit sebanyak ${s.n} kali dalam 10 menit`;
    persistBan(ip, reason);
    state.strikes.delete(ip);
    return { kind: "banned", headers: { "x-banned": "1" }, reason };
  }
  return { kind: "limited", headers, strikes: s.n, retryAfter };
}

/* ---------- dipakai endpoint admin ---------- */

export async function adminBan(ip: string, reason: string) {
  state.bans.set(ip, reason);
  await getStore()?.banIp(ip, reason);
}

export async function adminUnban(ip: string) {
  state.bans.delete(ip);
  state.strikes.delete(ip);
  state.buckets.delete(ip);
  await getStore()?.unbanIp(ip);
}

export async function adminListBans() {
  const store = getStore();
  if (store) {
    const rows = await store.listBans();
    state.bans = new Map(rows.map((r) => [r.ip, r.reason] as const));
    state.loadedAt = Date.now();
    return rows;
  }
  return [...state.bans].map(([ip, reason]) => ({ ip, reason, created_at: null as string | null }));
}
