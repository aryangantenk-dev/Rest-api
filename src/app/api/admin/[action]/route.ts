import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminBan, adminListBans, adminUnban } from "@/lib/guard";
import { viaProxy, sankaDecode } from "@/lib/api/filmproxy"; // TEMP-PROBE
import { load } from "cheerio"; // TEMP-PROBE

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint khusus owner untuk mengelola blokir IP.
 *   /api/admin/bans?key=ADMIN_KEY               daftar IP yang diblokir
 *   /api/admin/unban?ip=1.2.3.4&key=ADMIN_KEY   buka blokir
 *   /api/admin/ban?ip=1.2.3.4&reason=..&key=..  blokir manual
 * Kunci juga boleh dikirim lewat header `x-admin-key`.
 */
const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json({ status: status < 400, code: status, creator: "Yanxz", ...body }, { status, headers: { "cache-control": "no-store" } });

function authorized(given: string) {
  const key = (process.env.ADMIN_KEY || "").trim();
  if (!key) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const ok = authorized(sp.get("key") || req.headers.get("x-admin-key") || "");
  if (ok === null) return json(503, { error: "ADMIN_KEY belum diatur di environment variable server." });
  if (!ok) return json(401, { error: "Kunci admin salah." });

  try {
    if (action === "bans") {
      const bans = await adminListBans();
      return json(200, { result: { total: bans.length, bans } });
    }
    // TEMP-PROBE-START (sementara: lihat halaman sumber lewat film-proxy; dihapus setelah scraper selesai)
    if (action === "probe") {
      if (sp.get("health")) {
        try {
          const h = await fetch(`${(process.env.FILM_PROXY_URL || "").replace(/\/+$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          return json(200, { result: { status: h.status, body: (await h.text()).slice(0, 100) } });
        } catch (e) {
          return json(200, { result: { fetchError: String((e as Error)?.cause ?? e) } });
        }
      }
      const sanka = sp.get("sanka");
      if (sanka) {
        // Bentuk (skeleton) jawaban backend SankaMovies; via=proxy untuk lewat VPS.
        const u = `https://www.sankavollerei.web.id/plananimek/movie${sanka}`;
        const hdr = { accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", referer: "https://sankanime.web.id/", origin: "https://sankanime.web.id" };
        let status = 0, body = "";
        try {
          if (sp.get("via") === "proxy") {
            const pr = await viaProxy(u, { accept: hdr.accept, referer: hdr.referer, origin: true });
            status = pr.status; body = pr.text;
          } else {
            const fr = await fetch(u, { headers: hdr, cache: "no-store", signal: AbortSignal.timeout(20000) });
            status = fr.status; body = await fr.text();
          }
        } catch (e) {
          return json(200, { result: { fetchError: String((e as Error)?.cause ?? (e as Error)?.message ?? e) } });
        }
        let data: unknown;
        try { data = sankaDecode(body); } catch { return json(200, { result: { status, raw: body.slice(0, 600).replace(/</g, "[[") } }); }
        const sl = Number(sp.get("sl") || 70);
        const al = Number(sp.get("al") || 1);
        const shape = (v: unknown, d: number): unknown => {
          if (typeof v === "string") return v.length > sl ? v.slice(0, sl) + `…(${v.length})` : v;
          if (Array.isArray(v)) return v.length ? [...v.slice(0, al).map((x) => shape(x, d + 1)), `…len=${v.length}`] : [];
          if (v && typeof v === "object") return d > 7 ? "{…}" : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, d + 1)]));
          return v;
        };
        return json(200, { result: { status, length: body.length, shape: shape(data, 0) } });
      }
      let r;
      try {
        r = await viaProxy(sp.get("url") || "", { accept: sp.get("accept") || undefined, referer: sp.get("referer") || undefined, origin: !!sp.get("origin"), xhr: !!sp.get("xhr") });
      } catch (e) {
        return json(200, { result: { proxyError: (e as Error).message } });
      }
      const text = r.text;
      const deob = sp.get("deob");
      if (deob) {
        // Dekode string-array (base64 alfabet terbalik + RC4) tanpa menjalankan kode situs.
        const m = new RegExp(`function ${deob.replace(/[^\w$]/g, "")}\\(\\)\\{(?:const|var|let) [\\w$]+=\\[([^\\]]*)\\]`).exec(text);
        if (!m) return json(200, { result: { error: "array tidak ditemukan" } });
        const arr = [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]);
        const AB = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/";
        const b64 = (str: string) => {
          const bytes: number[] = [];
          let bs = 0, bc = 0;
          for (const ch of str) {
            const v = AB.indexOf(ch);
            if (v < 0) continue;
            bs = bc % 4 ? bs * 64 + v : v;
            if (bc++ % 4) bytes.push(255 & (bs >> ((-2 * bc) & 6)));
          }
          return Buffer.from(bytes).toString("utf8");
        };
        const rc4 = (enc: string, key: string) => {
          const str = b64(enc);
          const S = Array.from({ length: 256 }, (_, i) => i);
          let j = 0;
          for (let i = 0; i < 256; i++) { j = (j + S[i] + key.charCodeAt(i % key.length)) % 256; [S[i], S[j]] = [S[j], S[i]]; }
          let i = 0; j = 0; let out = "";
          for (let y = 0; y < str.length; y++) {
            i = (i + 1) % 256; j = (j + S[i]) % 256; [S[i], S[j]] = [S[j], S[i]];
            out += String.fromCharCode(str.charCodeAt(y) ^ S[(S[i] + S[j]) % 256]);
          }
          return out;
        };
        const ok = new RegExp(sp.get("ok") || "^[A-Za-z0-9+/=]{2,24}$");
        const lines = (sp.get("pieces") || "").split("~").filter(Boolean).map((pc) => {
          const k = pc.indexOf(":");
          const n = Number(pc.slice(0, k));
          const key = pc.slice(k + 1);
          const c = arr.map((e, idx) => ({ idx, t: rc4(e, key) })).filter((x) => ok.test(x.t));
          return `${n} ${key} => ${c.map((x) => `[${x.idx} d=${x.idx - n}] ${x.t}`).join(" | ")}`;
        });
        return json(200, { result: { n: arr.length, lines } });
      }
      const mode = sp.get("mode");
      if (mode) {
        const $ = load(text);
        const lim = Math.min(Number(sp.get("len") || 12000), 60000);
        const max = Number(sp.get("max") || 40);
        let out = "";
        if (mode === "scripts") {
          const n = Number(sp.get("n") || 300);
          out = $("script").toArray().map((el) => {
            const src = $(el).attr("src");
            const t = $(el).attr("type") || "";
            const id = $(el).attr("id") || "";
            return src ? `SRC ${src}` : `INLINE[${t}#${id}] (${$(el).text().length}) ${$(el).text().slice(0, n)}`;
          }).join("\n");
          out += "\nLINKS " + $("link[rel=preload],link[rel=modulepreload]").toArray().map((el) => $(el).attr("href")).join(" ");
        } else {
          $("script,style,svg,noscript,link,meta:not([itemprop])").remove();
          const root = $(sp.get("sel") || "body");
          if (mode === "html") {
            out = root.toArray().slice(0, max).map((el) => ($.html(el) || "").replace(/\s+/g, " ")).join("\n@@@\n");
          } else if (mode === "count") {
            out = String(root.length);
          } else {
            const depthMax = Number(sp.get("depth") || 12);
            const rep = Number(sp.get("rep") || 2);
            const tl = Number(sp.get("tl") || 50);
            const lines: string[] = [];
            const walk = (el: Parameters<typeof $>[0], d: number) => {
              const e = $(el as never);
              const node = e.get(0) as unknown as { tagName?: string; attribs?: Record<string, string> };
              const attrs = node.attribs || {};
              const sig = `${node.tagName}${attrs.id ? "#" + attrs.id : ""}${attrs.class ? "." + attrs.class.trim().split(/\s+/).join(".") : ""}`;
              const extra = Object.entries(attrs).filter(([k]) => k !== "class" && k !== "id" && k !== "style").map(([k, v]) => `${k}=${String(v).slice(0, 70)}`).join(" ");
              const own = e.contents().toArray().filter((c) => (c as { type?: string }).type === "text").map((c) => $(c).text()).join(" ").replace(/\s+/g, " ").trim().slice(0, tl);
              lines.push(`${" ".repeat(d)}${sig}${extra ? " {" + extra + "}" : ""}${own ? ' "' + own + '"' : ""}`);
              if (d >= depthMax) return;
              const seen: Record<string, number> = {};
              for (const c of e.children().toArray()) {
                const ca = (c as unknown as { tagName?: string; attribs?: Record<string, string> });
                const k = `${ca.tagName}.${ca.attribs?.class || ""}`;
                seen[k] = (seen[k] || 0) + 1;
                if (seen[k] <= rep) walk(c as never, d + 1);
              }
              for (const [k, n] of Object.entries(seen)) if (n > rep) lines.push(`${" ".repeat(d + 1)}… ${k} x${n}`);
            };
            root.toArray().slice(0, max).forEach((el) => walk(el as never, 0));
            out = lines.join("\n");
          }
        }
        out = out.slice(Number(sp.get("off") || 0)).slice(0, lim).replace(/</g, "[[").replace(/>/g, "]]");
        return json(200, { result: { status: r.status, final: r.finalUrl, type: r.type, length: text.length, body: out } });
      }
      const off = Number(sp.get("off") || 0);
      const len = Math.min(Number(sp.get("len") || 3000), 60000);
      const pad = Number(sp.get("pad") || 0);
      const padAfter = sp.get("after") === null ? pad : Number(sp.get("after"));
      const find = sp.get("find");
      let body = text.slice(off, off + len);
      if (find) {
        const re = new RegExp(find, "g");
        const hits = [...text.matchAll(re)].map((m) => text.slice(Math.max(0, m.index - pad), m.index + m[0].length + padAfter));
        body = (sp.get("uniq") ? [...new Set(hits)] : hits).slice(0, Number(sp.get("max") || 40)).join("\n@@@\n");
      }
      if (sp.get("squash")) body = body.replace(/\s+/g, " ");
      body = body.replace(/</g, "[[").replace(/>/g, "]]");
      return json(200, { result: { status: r.status, final: r.finalUrl, type: r.type, length: text.length, body } });
    }
    // TEMP-PROBE-END
    const ip = (sp.get("ip") || "").trim().toLowerCase();
    if (action === "unban" || action === "ban") {
      if (!/^[0-9a-f:.]{3,45}$/.test(ip)) return json(400, { error: "Parameter 'ip' wajib diisi dengan alamat IP yang valid." });
      if (action === "unban") {
        await adminUnban(ip);
        return json(200, { result: { ip, banned: false, message: "Blokir dibuka. Berlaku penuh di semua server dalam ±30 detik." } });
      }
      const reason = (sp.get("reason") || "Diblokir manual oleh owner").slice(0, 300);
      await adminBan(ip, reason);
      return json(200, { result: { ip, banned: true, reason } });
    }
    return json(404, { error: "Aksi tidak dikenal. Gunakan: bans, ban, unban." });
  } catch (e) {
    console.error("[api/admin]", e);
    return json(502, { error: "Gagal menghubungi database." });
  }
}
