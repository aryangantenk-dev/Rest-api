/** Pewarnaan sintaks JSON ringan (output sudah di-escape). */
export function colorizeJson(json: string): string {
  const esc = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, bool, n) => {
    if (str) return colon ? `<span class="json-key">${str}</span>${colon}` : `<span class="json-str">${str}</span>`;
    if (bool) return `<span class="json-bool">${m}</span>`;
    if (m === "null") return `<span class="json-null">null</span>`;
    if (n) return `<span class="json-num">${m}</span>`;
    return m;
  });
}
