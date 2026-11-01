import { describe, it, expect } from "vitest";
import { runAll, THRESHOLDS } from "../evals/harness";

// Runs the labeled eval sets offline (rules only) and enforces the targets.
describe("evals", () => {
  it("meets every rules-mode target", async () => {
    const results = await runAll();
    for (const m of results) {
      const { llmOnly, ...t } = THRESHOLDS[m.name] || {};
      if (llmOnly) continue;
      for (const [k, v] of Object.entries(t)) expect((m as unknown as Record<string, number>)[k], `${m.name} ${k}`).toBeGreaterThanOrEqual(v as number);
    }
  }, 30_000);
});
