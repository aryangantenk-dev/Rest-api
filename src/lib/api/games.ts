import crypto from "node:crypto";
import type { Endpoint, Param } from "./types";
import { HttpError } from "./types";
import { fetchRaw, need, opt } from "./helpers";
import { browserHeaders, clean } from "./scrape";

/* --------------------------------- Bank soal ---------------------------------- */

type Quiz = { soal: string; jawaban: string[]; deskripsi?: string | null; gambar?: string | null; extra?: Record<string, unknown> };
type Loader = () => Promise<Quiz[]>;
type Row = [string, string, string?];

const cache = new Map<string, Promise<Quiz[]>>();
function bank(id: string, load: Loader): Loader {
  return () => {
    let p = cache.get(id);
    if (!p) {
      p = load();
      cache.set(id, p);
    }
    return p;
  };
}

const rows = async (mod: Promise<{ default: unknown }>): Promise<Row[]> => (await mod).default as Row[];

type GameDef = { id: string; title: string; description: string; waktu: number; hadiah: number; load: Loader; multi?: boolean };

const GAMES: GameDef[] = [
  {
    id: "tebakkata", title: "Tebak Kata", waktu: 60, hadiah: 3000,
    description: "Tebak sebuah kata dari petunjuk singkat. Jawaban disertakan agar bot bisa mencocokkan sendiri.",
    load: bank("tebakkata", async () => (await rows(import("@/data/games/tebakkata.json"))).map(([soal, j]) => ({ soal, jawaban: [j] }))),
  },
  {
    id: "asahotak", title: "Asah Otak", waktu: 60, hadiah: 4000,
    description: "Pertanyaan pengetahuan umum singkat untuk mengasah otak.",
    load: bank("asahotak", async () => (await rows(import("@/data/games/asahotak.json"))).map(([soal, j]) => ({ soal, jawaban: [j] }))),
  },
  {
    id: "caklontong", title: "Cak Lontong", waktu: 60, hadiah: 5000,
    description: "Teka-teki sulit ala Cak Lontong, lengkap dengan penjelasan jawabannya.",
    load: bank("caklontong", async () => (await rows(import("@/data/games/caklontong.json"))).map(([soal, j, d]) => ({ soal, jawaban: [j], deskripsi: d || null }))),
  },
  {
    id: "siapakahaku", title: "Siapakah Aku", waktu: 60, hadiah: 3000,
    description: "Tebak benda, hewan, atau profesi dari deskripsi 'siapakah aku'.",
    load: bank("siapakahaku", async () => (await rows(import("@/data/games/siapakahaku.json"))).map(([soal, j]) => ({ soal, jawaban: [j] }))),
  },
  {
    id: "susunkata", title: "Susun Kata", waktu: 45, hadiah: 3000,
    description: "Susun huruf acak menjadi kata yang benar. Disertai petunjuk kategori.",
    load: bank("susunkata", async () => (await rows(import("@/data/games/susunkata.json"))).map(([soal, j, t]) => ({ soal, jawaban: [j], extra: { tipe: t || null } }))),
  },
  {
    id: "tebakkalimat", title: "Tebak Kalimat", waktu: 60, hadiah: 3000,
    description: "Lengkapi bagian kalimat yang kosong dengan kata yang tepat.",
    load: bank("tebakkalimat", async () => (await rows(import("@/data/games/tebakkalimat.json"))).map(([soal, j]) => ({ soal, jawaban: [j] }))),
  },
  {
    id: "tekateki", title: "Teka-teki", waktu: 60, hadiah: 3000,
    description: "Teka-teki dan tebak-tebakan receh berbahasa Indonesia.",
    load: bank("tekateki", async () => (await rows(import("@/data/games/tekateki.json"))).map(([soal, j]) => ({ soal, jawaban: [j] }))),
  },
  {
    id: "tebakkimia", title: "Tebak Kimia", waktu: 30, hadiah: 2500,
    description: "Sebutkan lambang dari sebuah unsur kimia.",
    load: bank("tebakkimia", async () => (await rows(import("@/data/games/tebakkimia.json"))).map(([unsur, lambang]) => ({ soal: `Apa lambang kimia dari unsur ${unsur}?`, jawaban: [lambang], extra: { unsur } }))),
  },
  {
    id: "tebakgambar", title: "Tebak Gambar", waktu: 90, hadiah: 5000,
    description: "Tebak kata atau frasa dari sebuah gambar rebus. Field gambar berisi URL yang tinggal dikirim bot.",
    load: bank("tebakgambar", async () =>
      (await rows(import("@/data/games/tebakgambar.json"))).map(([img, j, d]) => ({ soal: "Tebak kata dari gambar berikut.", jawaban: [j], gambar: img, deskripsi: d || null })),
    ),
  },
  {
    id: "tebakbendera", title: "Tebak Bendera", waktu: 45, hadiah: 3000,
    description: "Tebak nama negara dari gambar benderanya.",
    load: bank("tebakbendera", async () =>
      (await rows(import("@/data/games/tebakbendera.json"))).map(([cc, name]) => ({
        soal: "Bendera negara manakah ini?", jawaban: [name], gambar: `https://flagcdn.com/w640/${cc}.png`, extra: { kode: cc.toUpperCase() },
      })),
    ),
  },
  {
    id: "family100", title: "Family 100", waktu: 120, hadiah: 1500, multi: true,
    description: "Satu pertanyaan survei dengan banyak jawaban. Cocok dimainkan ramai-ramai di grup.",
    load: bank("family100", async () => ((await import("@/data/games/family100.json")).default as unknown as [string, string[]][]).map(([soal, jawaban]) => ({ soal, jawaban }))),
  },
];

/* -------------------------------- Token & cek --------------------------------- */

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Petunjuk: huruf vokal disembunyikan, mis. "k_c_ng". */
function hint(answer: string): string {
  const masked = answer.replace(/[aiueoAIUEO]/g, "_");
  // Jawaban tanpa vokal (mis. lambang kimia) cukup diberi huruf pertamanya.
  return masked === answer ? answer.slice(0, 1) + answer.slice(1).replace(/[A-Za-z0-9]/g, "_") : masked;
}

function quizPayload(g: GameDef, idx: number, q: Quiz, origin: string) {
  const id = b64(JSON.stringify([g.id, idx]));
  return {
    game: g.id,
    id,
    soal: q.soal,
    ...(q.gambar ? { gambar: q.gambar } : {}),
    ...(q.extra ?? {}),
    ...(g.multi ? { jawaban: q.jawaban, total_jawaban: q.jawaban.length } : { jawaban: q.jawaban[0], petunjuk: hint(q.jawaban[0]) }),
    ...(q.deskripsi ? { deskripsi: q.deskripsi } : {}),
    waktu: g.waktu,
    hadiah: g.hadiah,
    cek: `${origin}/api/games/jawab?id=${id}&jawaban=`,
  };
}

/* ---------------------------------- Matematika -------------------------------- */

const MATH_MODES: Record<string, { a: [number, number]; b: [number, number]; ops: string; waktu: number; hadiah: number }> = {
  noob: { a: [1, 10], b: [1, 10], ops: "+-", waktu: 12, hadiah: 400 },
  mudah: { a: [5, 50], b: [2, 30], ops: "+-*", waktu: 15, hadiah: 900 },
  sedang: { a: [20, 150], b: [5, 60], ops: "+-*", waktu: 20, hadiah: 2000 },
  sulit: { a: [50, 600], b: [10, 99], ops: "+-*/", waktu: 30, hadiah: 4500 },
  ekstrem: { a: [300, 5000], b: [20, 400], ops: "+-*/", waktu: 45, hadiah: 10000 },
};
const MATH_ALIAS: Record<string, string> = { easy: "mudah", medium: "sedang", hard: "sulit", extreme: "ekstrem", impossible: "ekstrem" };

const rnd = (min: number, max: number) => crypto.randomInt(min, max + 1);

/* ---------------------------------- Tic Tac Toe ------------------------------- */

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winner(b: string[]): { who: string; line: number[] } | null {
  for (const l of LINES) if (b[l[0]] !== "-" && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { who: b[l[0]], line: l };
  return null;
}

function minimax(b: string[], turn: "X" | "O", depth: number): number {
  const w = winner(b);
  if (w) return w.who === "O" ? 10 - depth : depth - 10;
  if (!b.includes("-")) return 0;
  let best = turn === "O" ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== "-") continue;
    b[i] = turn;
    const s = minimax(b, turn === "O" ? "X" : "O", depth + 1);
    b[i] = "-";
    best = turn === "O" ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

function aiMove(b: string[], level: string): number {
  const free = b.map((v, i) => (v === "-" ? i : -1)).filter((i) => i >= 0);
  if (level === "mudah" || (level === "sedang" && crypto.randomInt(100) < 40)) return free[crypto.randomInt(free.length)];
  let best = -Infinity;
  let moves: number[] = [];
  for (const i of free) {
    b[i] = "O";
    const s = minimax(b, "X", 0);
    b[i] = "-";
    if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
  }
  return moves[crypto.randomInt(moves.length)];
}

const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const boardText = (b: string[]) => [0, 3, 6].map((r) => [0, 1, 2].map((c) => (b[r + c] === "X" ? "❌" : b[r + c] === "O" ? "⭕" : NUM_EMOJI[r + c])).join("")).join("\n");

/* ----------------------------------- Akinator --------------------------------- */

const AKI_REGIONS = ["id", "en", "ar", "cn", "de", "es", "fr", "il", "it", "jp", "kr", "nl", "pl", "pt", "ru", "tr"];
const AKI_ANSWERS = ["Ya", "Tidak", "Tidak tahu", "Mungkin", "Mungkin tidak"];
const AKI_ALIAS: Record<string, number> = {
  "0": 0, ya: 0, iya: 0, y: 0, yes: 0,
  "1": 1, tidak: 1, gak: 1, nggak: 1, t: 1, no: 1, n: 1,
  "2": 2, tidaktahu: 2, gaktahu: 2, gatau: 2, entah: 2, idk: 2, dontknow: 2,
  "3": 3, mungkin: 3, probably: 3,
  "4": 4, mungkintidak: 4, probablynot: 4,
};

/** r region, s sesi, st step, p progres, c mode anak, n nomor pertanyaan, lp nomor pertanyaan saat tebakan terakhir. */
type AkiState = { r: string; s: string; st: number; p: string; c: boolean; n: number; lp: string };
type AkiStep = { completion?: string; step?: string | number; question?: string; progression?: string | number; akitude?: string };
type AkiGuess = AkiStep & { id_proposition?: string; id_base_proposition?: string; name_proposition?: string; description_proposition?: string; photo?: string; pseudo?: string };

function akiDecode(token: string): AkiState {
  try {
    const s = JSON.parse(unb64(token)) as AkiState;
    if (!AKI_REGIONS.includes(s.r) || typeof s.s !== "string" || !Number.isInteger(s.st) || !Number.isInteger(s.n)) throw new Error("bad");
    return s;
  } catch {
    throw new HttpError(400, "Parameter 'session' tidak valid. Mulai permainan baru tanpa parameter session.");
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

async function akiPost(region: string, path: string, form: Record<string, string>): Promise<Response> {
  const base = `https://${region}.akinator.com`;
  try {
    return await fetchRaw(
      `${base}/${path}`,
      {
        method: "POST",
        headers: { ...browserHeaders(`${base}/game`), accept: "*/*", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", origin: base, "x-requested-with": "XMLHttpRequest" },
        body: new URLSearchParams(form).toString(),
      },
      20000,
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 502) throw new HttpError(502, "Server Akinator menolak atau gagal merespons. Coba lagi beberapa saat lagi.");
    throw e;
  }
}

function akiOut(state: AkiState, origin: string, question: string | null, guess: AkiGuess | null) {
  const session = b64(JSON.stringify(state));
  const base = `${origin}/api/games/akinator?session=${session}`;
  return {
    session,
    step: state.n,
    progress: Math.round(Number(state.p) * 100) / 100,
    done: !!guess,
    question,
    answers: guess ? [] : AKI_ANSWERS.map((label, i) => ({ id: i, label })),
    guess: guess
      ? { name: guess.name_proposition ?? null, description: guess.description_proposition ?? null, image: guess.photo ?? null }
      : null,
    next: guess
      ? { wrong: `${base}&salah=1`, note: "Bila tebakan salah, panggil tautan 'wrong' untuk melanjutkan." }
      : { answer: `${base}&answer=`, back: state.n > 1 ? `${base}&back=1` : null },
  };
}

/* ---------------------------------- Endpoint ---------------------------------- */

const quizEndpoints: Endpoint[] = GAMES.map((g) => ({
  category: "games" as const, slug: g.id, kind: "json" as const,
  title: g.title,
  description: g.description,
  params: [] as Param[],
  handler: async ({ origin }) => {
    const list = await g.load();
    const idx = crypto.randomInt(list.length);
    return quizPayload(g, idx, list[idx], origin);
  },
}));

export const gamesEndpoints: Endpoint[] = [
  {
    category: "games", slug: "akinator", kind: "json",
    title: "Akinator",
    description: "Jin penebak karakter. Panggil tanpa parameter untuk mulai, lalu kirim session dan answer berulang sampai done bernilai true. Tanpa penyimpanan di sisi bot selain nilai session terakhir.",
    params: [
      { name: "session", description: "Nilai session dari respons sebelumnya. Kosongkan untuk memulai permainan baru.", example: "" },
      { name: "answer", description: "Jawaban: 0 ya, 1 tidak, 2 tidak tahu, 3 mungkin, 4 mungkin tidak. Kata seperti ya atau tidak juga diterima.", example: "" },
      { name: "back", description: "Isi 1 untuk membatalkan jawaban terakhir.", example: "" },
      { name: "salah", description: "Isi 1 setelah tebakan yang keliru agar Akinator lanjut bertanya.", example: "" },
      { name: "region", description: "Bahasa saat memulai: id, en, jp, dan lainnya. Default id.", example: "id" },
    ],
    handler: async ({ sp, origin }) => {
      const token = opt(sp, "session");
      if (!token) {
        const region = opt(sp, "region", "id").toLowerCase();
        if (!AKI_REGIONS.includes(region)) throw new HttpError(400, `Region tidak dikenal. Pilihan: ${AKI_REGIONS.join(", ")}.`);
        const child = opt(sp, "child") === "true";
        const html = await (await akiPost(region, "game", { sid: "1", cm: String(child) })).text();
        const question = /id="question-label"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1];
        const item = (key: string) => new RegExp(`localStorage\\.setItem\\('${key}',\\s*'([^']*)'\\)`).exec(html)?.[1];
        const session = item("session") ?? /session:\s*'([^']+)'/.exec(html)?.[1];
        if (!question?.trim() || !session) throw new HttpError(502, "Akinator tidak mengirim sesi permainan. Kemungkinan server ini diblokir oleh Akinator; coba lagi nanti.");
        const first: AkiState = { r: region, s: session, st: Number(item("step")) || 1, p: item("progression") || "0", c: child, n: Number(item("num_question")) || 1, lp: "" };
        return akiOut(first, origin, clean(decodeEntities(question)), null);
      }

      const st = akiDecode(token);
      const common = { step: String(st.st), progression: st.p, sid: "1", cm: String(st.c), session: st.s };
      let path: string;
      let form: Record<string, string>;
      let move = 1;
      if (opt(sp, "back") === "1") {
        if (st.n <= 1) throw new HttpError(400, "Belum ada jawaban yang bisa dibatalkan.");
        path = "cancel_answer";
        form = common;
        move = -1;
      } else if (opt(sp, "salah") === "1") {
        path = "exclude";
        form = { ...common, forward_answer: "1" };
      } else {
        const raw = norm(need(sp, "answer", 30));
        const ans = AKI_ALIAS[raw];
        if (ans === undefined) throw new HttpError(400, "Parameter 'answer' harus 0 (ya), 1 (tidak), 2 (tidak tahu), 3 (mungkin), atau 4 (mungkin tidak).");
        path = "answer";
        form = { ...common, answer: String(ans), step_last_proposition: st.lp, num_question: String(st.n) };
      }

      let data: AkiGuess;
      try {
        data = (await (await akiPost(st.r, path, form)).json()) as AkiGuess;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(502, "Akinator mengirim respons yang tidak valid.");
      }
      if (data.completion && /^KO|^WARN/.test(data.completion)) {
        if (/TIMEOUT/.test(data.completion)) throw new HttpError(410, "Sesi Akinator sudah kedaluwarsa. Mulai permainan baru.");
        if (/NO QUESTION/.test(data.completion)) throw new HttpError(404, "Akinator kehabisan pertanyaan. Mulai permainan baru.");
        throw new HttpError(502, `Akinator menolak permintaan (${data.completion}). Mulai permainan baru.`);
      }
      const step = data.step === undefined ? st.st : Number(data.step);
      const prog = data.progression === undefined ? st.p : String(data.progression);
      if (data.id_proposition || data.id_base_proposition || data.name_proposition) {
        // Tebakan: simpan posisi terakhir supaya 'salah=1' bisa melanjutkan dari sini.
        return akiOut({ ...st, st: Number.isFinite(step) ? step : st.st, p: prog, lp: String(st.n) }, origin, null, data);
      }
      if (data.question === undefined || !Number.isFinite(step)) throw new HttpError(502, "Akinator mengirim respons yang tidak dikenali.");
      const next: AkiState = { ...st, st: step, p: prog, n: Math.max(1, st.n + move) };
      return akiOut(next, origin, clean(decodeEntities(data.question)), null);
    },
  },
  ...quizEndpoints,
  {
    category: "games", slug: "math", kind: "json",
    title: "Kuis Matematika",
    description: "Soal hitung acak dengan lima tingkat kesulitan, disertai jawaban, batas waktu, dan saran hadiah.",
    params: [{ name: "mode", description: "noob, mudah, sedang, sulit, atau ekstrem. Default mudah.", example: "sedang" }],
    handler: async ({ sp, origin }) => {
      const raw = opt(sp, "mode", "mudah").toLowerCase();
      const mode = MATH_ALIAS[raw] ?? raw;
      const m = MATH_MODES[mode];
      if (!m) throw new HttpError(400, `Mode tidak dikenal. Pilihan: ${Object.keys(MATH_MODES).join(", ")}.`);
      const op = m.ops[crypto.randomInt(m.ops.length)];
      let a = rnd(m.a[0], m.a[1]);
      let b = rnd(m.b[0], m.b[1]);
      let jawaban: number;
      if (op === "+") jawaban = a + b;
      else if (op === "-") { if (b > a) [a, b] = [b, a]; jawaban = a - b; }
      else if (op === "*") { b = Math.max(2, Math.round(b / 3)); jawaban = a * b; }
      else { b = Math.max(2, Math.round(b / 4)); jawaban = rnd(2, Math.max(3, Math.round(m.a[1] / b / 2))); a = jawaban * b; }
      const sym = op === "*" ? "×" : op === "/" ? "÷" : op === "-" ? "−" : "+";
      const id = b64(JSON.stringify(["math", jawaban]));
      return { game: "math", id, mode, soal: `${a} ${sym} ${b}`, jawaban, waktu: m.waktu, hadiah: m.hadiah, cek: `${origin}/api/games/jawab?id=${id}&jawaban=` };
    },
  },
  {
    category: "games", slug: "jawab", kind: "json",
    title: "Cek Jawaban",
    description: "Cocokkan jawaban pemain dengan soal berdasarkan id. Toleran terhadap huruf besar, spasi, dan tanda baca, serta memberi tahu bila jawaban sudah hampir benar.",
    params: [
      { name: "id", required: true, description: "Nilai id dari respons soal.", example: "WyJ0ZWJha2thdGEiLDBd" },
      { name: "jawaban", required: true, description: "Jawaban dari pemain.", example: "kucing" },
    ],
    handler: async ({ sp }) => {
      let game: string;
      let ref: number;
      try {
        const parsed = JSON.parse(unb64(need(sp, "id", 200))) as [string, number];
        if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "number" || !Number.isFinite(parsed[1])) throw new Error("bad");
        [game, ref] = parsed;
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(400, "Parameter 'id' tidak valid. Gunakan id dari respons soal.");
      }
      const given = need(sp, "jawaban", 200);
      if (game === "math") {
        const n = Number(given.replace(",", ".").replace(/[^\d.\-]/g, ""));
        const benar = Number.isFinite(n) && n === ref;
        return { game, benar, hampir: false, jawaban_kamu: given, ...(benar ? { jawaban: ref } : {}) };
      }
      const g = GAMES.find((x) => x.id === game);
      const list = g ? await g.load() : null;
      const q = list && Number.isInteger(ref) ? list[ref] : undefined;
      if (!g || !q) throw new HttpError(404, "Soal untuk id tersebut tidak ditemukan.");
      const mine = norm(given);
      let best = 0;
      let bestIdx = -1;
      q.jawaban.forEach((j, i) => {
        const s = similarity(mine, norm(j));
        if (s > best) { best = s; bestIdx = i; }
      });
      const benar = best === 1;
      return {
        game,
        benar,
        hampir: !benar && best >= 0.72,
        kemiripan: Math.round(best * 100),
        jawaban_kamu: given,
        ...(benar ? { jawaban: q.jawaban[bestIdx] } : {}),
        ...(g.multi ? { urutan: benar ? bestIdx + 1 : null, total_jawaban: q.jawaban.length } : {}),
        ...(benar && q.deskripsi ? { deskripsi: q.deskripsi } : {}),
      };
    },
  },
  {
    category: "games", slug: "suit", kind: "json",
    title: "Suit",
    description: "Main batu gunting kertas melawan bot. Hasilnya menang, kalah, atau seri.",
    params: [{ name: "pilih", required: true, description: "batu, gunting, atau kertas.", example: "batu" }],
    handler: async ({ sp }) => {
      const opts = ["batu", "gunting", "kertas"] as const;
      const emoji = { batu: "✊", gunting: "✌️", kertas: "✋" };
      const me = need(sp, "pilih", 20).toLowerCase() as (typeof opts)[number];
      if (!opts.includes(me)) throw new HttpError(400, "Parameter 'pilih' harus batu, gunting, atau kertas.");
      const bot = opts[crypto.randomInt(3)];
      const hasil = me === bot ? "seri" : (me === "batu" && bot === "gunting") || (me === "gunting" && bot === "kertas") || (me === "kertas" && bot === "batu") ? "menang" : "kalah";
      return { kamu: me, bot, hasil, teks: `${emoji[me]} vs ${emoji[bot]} — ${hasil === "seri" ? "Seri!" : hasil === "menang" ? "Kamu menang!" : "Kamu kalah!"}` };
    },
  },
  {
    category: "games", slug: "tictactoe", kind: "json",
    title: "Tic Tac Toe",
    description: "Main tic tac toe melawan AI tanpa sesi: kirim papan terakhir dan langkahmu, terima papan baru beserta langkah AI. Kamu X, AI O.",
    params: [
      { name: "move", required: true, description: "Kotak yang kamu pilih, 1 sampai 9 (kiri atas ke kanan bawah).", example: "5" },
      { name: "board", description: "Papan dari respons sebelumnya: 9 karakter X, O, atau tanda minus. Kosongkan untuk permainan baru.", example: "---------" },
      { name: "level", description: "mudah, sedang, atau sulit. Default sulit.", example: "sulit" },
    ],
    handler: async ({ sp, origin }) => {
      const raw = opt(sp, "board", "---------").toUpperCase().replace(/[^XO-]/g, "-");
      if (raw.length !== 9) throw new HttpError(400, "Parameter 'board' harus 9 karakter berisi X, O, atau -.");
      const level = opt(sp, "level", "sulit").toLowerCase();
      if (!["mudah", "sedang", "sulit"].includes(level)) throw new HttpError(400, "Parameter 'level' harus mudah, sedang, atau sulit.");
      const b = raw.split("");
      if (winner(b) || !b.includes("-")) throw new HttpError(400, "Permainan di papan ini sudah selesai. Mulai lagi dengan board kosong.");
      const move = Number(need(sp, "move", 2));
      if (!Number.isInteger(move) || move < 1 || move > 9) throw new HttpError(400, "Parameter 'move' harus angka 1 sampai 9.");
      if (b[move - 1] !== "-") throw new HttpError(400, `Kotak ${move} sudah terisi. Pilih kotak lain.`);
      b[move - 1] = "X";
      let ai: number | null = null;
      let w = winner(b);
      if (!w && b.includes("-")) {
        ai = aiMove(b, level);
        b[ai] = "O";
        w = winner(b);
      }
      const status = w ? (w.who === "X" ? "menang" : "kalah") : b.includes("-") ? "lanjut" : "seri";
      const board = b.join("");
      return {
        board,
        board_text: boardText(b),
        status,
        selesai: status !== "lanjut",
        langkah_kamu: move,
        langkah_ai: ai === null ? null : ai + 1,
        garis_menang: w ? w.line.map((i) => i + 1) : null,
        kotak_kosong: b.map((v, i) => (v === "-" ? i + 1 : 0)).filter(Boolean),
        next: status === "lanjut" ? `${origin}/api/games/tictactoe?board=${board}&level=${level}&move=` : null,
      };
    },
  },
  {
    category: "games", slug: "slot", kind: "json",
    title: "Mesin Slot",
    description: "Putar mesin slot tiga gulungan. Mengembalikan simbol, status menang, dan pengali hadiah.",
    params: [],
    handler: async () => {
      const symbols = ["🍒", "🍋", "🍇", "🍉", "🔔", "⭐", "7️⃣"];
      const reel = () => symbols[crypto.randomInt(symbols.length)];
      const r = [reel(), reel(), reel()];
      const same = new Set(r).size;
      const pengali = same === 1 ? (r[0] === "7️⃣" ? 50 : r[0] === "⭐" ? 20 : 10) : same === 2 ? 2 : 0;
      return { hasil: r, teks: r.join(" | "), menang: pengali > 0, jackpot: same === 1, pengali };
    },
  },
];
