import { chromium } from "@playwright/test";
import fs from "node:fs";
const svg = fs.readFileSync("public/favicon.svg", "utf8");
const maskable = svg.replace('rx="16"', 'rx="0"');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, src] of [["icon-192.png", 192, svg], ["icon-512.png", 512, svg], ["apple-touch-icon.png", 180, svg], ["icon-512-maskable.png", 512, maskable]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace(/width="64" height="64"/, `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: true });
}
await browser.close();
