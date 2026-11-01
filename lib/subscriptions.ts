// Subscription finder: detects recurring charges in payment history and
// drafts the vendor-side cancellation email for the user to send.
// Note: PayPal has no public API for a consumer app to list a person's
// automatic payments across merchants, and cancelling on vendors' own sites
// needs their logins (2FA, CAPTCHAs, ToS), so that part is out of scope.
import type { Transaction } from "./types";
import { DAY } from "./clock";

export interface Recurring {
  merchant: string;
  amount: number;
  currency: string;
  cadenceDays: number;
  count: number;
  lastAt: string;
  yearlyCost: number;
  forgotten: boolean; // no recent mention / long-running with no other activity
}

export function findRecurring(txs: Transaction[], at: Date): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs.filter((x) => x.direction === "out" && x.type !== "refund")) {
    const key = t.counterparty.toLowerCase();
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const out: Recurring[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    const amounts = sorted.map((t) => t.amount);
    const sameAmount = Math.max(...amounts) - Math.min(...amounts) <= Math.max(1, 0.05 * amounts[0]);
    if (!sameAmount) continue;
    const gaps = sorted.slice(1).map((t, i) => (new Date(t.at).getTime() - new Date(sorted[i].at).getTime()) / DAY);
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const regular = gaps.every((g) => Math.abs(g - avg) <= Math.max(4, avg * 0.15));
    const cadence = [7, 30, 91, 365].find((c) => Math.abs(avg - c) <= Math.max(4, c * 0.12));
    if (!regular || !cadence) continue;
    const last = sorted[sorted.length - 1];
    const sinceLast = (at.getTime() - new Date(last.at).getTime()) / DAY;
    if (sinceLast > cadence * 1.6) continue; // stopped already
    out.push({
      merchant: last.counterparty,
      amount: last.amount,
      currency: last.currency,
      cadenceDays: cadence,
      count: sorted.length,
      lastAt: last.at,
      yearlyCost: +((365 / cadence) * last.amount).toFixed(2),
      forgotten: sorted.length >= 3,
    });
  }
  return out.sort((a, b) => b.yearlyCost - a.yearlyCost);
}

export function cancellationEmail(r: Recurring, name: string, email: string): { subject: string; body: string } {
  return {
    subject: `Cancel my subscription and stop all future charges`,
    body: `Hello ${r.merchant} team,\n\nPlease cancel my subscription linked to ${email}, effective immediately, and confirm in writing that no further charges will be made. I've also cancelled the automatic payment in PayPal.\n\nI was last charged ${r.currency} ${r.amount.toFixed(2)} on ${new Date(r.lastAt).toDateString()}.\n\nThank you,\n${name}`,
  };
}
