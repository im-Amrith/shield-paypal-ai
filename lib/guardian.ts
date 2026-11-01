// Guardian mode: screen a senior's outgoing payment; hold suspicious ones
// until the trusted relative approves. The senior can always cancel.
import { scoreRules } from "./scam";
import type { GuardianHold, Persona, Transaction } from "./types";
import { db, mutate, uid } from "./store";
import { HOUR, now, nowIso } from "./clock";
import { notify } from "./notify";

export interface PaymentAttempt {
  payee: string;
  amount: number;
  currency: string;
  note: string;
  method?: "paypal" | "gift_card" | "crypto" | "bank_transfer";
}

export interface Screening {
  hold: boolean;
  riskScore: number;
  reasons: string[];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function screenPayment(p: PaymentAttempt, history: Transaction[]): Screening {
  const out = history.filter((t) => t.direction === "out");
  const known = new Set(out.map((t) => t.counterparty.toLowerCase()));
  const typical = median(out.map((t) => t.amount)) || 25;
  const reasons: string[] = [];
  let p0 = 0; // probability-style accumulator
  const add = (w: number, why: string) => {
    p0 = 1 - (1 - p0) * (1 - w);
    reasons.push(why);
  };

  const isNew = !known.has(p.payee.toLowerCase());
  if (isNew) add(0.25, `First payment ever to "${p.payee}"`);
  const ratio = p.amount / typical;
  if (ratio >= 10) add(0.55, `Amount is ${Math.round(ratio)}× your usual payment (${typical.toFixed(0)} ${p.currency})`);
  else if (ratio >= 3) add(0.3, `Amount is ${ratio.toFixed(1)}× your usual payment (${typical.toFixed(0)} ${p.currency})`);
  if (p.method === "gift_card" || p.method === "crypto") add(0.5, `Paying by ${p.method.replace("_", " ")}, which can't be reversed`);

  const lang = scoreRules(`${p.payee} ${p.note}`);
  for (const s of lang.signals) {
    if (["authority", "gift_card_crypto", "romance", "prize", "credentials", "urgency", "overpayment", "advance_fee", "utility_threat", "job_scam"].includes(s.id))
      add(s.weight, `${s.label}: "${s.excerpt}"`);
  }

  const riskScore = Math.round(p0 * 100);
  // Hold when risk is high, or a brand-new payee gets an unusually large amount.
  const hold = riskScore >= 50 || (isNew && ratio >= 3);
  return { hold, riskScore, reasons };
}

export async function attemptPayment(seniorId: Persona, p: PaymentAttempt): Promise<{ status: "sent" | "held"; hold?: GuardianHold; screening: Screening }> {
  const d = db();
  const senior = d.users.find((u) => u.id === seniorId);
  const history = d.transactions.filter((t) => t.userId === seniorId);
  const screening = screenPayment(p, history);
  if (!screening.hold || !senior?.guardedBy) {
    mutate((x) => {
      x.transactions.push({ id: uid("tx"), userId: seniorId, at: nowIso(), amount: p.amount, currency: p.currency, direction: "out",
        counterparty: p.payee, country: "IN", type: "goods_services", memo: p.note });
    });
    return { status: "sent", screening };
  }
  const hold: GuardianHold = {
    id: uid("hold"), seniorId, guardianId: senior.guardedBy, payee: p.payee, amount: p.amount, currency: p.currency,
    note: p.note, createdAt: nowIso(), coolingOffUntil: new Date(now().getTime() + 24 * HOUR).toISOString(),
    reasons: screening.reasons, riskScore: screening.riskScore, status: "held",
  };
  mutate((x) => {
    x.holds.unshift(hold);
  });
  await notify(senior.guardedBy, {
    kind: "guardian",
    title: `Hold: ${senior.name.split(" ")[0]} is trying to pay ${p.currency} ${p.amount} to ${p.payee}`,
    body: `Risk ${screening.riskScore}/100. ${screening.reasons.slice(0, 2).join(". ")}. Approve or block.`,
    link: `/guardian/${hold.id}`,
    email: true,
  });
  await notify(seniorId, {
    kind: "guardian",
    title: "Payment paused for a quick check",
    body: `We've asked ${d.users.find((u) => u.id === senior.guardedBy)?.name.split(" ")[0]} to confirm this payment. You can cancel it any time.`,
    link: `/guardian/${hold.id}`,
  });
  return { status: "held", hold, screening };
}

export async function decideHold(holdId: string, decision: "approved" | "blocked" | "cancelled_by_senior"): Promise<GuardianHold> {
  const hold = db().holds.find((h) => h.id === holdId);
  if (!hold) throw new Error("Hold not found");
  if (hold.status !== "held") throw new Error(`Hold already ${hold.status}`);
  mutate((d) => {
    const h = d.holds.find((x) => x.id === holdId)!;
    h.status = decision;
    h.decidedAt = nowIso();
    if (decision === "approved") {
      d.transactions.push({ id: uid("tx"), userId: h.seniorId, at: nowIso(), amount: h.amount, currency: h.currency, direction: "out",
        counterparty: h.payee, country: "IN", type: "goods_services", memo: h.note });
    }
  });
  const msg = decision === "approved" ? "approved and sent" : decision === "blocked" ? "blocked. No money left your account" : "cancelled by you";
  await notify(hold.seniorId, { kind: "guardian", title: `Payment to ${hold.payee} ${msg}`, body: "", link: `/guardian/${hold.id}` });
  return db().holds.find((h) => h.id === holdId)!;
}
