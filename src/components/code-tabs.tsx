"use client";

import { useState } from "react";
import { useApiKey, withKey } from "./auth-client";
import { CopyButton, useOrigin } from "./client-utils";

type Props = { fallback: string; path: string; keyRequired?: boolean };

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

/** Contoh kode untuk mengunggah berkas lewat POST multipart. */
export function buildUploadSnippets(url: string, field: string) {
  return {
    cURL: `curl -s -F "${field}=@foto.jpg" "${url}"`,
    JavaScript: `import { readFile } from "node:fs/promises";

const form = new FormData();
form.append("${field}", new Blob([await readFile("foto.jpg")]), "foto.jpg");

const res = await fetch("${url}", { method: "POST", body: form });
const data = await res.json();

console.log(data.result.url);`,
    Python: `import requests

with open("foto.jpg", "rb") as f:
    res = requests.post("${url}", files={"${field}": f})
print(res.json()["result"]["url"])`,
    PHP: `<?php
$ch = curl_init("${url}");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, ["${field}" => new CURLFile("foto.jpg")]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$data = json_decode(curl_exec($ch), true);

echo $data["result"]["url"];`,
  } as Record<string, string>;
}

export function CodeTabs({ fallback, path, keyRequired = false }: Props) {
  const origin = useOrigin(fallback);
  const { shown } = useApiKey(keyRequired);
  const snippets = buildSnippets(withKey(`${origin}${path}`, shown));
  const tabs = Object.keys(snippets);
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="bg-code text-codefg">
      <div role="tablist" aria-label="Bahasa pemrograman" className="flex flex-wrap border-b border-codeline">
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
      {/* Tombol salin berada di samping kode, bukan di baris tab, supaya tab tidak terlipat di layar sempit. */}
      <div className="flex items-start">
        <pre id="panel-kode" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} key={tab} className="enter min-w-0 flex-1 overflow-x-auto p-4 font-mono text-sm leading-relaxed">
          <code>{snippets[tab]}</code>
        </pre>
        <CopyButton text={snippets[tab]} tone="code" className="mt-1" />
      </div>
    </div>
  );
}
