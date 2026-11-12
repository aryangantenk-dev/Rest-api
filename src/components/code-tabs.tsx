"use client";

import { useState } from "react";
import { CopyButton, useOrigin } from "./client-utils";

type Props = { fallback: string; path: string };

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

export function CodeTabs({ fallback, path }: Props) {
  const origin = useOrigin(fallback);
  const snippets = buildSnippets(`${origin}${path}`);
  const tabs = Object.keys(snippets);
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="bg-code text-codefg">
      <div className="flex items-stretch justify-between border-b border-codeline">
        <div role="tablist" aria-label="Bahasa pemrograman" className="flex min-w-0 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls="panel-kode"
              onClick={() => setTab(t)}
              className={`relative min-h-11 px-3 text-sm font-medium transition-colors duration-150 sm:px-4 ${tab === t ? "text-codefg" : "text-codemuted hover:text-codefg"}`}
            >
              {t}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden />}
            </button>
          ))}
        </div>
        <CopyButton text={snippets[tab]} tone="code" />
      </div>
      <pre id="panel-kode" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} key={tab} className="enter overflow-x-auto p-4 font-mono text-sm leading-relaxed">
        <code>{snippets[tab]}</code>
      </pre>
    </div>
  );
}
