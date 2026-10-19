// Captures what the static preview needs from a running ClearEV server (default http://127.0.0.1:3100):
// the published program records, source-status variants, and server-rendered program/coverage/privacy pages.
// Nothing here is invented: every value comes from the server's own responses.
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), ".snapshot");
fs.mkdirSync(OUT, { recursive: true });

async function json(p) {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
}
async function mainHtml(p) {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  const html = await r.text();
  const start = html.indexOf('<main id="main">');
  const end = html.lastIndexOf("</main>");
  if (start < 0 || end < 0) throw new Error(`${p}: no <main>`);
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const title = (titles.find((t) => t.includes("ClearEV")) ?? "ClearEV").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
  // Strip any inline scripts Next adds inside main (none expected for server components).
  return { title, html: html.slice(start + '<main id="main">'.length, end).replace(/<script[\s\S]*?<\/script>/g, "") };
}

const all = await json("/api/search");
const state = await json("/api/search?state=CA");
const zip = await json("/api/search?zip=94110");
const programs = all.programs.map(({ verdict: _v, ...p }) => p);
const pages = { "/coverage": await mainHtml("/coverage"), "/privacy": await mainHtml("/privacy") };
for (const p of programs) pages[`/program/${p.id}`] = await mainHtml(`/program/${encodeURIComponent(p.id)}`);

const data = {
  capturedAt: new Date().toISOString(),
  programs,
  status: { none: all.sourcesStatus, stored: state.sourcesStatus, zip: zip.sourcesStatus.filter((s) => !state.sourcesStatus.some((t) => t.id === s.id)) },
  pages,
};
fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));
console.log(`snapshot: ${programs.length} programs, ${Object.keys(pages).length} pages`);
