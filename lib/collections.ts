// Collections agent: sends the PayPal invoice, then chases late payment on a
// bounded escalation ladder so the freelancer never writes a chase message.
import type { Invoice, Persona } from "./types";
import { db, mutate, uid } from "./store";
import { DAY, daysBetween, now, nowIso } from "./clock";
import * as paypal from "./paypal";
import { complete } from "./llm";
import { notify, sendEmail } from "./notify";

export interface LadderStep {
  step: number;
  offsetDays: number; // relative to the due date
  tone: "heads_up" | "friendly" | "firm" | "final" | "handoff";
}

export const LADDER: LadderStep[] = [
  { step: 0, offsetDays: -2, tone: "heads_up" },
  { step: 1, offsetDays: 1, tone: "friendly" },
  { step: 2, offsetDays: 7, tone: "firm" },
  { step: 3, offsetDays: 14, tone: "final" },
  { step: 4, offsetDays: 21, tone: "handoff" },
];

export const MIN_GAP_DAYS = 3; // never contact a client more often than this
export const MAX_REMINDERS = 5; // ladder entries incl. heads-up and the handoff; then a human decides

export function total(inv: Invoice): number {
  return +inv.items.reduce((s, i) => s + i.amount, 0).toFixed(2);
}
export function balance(inv: Invoice): number {
  return +(total(inv) - inv.amountPaid).toFixed(2);
}

/** Which ladder step (if any) is due now. Pure function: easy to test. */
export function nextStep(inv: Invoice, at: Date): LadderStep | null {
  if (inv.status !== "sent" && inv.status !== "partially_paid") return null; // paid / cancelled / disputed: stop
  if (inv.reminders.length >= MAX_REMINDERS) return null;
  const last = inv.reminders[inv.reminders.length - 1];
  if (last && daysBetween(last.at, at) < MIN_GAP_DAYS) return null;
  const sinceDue = daysBetween(inv.dueAt, at);
  const doneSteps = new Set(inv.reminders.map((r) => r.step));
  const candidates = LADDER.filter((s) => !doneSteps.has(s.step) && sinceDue >= s.offsetDays && s.step > (last?.step ?? -1));
  // Heads-up only for new clients, and only before the due date.
  const filtered = candidates.filter((s) => s.tone !== "heads_up" || (inv.relationship === "new" && sinceDue < 0));
  return filtered.length ? filtered[filtered.length - 1] : null;
}

export function lateFee(inv: Invoice): number {
  return inv.lateFeePercent > 0 ? +((total(inv) * inv.lateFeePercent) / 100).toFixed(2) : 0;
}

export function draftReminder(inv: Invoice, step: LadderStep, freelancerName: string): { subject: string; body: string } {
  const first = inv.clientName.split(/[ (]/)[0];
  const amt = `${inv.currency} ${balance(inv).toFixed(2)}`;
  const due = new Date(inv.dueAt).toDateString();
  const warm = inv.relationship !== "new";
  const payOpts = `You can pay by card or PayPal${inv.offerPayLater ? ", split it with Pay Later," : ""} or pay part now and the rest later — whatever is easiest.`;
  const fee = lateFee(inv);
  switch (step.tone) {
    case "heads_up":
      return { subject: `Invoice ${inv.id} is due on ${due}`, body: `Hi ${first},\n\nA quick heads-up that invoice ${inv.id} for ${amt} is due on ${due}. ${payOpts}\n\nThanks,\n${freelancerName}` };
    case "friendly":
      return {
        subject: `Friendly reminder: invoice ${inv.id}`,
        body: `Hi ${first},\n\n${warm ? "Hope the project is landing well on your side! " : ""}Invoice ${inv.id} for ${amt} was due on ${due}. It probably just slipped through. ${payOpts}\n\nThanks so much,\n${freelancerName}`,
      };
    case "firm":
      return {
        subject: `Overdue: invoice ${inv.id} (${amt})`,
        body: `Hi ${first},\n\nInvoice ${inv.id} for ${amt} is now a week overdue. Could you let me know when it will be paid, or if anything is holding it up? ${payOpts}${fee ? `\n\nAs agreed in the invoice terms, a ${inv.lateFeePercent}% late fee applies from day 14.` : ""}\n\nBest,\n${freelancerName}`,
      };
    case "final":
      return {
        subject: `Final notice: invoice ${inv.id}`,
        body: `Hi ${first},\n\nInvoice ${inv.id} is now two weeks overdue.${fee ? ` Per the agreed terms, a late fee of ${inv.currency} ${fee.toFixed(2)} has been added.` : ""} Please settle the balance within 7 days. If there's a problem with the work or the amount, reply and we'll sort it out together. ${payOpts}\n\nRegards,\n${freelancerName}`,
      };
    case "handoff":
      return { subject: `Invoice ${inv.id}: next steps`, body: `Automated reminders have stopped for invoice ${inv.id}. ${freelancerName} will follow up personally.` };
  }
}

async function polish(draft: { subject: string; body: string }, inv: Invoice, tone: string) {
  const text = await complete(
    `You rewrite payment reminder emails for a freelancer. Keep every fact, amount, date and invoice number exactly. Tone: ${tone}; relationship: ${inv.relationship}. Polite, never threatening, under 120 words. Return only the email body.`,
    [{ role: "user", content: draft.body }],
    { maxTokens: 300 },
  );
  // Guard: reject rewrites that drop the amount or invoice id.
  if (text && text.includes(inv.id) && text.includes(balance(inv).toFixed(2))) return { ...draft, body: text.trim() };
  return draft;
}

export async function createInvoice(freelancerId: Persona, input: {
  clientName: string; clientEmail: string; relationship: Invoice["relationship"]; items: { name: string; amount: number }[];
  currency: string; dueInDays: number; lateFeePercent: number; offerPayLater: boolean;
}): Promise<Invoice> {
  if (!input.items.length || input.items.some((i) => !(i.amount > 0))) throw new Error("Add at least one item with an amount");
  if (input.lateFeePercent < 0 || input.lateFeePercent > 10) throw new Error("Late fee must be 0–10%");
  const freelancer = db().users.find((u) => u.id === freelancerId)!;
  const id = `INV-${(db().invoices.length + 1001).toString()}`;
  const due = new Date(now().getTime() + input.dueInDays * DAY);
  const terms = `Payment due by ${due.toDateString()}.${input.lateFeePercent ? ` A late fee of ${input.lateFeePercent}% applies to balances unpaid 14 days after the due date.` : ""} Partial payments accepted.`;
  const pp = await paypal.createAndSendInvoice({
    number: `${id}-${Date.now().toString(36)}`, clientEmail: input.clientEmail, clientName: input.clientName, currency: input.currency,
    items: input.items, dueDate: due.toISOString().slice(0, 10), note: `From ${freelancer.name}. Thank you!`, terms,
  });
  const inv: Invoice = {
    id, freelancerId, clientName: input.clientName, clientEmail: input.clientEmail, relationship: input.relationship,
    items: input.items.map((i) => ({ name: i.name, amount: +i.amount })), currency: input.currency, issuedAt: nowIso(), dueAt: due.toISOString(), lateFeePercent: input.lateFeePercent,
    status: "sent", amountPaid: 0, paypalInvoiceId: pp.invoiceId, payLink: pp.link, reminders: [], offerPayLater: input.offerPayLater,
  };
  mutate((d) => {
    d.invoices.unshift(inv);
  });
  return inv;
}

/** Background job: send whichever reminders are due. Idempotent. */
export async function runCollections(): Promise<string[]> {
  const log: string[] = [];
  const at = now();
  for (const inv of db().invoices) {
    const step = nextStep(inv, at);
    if (!step) continue;
    const freelancer = db().users.find((u) => u.id === inv.freelancerId)!;
    if (step.tone === "handoff") {
      mutate((d) => {
        d.invoices.find((i) => i.id === inv.id)!.reminders.push({ at: nowIso(), step: step.step, tone: step.tone, subject: "Handed back to you", body: "" });
      });
      await notify(inv.freelancerId, { kind: "invoice", title: `${inv.id} is 3 weeks overdue`, body: `Reminders stopped after ${inv.reminders.length} attempts. Options: call ${inv.clientName}, offer a payment plan, or escalate.`, link: `/get-paid`, email: true });
      log.push(`${inv.id}:handoff`);
      continue;
    }
    if (step.tone === "final" && inv.lateFeePercent > 0 && !inv.lateFeeApplied) {
      const fee = lateFee(inv);
      mutate((d) => {
        const i = d.invoices.find((x) => x.id === inv.id)!;
        i.items.push({ name: `Late fee (${inv.lateFeePercent}%, per agreed terms)`, amount: fee });
        i.lateFeeApplied = true;
      });
    }
    const fresh = db().invoices.find((i) => i.id === inv.id)!;
    const msg = await polish(draftReminder(fresh, step, freelancer.name), fresh, step.tone);
    if (fresh.paypalInvoiceId) await paypal.remindInvoice(fresh.paypalInvoiceId, msg.subject, msg.body);
    await sendEmail(fresh.clientEmail, msg.subject, msg.body);
    mutate((d) => {
      d.invoices.find((i) => i.id === inv.id)!.reminders.push({ at: nowIso(), step: step.step, tone: step.tone, ...msg });
    });
    log.push(`${inv.id}:${step.tone}`);
  }
  return log;
}

export async function recordPayment(invoiceId: string, amount: number) {
  const inv = db().invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (!(amount > 0) || amount > balance(inv) + 0.001) throw new Error("Invalid payment amount");
  if (inv.paypalInvoiceId) await paypal.recordInvoicePayment(inv.paypalInvoiceId, amount, inv.currency).catch(() => undefined);
  mutate((d) => {
    const i = d.invoices.find((x) => x.id === invoiceId)!;
    i.amountPaid = +(i.amountPaid + amount).toFixed(2);
    i.status = balance(i) <= 0.001 ? "paid" : "partially_paid";
    d.transactions.push({ id: uid("tx"), userId: i.freelancerId, at: nowIso(), amount, currency: i.currency, direction: "in",
      counterparty: i.clientName, country: "US", type: "invoice", memo: i.id });
  });
  const fresh = db().invoices.find((i) => i.id === invoiceId)!;
  await notify(fresh.freelancerId, { kind: "invoice", title: fresh.status === "paid" ? `${fresh.id} paid in full` : `Part payment on ${fresh.id}`, body: `${fresh.clientName} paid ${fresh.currency} ${amount.toFixed(2)}.`, link: "/get-paid" });
  return fresh;
}
