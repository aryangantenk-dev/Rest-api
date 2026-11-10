"use client";

import { useEffect, useState } from "react";
import { colorizeJson as colorize } from "@/lib/highlight";

const examples = [
  {
    req: "/api/info/cuaca?kota=Bandung",
    ms: 212,
    res: `{
  "status": true,
  "creator": "Yanxz",
  "result": {
    "location": { "name": "Bandung", "country": "Indonesia" },
    "current": {
      "condition": "Berawan sebagian",
      "temperatureC": 24.6,
      "humidity": 78
    }
  }
}`,
  },
  {
    req: "/api/tools/shorturl?url=https://nextjs.org/docs",
    ms: 48,
    res: `{
  "status": true,
  "creator": "Yanxz",
  "result": {
    "original": "https://nextjs.org/docs",
    "short": "https://yanxz.dev/s/k7Qm2x",
    "code": "k7Qm2x"
  }
}`,
  },
  {
    req: "/api/islami/sholat?kota=Surabaya",
    ms: 164,
    res: `{
  "status": true,
  "creator": "Yanxz",
  "result": {
    "city": "Surabaya",
    "timings": {
      "subuh": "04:02",
      "dzuhur": "11:32",
      "maghrib": "17:29"
    }
  }
}`,
  },
  {
    req: "/api/random/quote",
    ms: 6,
    res: `{
  "status": true,
  "creator": "Yanxz",
  "result": {
    "quote": "Perjalanan seribu mil dimulai dengan satu langkah.",
    "author": "Lao Tzu"
  }
}`,
  },
];

export function HeroTerminal() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [showRes, setShowRes] = useState(false);
  const ex = examples[idx];

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => !cancelled && fn(), ms));

    setTyped(0);
    setShowRes(false);
    const len = ex.req.length;
    for (let i = 1; i <= len; i++) later(() => setTyped(i), 400 + i * 32);
    later(() => setShowRes(true), 400 + len * 32 + 350);
    later(() => setIdx((v) => (v + 1) % examples.length), 400 + len * 32 + 5200);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [idx, ex.req]);

  return (
    <div className="relative w-full">
      <div className="absolute -inset-6 rounded-[2rem] bg-ember/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-linestrong bg-[#0f0d0c]/95 shadow-[0_40px_120px_-30px_rgba(255,107,61,0.35)] backdrop-blur">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          </div>
          <div className="font-mono text-[11px] text-dim">yanxz-api — live preview</div>
          <div className="w-10" />
        </div>

        <div className="min-h-[360px] px-5 py-5 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded bg-mint/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-mint">GET</span>
            <p className={`min-w-0 break-all text-fg ${showRes ? "" : "caret"}`}>{ex.req.slice(0, typed)}</p>
          </div>

          <div className={`mt-5 transition-opacity duration-500 ${showRes ? "opacity-100" : "opacity-0"}`}>
            <div className="mb-3 flex items-center gap-3 text-[11px]">
              <span className="text-mint">● 200 OK</span>
              <span className="text-dim">{ex.ms} ms</span>
              <span className="text-dim">application/json</span>
            </div>
            <pre className="overflow-x-auto whitespace-pre text-[#cfc7ba]" dangerouslySetInnerHTML={{ __html: showRes ? colorize(ex.res) : "" }} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-2" aria-hidden>
        {examples.map((_, i) => (
          <span key={i} className={`h-1 rounded-full transition-all duration-500 ${i === idx ? "w-8 bg-ember" : "w-3 bg-white/15"}`} />
        ))}
      </div>
    </div>
  );
}
