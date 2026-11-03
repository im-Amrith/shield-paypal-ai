// Risk signals engine: warns sellers BEFORE PayPal's risk review is likely
// to limit them, and explains a limitation in plain language when it happens.
// PayPal does not expose its internal reasons, so this reads the same
// signals a risk team looks at from the seller's own transaction history.
import type { Persona, Transaction } from "./types";
import { db, mutate } from "./store";
import { DAY, HOUR, now, nowIso, hoursBetween } from "./clock";
import { notify } from "./notify";
import { complete } from "./llm";
import { perRecord } from "./paypalLink";

export interface RiskSignal {
  id: "volume_spike" | "new_countries" | "dispute_rate" | "ff_for_goods" | "large_single";
  title: string;
  severity: number; // 0..1
  detail: string;
  evidence: string[]; // transaction ids
  fix: string;
}

export interface RiskReport {
  score: number;
  level: "low" | "elevated" | "high";
  signals: RiskSignal[];
}

const GOODS_WORDS = /\b(template|kit|item|product|order|ship|shipping|parcel|logo|design|figma|course|ebook|download|file|send (me|it))\b/i;

export function assessRisk(txs: Transaction[], at: Date): RiskReport {
  const t = at.getTime();
  const inc = txs.filter((x) => x.direction === "in");
  const recent = inc.filter((x) => t - new Date(x.at).getTime() <= 7 * DAY);
  const prior = inc.filter((x) => {
    const age = t - new Date(x.at).getTime();
    return age > 7 * DAY && age <= 90 * DAY;
  });
  const signals: RiskSignal[] = [];

  const recentSum = recent.reduce((s, x) => s + x.amount, 0);
  const priorWeekly = prior.reduce((s, x) => s + x.amount, 0) / (83 / 7) || 1;
  const ratio = recentSum / priorWeekly;
  if (ratio >= 3)
    signals.push({
      id: "volume_spike", title: "Sudden jump in incoming money", severity: Math.min(1, 0.3 + (ratio - 3) * 0.08),
      detail: `You received ${recentSum.toFixed(0)} USD in the last 7 days, ${ratio.toFixed(1)}× your usual weekly ${priorWeekly.toFixed(0)} USD.`,
      evidence: recent.map((x) => x.id),
      fix: "Tell PayPal about the reason (a launch, a big client) before they ask, and keep invoices and contracts ready.",
    });

  const seen = new Set(prior.map((x) => x.country));
  const fresh = recent.filter((x) => !seen.has(x.country));
  const newCountries = Array.from(new Set(fresh.map((x) => x.country)));
  if (newCountries.length)
    signals.push({
      id: "new_countries", title: "Payments from new countries", severity: Math.min(0.6, 0.2 * newCountries.length),
      detail: `First-ever payments from ${newCountries.join(", ")} this week.`,
      evidence: fresh.map((x) => x.id),
      fix: "Keep the contract or email thread with each new client; it answers the most common review question.",
    });

  const last30 = inc.filter((x) => t - new Date(x.at).getTime() <= 30 * DAY);
  const disputed = last30.filter((x) => x.disputed);
  const disputeRate = last30.length ? disputed.length / last30.length : 0;
  if (disputed.length && disputeRate >= 0.01)
    signals.push({
      id: "dispute_rate", title: "Open dispute on a large payment", severity: Math.min(0.9, 0.35 + disputeRate * 3),
      detail: `${disputed.length} of ${last30.length} payments in 30 days are disputed (${(disputeRate * 100).toFixed(1)}%), including ${disputed.map((d) => `${d.amount} USD from ${d.counterparty}`).join(", ")}.`,
      evidence: disputed.map((x) => x.id),
      fix: "Respond to the dispute with delivery proof (files, messages, sign-off) within PayPal's deadline.",
    });

  const ff = inc.filter((x) => x.type === "friends_family" && t - new Date(x.at).getTime() <= 30 * DAY && GOODS_WORDS.test(x.memo || ""));
  if (ff.length)
    signals.push({
      id: "ff_for_goods", title: "Friends & Family used for sales", severity: Math.min(0.8, 0.35 + 0.15 * ff.length),
      detail: `${ff.length} payments sent as Friends & Family look like sales ("${ff[0].memo}"). That breaks PayPal's user agreement.`,
      evidence: ff.map((x) => x.id),
      fix: "Ask buyers to pay with Goods & Services or a PayPal invoice from now on.",
    });

  const amounts = prior.map((x) => x.amount).sort((a, b) => a - b);
  const med = amounts[Math.floor(amounts.length / 2)] || 0;
  const big = recent.filter((x) => med && x.amount >= 5 * med);
  if (big.length)
    signals.push({
      id: "large_single", title: "Unusually large single payments", severity: 0.25,
      detail: `${big.length} payments are over 5× your typical ${med.toFixed(0)} USD.`,
      evidence: big.map((x) => x.id),
      fix: "Attach the invoice or contract to large payments.",
    });

  const p = 1 - signals.reduce((acc, s) => acc * (1 - s.severity), 1);
  const score = Math.round(p * 100);
  return { score, level: score >= 70 ? "high" : score >= 40 ? "elevated" : "low", signals: signals.sort((a, b) => b.severity - a.severity) };
}

export function riskFor(userId: Persona): RiskReport {
  return assessRisk(db().transactions.filter((x) => x.userId === userId), now());
}

/** Early warning: notify once per day when risk is elevated and the account isn't limited. */
export async function earlyWarning(userId: Persona): Promise<boolean> {
  const r = riskFor(userId);
  const state = db().accountState[userId];
  if (r.level === "low" || state?.limited) return false;
  const recent = db().notifications.find((n) => n.userId === userId && n.kind === "risk" && hoursBetween(n.at, now()) < 24);
  if (recent) return false;
  await notify(userId, {
    kind: "risk", email: true, link: "/get-paid/account",
    title: `Heads-up: your account risk is ${r.level}`,
    body: `${r.signals[0].title}. ${r.signals[0].detail} What to do: ${r.signals[0].fix}`,
  });
  return true;
}

// ---------- Limitation (freeze) explanation ----------

export const REASON_TEXT: Record<string, { title: string; plain: string; docs: string[] }> = {
  volume_spike: {
    title: "Unusual increase in payments received",
    plain: "Your incoming payments jumped far above your normal pattern in a few days. PayPal pauses accounts like this to check the money is from real customers, not fraud.",
    docs: ["Invoices or contracts for the large payments", "A short note on why volume increased (launch, new client)", "Proof of delivery for the work"],
  },
  dispute_rate: {
    title: "High dispute rate",
    plain: "A meaningful share of your recent payments are disputed. PayPal may hold funds to cover possible refunds while it reviews.",
    docs: ["Delivery proof for disputed orders", "Messages showing the client approved the work", "Refund policy"],
  },
  ff_for_goods: {
    title: "Sales received as Friends & Family",
    plain: "Payments for goods or services were sent as Friends & Family. PayPal's terms require Goods & Services for sales, so it reviews accounts that receive them.",
    docs: ["What was sold and to whom", "Confirmation you now ask buyers for Goods & Services"],
  },
  new_countries: {
    title: "Payments from new regions",
    plain: "You suddenly started receiving money from countries you haven't before. PayPal checks this pattern because stolen accounts often look like it.",
    docs: ["Contracts or emails with the new clients"],
  },
  large_single: {
    title: "Unusually large payments",
    plain: "A few payments were much larger than your usual ones, which can trigger a routine review.",
    docs: ["Invoices for the large payments"],
  },
};

/** Demo simulator: the sandbox can't limit an account, so this fires the event. */
export async function simulateLimitation(userId: Persona, reasonCode?: string) {
  const r = riskFor(userId);
  const code = reasonCode || r.signals[0]?.id || "volume_spike";
  mutate((d) => {
    d.accountState[userId] = { limited: true, limitedAt: nowIso(), reasonCode: code };
  });
  const reason = REASON_TEXT[code] ?? REASON_TEXT.volume_spike;
  await notify(userId, {
    kind: "freeze", email: true, link: "/get-paid/account",
    title: "Your PayPal account was limited — here's why",
    body: `${reason.title}. ${reason.plain} Your money is safe but on hold. Open Shield to see the exact payments involved and send the ready-made appeal.`,
  });
  return explainLimitation(userId);
}

export function liftLimitation(userId: Persona) {
  mutate((d) => {
    d.accountState[userId] = { limited: false };
  });
}

export async function explainLimitation(userId: Persona) {
  const state = db().accountState[userId];
  const r = riskFor(userId);
  const code = state?.reasonCode || r.signals[0]?.id || "volume_spike";
  const reason = REASON_TEXT[code] ?? REASON_TEXT.volume_spike;
  const txs = db().transactions;
  const related = r.signals.flatMap((s) => s.evidence).slice(0, 8).map((id) => txs.find((t) => t.id === id)!).filter(Boolean);
  const user = db().users.find((u) => u.id === userId)!;
  let appeal = `Hello PayPal team,\n\nMy account (${user.email}) was limited on ${state?.limitedAt ? new Date(state.limitedAt).toDateString() : "recently"} for "${reason.title.toLowerCase()}". I'm a freelance designer and this activity is legitimate:\n\n${r.signals.map((s) => `- ${s.detail} ${s.id === "volume_spike" ? "This was a planned launch week with new clients." : ""}`.trim()).join("\n")}\n\nI've attached ${reason.docs.join(", ").toLowerCase()}. ${r.signals.some((s) => s.id === "ff_for_goods") ? "I've also stopped accepting Friends & Family for sales and now invoice every buyer. " : ""}Please let me know if you need anything else to restore access.\n\nThank you,\n${user.name}`;
  const ai = await complete(
    "You improve appeal letters to PayPal for small sellers. Keep every fact. Be concise, specific and polite. Return only the letter.",
    [{ role: "user", content: appeal }],
    { maxTokens: 500 },
  );
  if (ai && ai.includes(user.name)) appeal = ai.trim();
  return { limited: !!state?.limited, limitedAt: state?.limitedAt, code, reason, signals: r.signals, related, appeal, score: r.score };
}

/** Re-notify after 24h and 72h when a freeze alert is still unread. */
export async function renotifyUnread(): Promise<number> {
  let sent = 0;
  const t = now();
  const log: string[] = [];
  for (const n of db().notifications.filter((x) => x.kind === "freeze" && !x.read)) {
    const attempt = n.attempt ?? 1;
    const age = (t.getTime() - new Date(n.at).getTime()) / HOUR;
    const due = (attempt === 1 && age >= 24) || (attempt === 2 && age >= 48);
    if (!due) continue;
    // One failed re-alert (e.g. the email provider) never stops the others.
    await perRecord("renotify", n.id, async () => {
      mutate((d) => {
        d.notifications.find((x) => x.id === n.id)!.read = true; // superseded by the re-notification
      });
      await notify(n.userId, { kind: "freeze", email: true, link: n.link, attempt: attempt + 1, title: `Reminder: ${n.title}`, body: n.body });
      sent++;
    }, log);
  }
  return sent;
}
