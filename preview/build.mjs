// Builds the static, browser-only ClearEV preview into preview/dist (run `node preview/snapshot.mjs` first).
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, "..");
const dist = path.join(here, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "geo"), { recursive: true });
fs.mkdirSync(path.join(dist, "data"), { recursive: true });

await esbuild.build({
  entryPoints: { app: path.join(here, "main.tsx") },
  bundle: true,
  format: "esm",
  splitting: false,
  minify: true,
  sourcemap: false,
  outdir: dist,
  jsx: "automatic",
  target: ["es2020"],
  tsconfig: path.join(repo, "tsconfig.json"),
  alias: {
    "next/navigation": path.join(here, "shims/next-navigation.ts"),
    "next/dynamic": path.join(here, "shims/next-dynamic.tsx"),
    "next/link": path.join(here, "shims/next-link.tsx"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".svg": "file", ".png": "file" },
  logLevel: "info",
});

for (const f of ["states.json", "state-paths.json", "county-points.json", "lakes.json", "ranges.json", "solar-installers.json"]) fs.copyFileSync(path.join(repo, "public/geo", f), path.join(dist, "geo", f));
for (const f of ["zcta.json", "counties.json"]) fs.copyFileSync(path.join(repo, "data/geo", f), path.join(dist, "geo", f));
fs.cpSync(path.join(repo, "public/geo/terrain"), path.join(dist, "geo/terrain"), { recursive: true });
fs.copyFileSync(path.join(repo, "public/favicon.svg"), path.join(dist, "favicon.svg"));
fs.copyFileSync(path.join(here, ".snapshot/data.json"), path.join(dist, "data/snapshot.json"));
fs.writeFileSync(
  path.join(dist, "index.html"),
  `<title>ClearEV Preview</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="app.css">
<div id="app"><p style="padding:24px;font-family:system-ui,sans-serif">Loading ClearEV…</p></div>
<script type="module" src="app.js"></script>
`,
);
console.log("built", fs.readdirSync(dist));
