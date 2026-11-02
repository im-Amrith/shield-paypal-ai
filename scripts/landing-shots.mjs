// Screenshots the public pages: landing at 0/25/50/75/100% scroll (390 and 1440, both themes),
// every mega-menu open, the mobile menu, /signin and /app; plus one reduced-motion pass.
// Checks for horizontal scroll, blank 3D canvas, console errors and text clipped by its own box.
// Usage (app running): node scripts/landing-shots.mjs [outDir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("playwright-core");
const out = process.argv[2] || ".screens/landing";
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || "http://localhost:3000";
const VIEWS = { phone: { width: 390, height: 844 }, desk: { width: 1440, height: 900 } };
const problems = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function checks(page, name) {
  const o = await page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = [...document.querySelectorAll("h1,h2,h3,p,a,button,li span")].filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflow === "visible" || s.textOverflow === "ellipsis" || !e.offsetParent) return false;
      return e.scrollWidth > e.clientWidth + 2 && !e.closest(".marquee,.sr-only,[aria-hidden=true]");
    }).slice(0, 3).map((e) => e.textContent.trim().slice(0, 40));
    return { sw: doc.scrollWidth, iw: innerWidth, clipped };
  });
  if (o.sw > o.iw + 1) problems.push(`${name}: horizontal scroll ${o.sw}>${o.iw}`);
  if (o.clipped.length) problems.push(`${name}: clipped text: ${o.clipped.join(" | ")}`);
}

/** The hero canvas should show more than a flat background. */
async function canvasCheck(page, name) {
  const box = await page.locator("[data-hero-canvas] canvas").boundingBox().catch(() => null);
  if (!box) { problems.push(`${name}: no hero canvas`); return; }
  const buf = await page.screenshot({ clip: box });
  // Rough "is it blank?" test: count distinct byte values in a sample of the PNG body.
  const set = new Set(); for (let i = 200; i < buf.length; i += 97) set.add(buf[i]);
  if (set.size < 40) problems.push(`${name}: hero canvas looks blank (${set.size} distinct samples)`);
}

for (const theme of ["dark", "light"]) {
  for (const [vn, vp] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "theme", value: theme, url: BASE }]);
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") problems.push(`${theme} ${vn} console: ${m.text().slice(0, 160)}`); });
    page.on("pageerror", (e) => problems.push(`${theme} ${vn} pageerror: ${e.message.slice(0, 160)}`));
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    // Phones load the 3D scene on first interaction; simulate one.
    if (vn === "phone") await page.evaluate(() => window.dispatchEvent(new Event("keydown")));
    await page.waitForTimeout(3500); // idle → 3D scene → fade in
    await canvasCheck(page, `landing-${theme}-${vn}`);
    const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (const pct of [0, 25, 50, 75, 100]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((H * pct) / 100));
      await page.waitForTimeout(1600);
      const name = `landing-${theme}-${vn}-${pct}`;
      await checks(page, name);
      await page.screenshot({ path: `${out}/${name}.png` });
    }
    // Hero mid-scroll (rings) for the record.
    await page.evaluate(() => window.scrollTo(0, innerHeight * 0.8));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/landing-${theme}-${vn}-rings.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);

    if (vn === "desk") {
      for (const label of ["Protect", "Get Paid", "Resolve"]) {
        await page.getByRole("button", { name: label, exact: true }).hover();
        await page.waitForTimeout(1300);
        await page.screenshot({ path: `${out}/mega-${theme}-${label.replace(" ", "")}.png` });
        await page.mouse.move(700, 880);
        await page.waitForTimeout(400);
      }
    } else {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("button", { name: "Protect" }).click();
      await page.waitForTimeout(400);
      await checks(page, `menu-${theme}-phone`);
      await page.screenshot({ path: `${out}/menu-${theme}-phone.png` });
      await page.keyboard.press("Escape");
    }

    await page.goto(BASE + "/signin", { waitUntil: "networkidle" });
    await checks(page, `signin-${theme}-${vn}`);
    await page.screenshot({ path: `${out}/signin-${theme}-${vn}.png`, fullPage: true });
    await page.getByRole("button", { name: /Continue as Meera/ }).click();
    await page.waitForURL("**/app");
    await page.waitForTimeout(600);
    await checks(page, `app-${theme}-${vn}`);
    await page.screenshot({ path: `${out}/app-${theme}-${vn}.png` });
    await ctx.close();
  }
}

// Reduced motion: no pinning, no 3D, everything readable in normal flow.
for (const [vn, vp] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`reduced ${vn} pageerror: ${e.message.slice(0, 160)}`));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    canvas: !!document.querySelector("[data-hero-canvas] canvas"),
    still: !!document.querySelector(".hero-still"),
    pins: document.querySelectorAll(".pin-spacer").length,
    dim: [...document.querySelectorAll(".wr")].filter((w) => parseFloat(getComputedStyle(w).opacity) < 0.99).length,
    hidden: [...document.querySelectorAll("[data-reveal]")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length,
  }));
  if (r.canvas || !r.still || r.pins || r.dim || r.hidden) problems.push(`reduced ${vn}: ${JSON.stringify(r)}`);
  await page.screenshot({ path: `${out}/reduced-${vn}-full.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(problems.length ? problems.join("\n") : "landing: no overflow, clipping, blank canvas or console errors");
