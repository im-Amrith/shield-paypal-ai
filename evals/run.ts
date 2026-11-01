// npm run eval            -> rules-only (offline)
// SHIELD_EVAL_LLM=1 npm run eval  -> also uses your LLM key
import fs from "node:fs";
import path from "node:path";
import { runAll, THRESHOLDS } from "./harness";
import { llmProvider } from "../lib/llm";



async function main() {
  if (!process.env.SHIELD_EVAL_LLM) process.env.SHIELD_FORCE_MOCK = "1";
  console.log(`LLM provider: ${llmProvider()}\n`);
  const results = await runAll();
  let ok = true;
  for (const m of results) {
    const pct = (x?: number) => (x === undefined ? "  -  " : `${(x * 100).toFixed(1)}%`);
    console.log(`${m.name}  (n=${m.n})`);
    console.log(`  accuracy ${pct(m.accuracy)}  precision ${pct(m.precision)}  recall ${pct(m.recall)}  f1 ${pct(m.f1)}`);
    const t = THRESHOLDS[m.name] || {};
    const { llmOnly, ...targets } = t;
    if (llmOnly && llmProvider() === "none") console.log("  (informational without an LLM key)");
    for (const [k, v] of Object.entries(targets)) {
      if (llmOnly && llmProvider() === "none") break;
      const got = (m as unknown as Record<string, number>)[k];
      if (got < v) {
        ok = false;
        console.log(`  ✗ ${k} ${pct(got)} below target ${pct(v)}`);
      }
    }
    for (const f of m.failures) console.log(`    - ${f}`);
    console.log("");
  }
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ at: new Date().toISOString(), provider: llmProvider(), results }, null, 2));
  console.log(ok ? "All eval targets met." : "Some eval targets missed.");
  process.exit(ok ? 0 : 1);
}

main();
