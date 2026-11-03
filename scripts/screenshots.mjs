// Screenshots every page per persona, theme and viewport; reports horizontal overflow and console errors.
// Usage (app running): node scripts/screenshots.mjs [outDir] [filter]   — seeds the demo first.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("playwright-core");
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const [out = ".screens", filter] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const idsJson = execFileSync(process.execPath, [fileURLToPath(new URL("./seed-demo.mjs", import.meta.url))], { encoding: "utf8" }).trim();
const ids = JSON.parse(idsJson);
const BASE = process.env.BASE || "http://localhost:3000";
const PAGES = {
  meera: ["/app", "/alerts", "/protect", "/protect/scan?q=send it as friends and family, my courier will collect today", "/vault", `/vault/${ids.vault}`, "/guardian", `/guardian/${ids.hold}`, "/get-paid", "/get-paid/account", "/subscriptions", "/shop", "/support", "/demo"],
  ravi: ["/app", "/guardian", `/guardian/${ids.hold}`, `/support?case=${ids.case}`, "/subscriptions", "/shop"],
  buyer: ["/app", `/vault/${ids.vault}`],
  agent: ["/app", `/console?case=${ids.case}`],
  client: ["/app", `/get-paid/pay/${ids.invoice}`],
};
const VIEWS = { phone: { width: 390, height: 844 }, desk: { width: 1440, height: 900 } };
const browser = await chromium.launch({ channel: "chrome" });
const problems = [];
for (const [persona, paths] of Object.entries(PAGES)) {
  for (const theme of ["dark", "light"]) {
    for (const [vn, vp] of Object.entries(VIEWS)) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vn === "phone" ? 2 : 1, reducedMotion: "reduce" });
      await ctx.addCookies([{ name: "persona", value: persona, url: BASE }, { name: "theme", value: theme, url: BASE }]);
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") problems.push(`${persona} ${theme} ${vn} console: ${m.text().slice(0, 160)}`); });
      for (const p of paths) {
        const name = `${persona}-${p.split("?")[0].replace(/\//g, "_").replace(/^_app$/, "home").replace(/^_/, "")}-${theme}-${vn}`;
        if (filter && !name.includes(filter)) continue;
        await page.goto(BASE + p, { waitUntil: "networkidle" });
        await page.waitForTimeout(p.includes("scan") ? 900 : 150);
        const o = await page.evaluate(() => {
          const doc = document.documentElement;
          const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`);
          return { sw: doc.scrollWidth, iw: innerWidth, wide, err: !!document.querySelector("#__next_error__") || /couldn.t load|Application error/.test(document.body.innerText) };
        });
        if (o.sw > o.iw + 1) problems.push(`${name}: horizontal scroll ${o.sw}>${o.iw} ${o.wide.join(" | ")}`);
        if (o.err) problems.push(`${name}: RENDER ERROR`);
        await page.screenshot({ path: `${out}/${name}.png`, fullPage: vn === "phone" ? false : false });
        if (vn === "phone") await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no overflow, render errors or console errors");
