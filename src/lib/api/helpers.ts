import { HttpError } from "./types";

export function need(sp: URLSearchParams, name: string, max = 4000): string {
  const v = sp.get(name)?.trim();
  if (!v) throw new HttpError(400, `Parameter '${name}' wajib diisi.`);
  if (v.length > max) throw new HttpError(400, `Parameter '${name}' terlalu panjang (maks ${max} karakter).`);
  return v;
}

export function opt(sp: URLSearchParams, name: string, fallback = ""): string {
  return sp.get(name)?.trim() || fallback;
}

export function num(sp: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = sp.get(name);
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new HttpError(400, `Parameter '${name}' harus berupa angka.`);
  return Math.min(max, Math.max(min, n));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const res = await fetchRaw(url, init, timeoutMs);
  try {
    return (await res.json()) as T;
  } catch {
    throw new HttpError(502, "Server sumber mengirim respons yang tidak valid.");
  }
}

export async function fetchText(url: string, init?: RequestInit, timeoutMs = 25000): Promise<string> {
  const res = await fetchRaw(url, init, timeoutMs);
  return res.text();
}

export async function fetchRaw(url: string, init?: RequestInit, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "user-agent": "YanxzAPI/1.0 (+https://github.com/yanxz)", ...(init?.headers ?? {}) },
    });
    if (res.status === 404) throw new HttpError(404, "Data tidak ditemukan di server sumber.");
    if (!res.ok) throw new HttpError(502, `Server sumber merespons dengan status ${res.status}.`);
    return res;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new HttpError(504, "Server sumber terlalu lama merespons.");
    throw new HttpError(502, "Gagal menghubungi server sumber.");
  } finally {
    clearTimeout(timer);
  }
}

export function binaryResponse(buf: ArrayBuffer | Uint8Array | Buffer, type: string, cache = "public, max-age=3600"): Response {
  const body = buf instanceof ArrayBuffer ? buf : new Uint8Array(buf as Uint8Array);
  return new Response(body as BodyInit, {
    headers: { "content-type": type, "cache-control": cache },
  });
}

export function normalizeHex(input: string, fallback: string): string {
  const v = input.replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v.split("").map((c) => c + c).join("").toLowerCase()}`;
  return fallback;
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (h.includes(":")) return true;
  return false;
}

export function parseHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HttpError(400, "URL tidak valid.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Hanya URL http/https yang didukung.");
  if (isPrivateHost(u.hostname)) throw new HttpError(400, "Host tidak diizinkan.");
  return u;
}
