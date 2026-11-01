// Eval harness: scores the AI-facing components against labeled datasets.
// Rules-only by default (offline, deterministic). Set SHIELD_EVAL_LLM=1 with
// an API key to also score the LLM-assisted path.
import fs from "node:fs";
import path from "node:path";
import { checkScam, levelFor } from "../lib/scam";
import { classify } from "../lib/support";
import { screenPayment } from "../lib/guardian";
import { seedDB } from "../lib/seed";

const load = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8"));

export const THRESHOLDS: Record<string, { accuracy?: number; recall?: number; precision?: number; llmOnly?: boolean }> = {
  "Scam check (flag = medium or high)": { recall: 0.9, precision: 0.85 },
  // Rules alone generalize poorly to unseen scam scripts (about 50% recall);
  // this target is enforced only when the LLM layer is on.
  "Scam check: held-out set": { recall: 0.8, precision: 0.8, llmOnly: true },
  "Support triage (category accuracy)": { accuracy: 0.85 },
  "Guardian holds": { recall: 0.95, accuracy: 0.9 },
};

export interface Metrics {
  name: string;
  n: number;
  accuracy: number;
  precision?: number;
  recall?: number;
  f1?: number;
  failures: string[];
}

function binary(name: string, rows: { pred: boolean; gold: boolean; label: string }[]): Metrics {
  const tp = rows.filter((r) => r.pred && r.gold).length;
  const fp = rows.filter((r) => r.pred && !r.gold).length;
  const fn = rows.filter((r) => !r.pred && r.gold).length;
  const correct = rows.filter((r) => r.pred === r.gold).length;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return {
    name, n: rows.length, accuracy: correct / rows.length, precision, recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    failures: rows.filter((r) => r.pred !== r.gold).map((r) => `${r.gold ? "MISSED" : "FALSE ALARM"}: ${r.label}`),
  };
}

export async function evalScam(file = "scam.json", name = "Scam check (flag = medium or high)"): Promise<Metrics> {
  const data = load<{ text: string; scam: boolean }[]>(file);
  const rows = [];
  for (const d of data) {
    const r = await checkScam(d.text);
    rows.push({ pred: levelFor(r.score) !== "low", gold: d.scam, label: `[${r.score}] ${d.text.slice(0, 70)}` });
  }
  return binary(name, rows);
}

export async function evalTriage(): Promise<Metrics> {
  const data = load<{ text: string; category: string }[]>("triage.json");
  const failures: string[] = [];
  let correct = 0;
  for (const d of data) {
    const c = await classify(d.text);
    if (c === d.category) correct++;
    else failures.push(`expected ${d.category}, got ${c}: ${d.text.slice(0, 70)}`);
  }
  return { name: "Support triage (category accuracy)", n: data.length, accuracy: correct / data.length, failures };
}

export async function evalGuardian(): Promise<Metrics> {
  const data = load<{ payee: string; amount: number; note: string; method?: "gift_card" | "crypto"; hold: boolean }[]>("guardian.json");
  const history = seedDB(Date.parse("2026-11-01T00:00:00Z")).transactions.filter((t) => t.userId === "ravi");
  const rows = data.map((d) => {
    const s = screenPayment({ payee: d.payee, amount: d.amount, currency: "USD", note: d.note, method: d.method }, history);
    return { pred: s.hold, gold: d.hold, label: `[${s.riskScore}] ${d.payee} ${d.amount} "${d.note}"` };
  });
  return binary("Guardian holds", rows);
}

export async function runAll(): Promise<Metrics[]> {
  return [
    await evalScam(),
    // Held-out set written after the rules were tuned; never used for tuning.
    await evalScam("scam_holdout.json", "Scam check: held-out set"),
    await evalTriage(),
    await evalGuardian(),
  ];
}
