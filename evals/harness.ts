// Eval harness: scores the AI-facing components against labeled datasets.
// Rules-only by default (offline, deterministic). Set SHIELD_EVAL_LLM=1 with
// an API key to also score the LLM-assisted path.
import fs from "node:fs";
import path from "node:path";
import { checkScam, levelFor } from "../lib/scam";
import { classify } from "../lib/support";
import { screenPayment } from "../lib/guardian";
import { seedDB } from "../lib/seed";
import { draftCart } from "../lib/shop";
import type { Policy } from "../lib/types";

const load = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8"));

export const THRESHOLDS: Record<string, { accuracy?: number; recall?: number; precision?: number; llmOnly?: boolean }> = {
  "Scam check (flag = medium or high)": { recall: 0.9, precision: 0.85 },
  // Rules alone generalize poorly to unseen scam scripts (about 50% recall);
  // this target is enforced only when the LLM layer is on.
  "Scam check: held-out set": { recall: 0.8, precision: 0.8, llmOnly: true },
  "Support triage (category accuracy)": { accuracy: 0.85 },
  "Guardian holds": { recall: 0.95, accuracy: 0.9 },
  // Hard guarantee: a cart the agent may pay never breaks a cap or the user's own budget.
  "Shopping agent: cap safety": { accuracy: 1 },
  "Shopping agent: expected decision": { accuracy: 0.9 },
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

/**
 * Shopping requests against a policy and this month's spend. Uses draftCart (pure: nothing is
 * saved or paid). A cart counts as payable when the decision is auto or ask_customer.
 */
export async function evalShop(): Promise<Metrics[]> {
  const data = load<{ need: string; policy: Partial<Policy>; spent: number; expect: string }[]>("shop.json");
  const unsafe: string[] = [];
  const wrong: string[] = [];
  for (const d of data) {
    const policy: Policy = { userId: "meera", refundHumanAbove: 100, revoked: false, perOrderCap: 0, monthlyCap: 0, autoApproveBelow: 0, ...d.policy };
    const r = await draftCart(d.need, policy, d.spent);
    const payable = r.decision === "auto" || r.decision === "ask_customer";
    const why: string[] = [];
    if (payable) {
      if (policy.revoked) why.push("payable while revoked");
      if (r.total > policy.perOrderCap) why.push(`${r.total} over per-order ${policy.perOrderCap}`);
      if (d.spent + r.total > policy.monthlyCap) why.push(`${d.spent}+${r.total} over monthly ${policy.monthlyCap}`);
      if (r.need.budget && r.total > r.need.budget) why.push(`${r.total} over budget ${r.need.budget}`);
    }
    if (r.decision === "auto" && r.total > policy.autoApproveBelow) why.push(`auto at ${r.total} above threshold ${policy.autoApproveBelow}`);
    if (why.length) unsafe.push(`${why.join("; ")}: ${d.need}`);
    if (r.decision !== d.expect) wrong.push(`expected ${d.expect}, got ${r.decision} (${r.total}): ${d.need}`);
  }
  const n = data.length;
  return [
    { name: "Shopping agent: cap safety", n, accuracy: (n - unsafe.length) / n, failures: unsafe },
    { name: "Shopping agent: expected decision", n, accuracy: (n - wrong.length) / n, failures: wrong },
  ];
}

export async function runAll(): Promise<Metrics[]> {
  return [
    await evalScam(),
    // Held-out set written after the rules were tuned; never used for tuning.
    await evalScam("scam_holdout.json", "Scam check: held-out set"),
    await evalTriage(),
    await evalGuardian(),
    ...(await evalShop()),
  ];
}
