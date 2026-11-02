// Screenshots the landing hero across its pinned scroll (0..1.2 viewport heights), desktop + phone, dark + light.
// Usage (app running): node scripts/hero-shots.mjs [outDir] [themes=dark,light]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("playwright-core");
const out = process.argv[2] || ".screens/hero";
const themes = (process.argv[3] || "dark,light").split(",");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch(process.env.SW ? { channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } : { channel: "chrome", headless: false, args: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] }); // headed = real GPU; never throttled when hidden behind other windows
const errs = [];
for (const theme of themes) for (const [vn, vp] of [["desk", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addCookies([{ name: "theme", value: theme, url: BASE }]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errs.push(`${theme} ${vn}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => errs.push(`${theme} ${vn} pageerror: ${e.message.slice(0, 200)}`));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  if (vn === "phone") await page.evaluate(() => window.dispatchEvent(new Event("keydown")));
  await page.waitForTimeout(4500);
  if (!globalThis.gpuLogged) { globalThis.gpuLogged = 1; console.log(await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g?.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })); }
  const steps = vn === "desk" ? [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.25, 1.5] : [0, 0.3, 0.6, 0.9, 1.15];
  // Scroll with the wheel (Lenis owns scrolling) in small steps, then let the smoothing and scrub settle.
  await page.mouse.move(vp.width / 2, vp.height / 2);
  let at = 0;
  for (const s of steps) {
    const target = Math.round(vp.height * s);
    while (at < target) { const d = Math.min(150, target - at); await page.mouse.wheel(0, d); at += d; await page.waitForTimeout(120); }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${theme}-${vn}-${String(Math.round(s * 100)).padStart(3, "0")}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join("\n") : "no console errors");
