import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("response", (r) => { if (r.url().includes("/geo/")) console.log("geo", r.status(), r.url()); });
await page.goto(process.argv[2] ?? "http://127.0.0.1:3100/", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const c = document.querySelector(".maplibregl-canvas");
  const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
  return { canvas: !!c, w: c?.width, h: c?.height, gl: !!gl, renderer: gl ? gl.getParameter(gl.RENDERER) : null, labels: document.querySelectorAll(".maplibregl-marker").length };
});
console.log(info);
await page.screenshot({ path: "test-results/map-debug.png" });
await browser.close();
