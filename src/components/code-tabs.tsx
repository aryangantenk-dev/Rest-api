"use client";

import { useState } from "react";
import { CopyButton, useOrigin } from "./client-utils";

type Props = { fallback: string; path: string; label?: string };

export function buildSnippets(url: string) {
  return {
    cURL: `curl -s "${url}"`,
    JavaScript: `const res = await fetch("${url}");
const data = await res.json();

console.log(data.result);`,
    Python: `import requests

res = requests.get("${url}")
print(res.json()["result"])`,
    PHP: `<?php
$json = file_get_contents("${url}");
$data = json_decode($json, true);

print_r($data["result"]);`,
  } as Record<string, string>;
}

export function CodeTabs({ fallback, path, label = "contoh permintaan" }: Props) {
  const origin = useOrigin(fallback);
  const snippets = buildSnippets(`${origin}${path}`);
  const tabs = Object.keys(snippets);
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="overflow-hidden rounded-2xl border border-linestrong bg-[#0f0d0c]">
      <div className="flex items-center justify-between border-b border-line pl-2 pr-3">
        <div role="tablist" aria-label="Bahasa pemrograman" className="flex">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`relative px-3.5 py-3 text-xs font-medium transition-colors ${tab === t ? "text-fg" : "text-dim hover:text-muted"}`}
            >
              {t}
              <span className={`absolute inset-x-3 bottom-0 h-px bg-ember transition-opacity ${tab === t ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:block">{label}</span>
          <CopyButton text={snippets[tab]} />
        </div>
      </div>
      <pre key={tab} className="response-in overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-[#d8d0c3]">
        <code>{snippets[tab]}</code>
      </pre>
    </div>
  );
}
