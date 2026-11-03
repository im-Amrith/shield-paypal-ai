// Collections agent: sends the PayPal invoice, then chases late payment on a
// bounded escalation ladder so the freelancer never writes a chase message.
import type { Invoice, Persona } from "./types";
import { db, mutate, uid } from "./store";
import { DAY, daysBetween, now, nowIso } from "./clock";
import * as paypal from "./paypal";
import { onPayPal, linkOf, linkNote, stampLink, noteSkip, perRecord, type PayPalLink } from "./paypalLink";
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

const isOpen = (inv?: Invoice) => !!inv && (inv.status === "sent" || inv.status === "partially_paid");

/**
 * An invoice and its late-fee invoice (if any), from either side. The collections agent treats
 * the pair as one debt: it chases until both are paid.
 */
export function debtPair(inv: Invoice): { original: Invoice; fee?: Invoice } {
  const all = db().invoices;
  const original = inv.feeFor ? all.find((i) => i.id === inv.feeFor) ?? inv : inv;
  const fee = original.feeInvoiceId ? all.find((i) => i.id === original.feeInvoiceId) : undefined;
  return { original, fee };
}

/** What is still owed across the pair. */
export function debtBalance(original: Invoice, fee?: Invoice): number {
  return +((isOpen(original) ? balance(original) : 0) + (isOpen(fee) ? balance(fee!) : 0)).toFixed(2);
}

export function total(inv: Invoice): number {
  return +inv.items.reduce((s, i) => s + i.amount, 0).toFixed(2);
}
export function balance(inv: Invoice): number {
  return +(total(inv) - inv.amountPaid).toFixed(2);
}

/**
 * Which ladder step (if any) is due now. Pure function: easy to test. Pass the invoice's late-fee
 * invoice as `fee` once there is one: the ladder keeps going until both are paid. Late-fee
 * invoices are never chased on their own; their original carries the ladder.
 */
export function nextStep(inv: Invoice, at: Date, fee?: Invoice): LadderStep | null {
  if (inv.feeFor) return null;
  if (inv.status === "cancelled" || inv.status === "disputed" || inv.status === "draft") return null;
  if (!isOpen(inv) && !isOpen(fee)) return null; // everything paid: stop
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

/**
 * The agreed late fee: lateFeePercent of the balance still unpaid when it's applied (the final
 * reminder), as the invoice terms say ("applies to balances unpaid 14 days after the due date").
 * A client who already paid part owes the fee on the rest only.
 */
export function lateFee(inv: Invoice): number {
  return inv.lateFeePercent > 0 ? +((Math.max(0, balance(inv)) * inv.lateFeePercent) / 100).toFixed(2) : 0;
}

export function draftReminder(inv: Invoice, step: LadderStep, freelancerName: string, fee?: Invoice): { subject: string; body: string } {
  const first = inv.clientName.split(/[ (]/)[0];
  const amt = `${inv.currency} ${debtBalance(inv, fee).toFixed(2)}`;
  const due = new Date(inv.dueAt).toDateString();
  const warm = inv.relationship !== "new";
  const payOpts = `You can pay by card or PayPal${inv.offerPayLater ? ", split it with Pay Later," : ""} or pay part now and the rest later — whatever is easiest.`;
  const feeAmt = lateFee(inv);
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
        body: `Hi ${first},\n\nInvoice ${inv.id} for ${amt} is now a week overdue. Could you let me know when it will be paid, or if anything is holding it up? ${payOpts}${feeAmt ? `\n\nAs agreed in the invoice terms, a ${inv.lateFeePercent}% late fee applies from day 14.` : ""}\n\nBest,\n${freelancerName}`,
      };
    case "final":
      return {
        subject: `Final notice: invoice ${inv.id}`,
        body: `Hi ${first},\n\nInvoice ${inv.id} is now two weeks overdue.${fee ? ` Per the agreed terms, a late fee of ${inv.currency} ${total(fee).toFixed(2)} has been invoiced separately as ${fee.id}.` : ""} Please settle the balance${fee ? ` of ${amt} across both invoices` : ""} within 7 days. If there's a problem with the work or the amount, reply and we'll sort it out together. ${payOpts}\n\nRegards,\n${freelancerName}`,
      };
    case "handoff":
      return { subject: `Invoice ${inv.id}: next steps`, body: `Automated reminders have stopped for invoice ${inv.id}${fee ? ` and late-fee invoice ${fee.id}` : ""}. ${freelancerName} will follow up personally.` };
  }
}

async function polish(draft: { subject: string; body: string }, inv: Invoice, tone: string, fee?: Invoice) {
  const text = await complete(
    `You rewrite payment reminder emails for a freelancer. Keep every fact, amount, date and invoice number exactly. Tone: ${tone}; relationship: ${inv.relationship}. Polite, never threatening, under 120 words. Return only the email body.`,
    [{ role: "user", content: draft.body }],
    { maxTokens: 300 },
  );
  // Guard: reject rewrites that drop the amount or invoice id.
  if (text && text.includes(inv.id) && text.includes(debtBalance(inv, fee).toFixed(2)) && (!fee || text.includes(fee.id))) return { ...draft, body: text.trim() };
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
    paypalLink: stampLink(),
  };
  mutate((d) => {
    d.invoices.unshift(inv);
  });
  return inv;
}

/**
 * Create and send the separate late-fee invoice for `inv`, once. The original PayPal invoice is
 * never rewritten: the fee is its own PayPal invoice (same client, due in 7 days, note pointing
 * at the original). Never when no fee was agreed, never twice. The id is reserved before the
 * PayPal call so overlapping job runs can't both create one; a PayPal failure releases it.
 */
export async function createLateFeeInvoice(invoiceId: string): Promise<Invoice | null> {
  const inv = db().invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.feeFor || inv.lateFeePercent <= 0) return null;
  const amount = lateFee(inv);
  if (!(amount > 0)) return null;
  const feeId = mutate((d) => {
    const o = d.invoices.find((i) => i.id === invoiceId)!;
    if (o.feeInvoiceId || d.invoices.some((i) => i.feeFor === invoiceId)) return null;
    o.feeInvoiceId = `INV-${(d.invoices.length + 1001).toString()}`;
    return o.feeInvoiceId;
  });
  if (!feeId) return null;
  const due = new Date(now().getTime() + 7 * DAY);
  const itemName = `Late fee — ${inv.lateFeePercent}% of ${inv.id}, per agreed terms`;
  // The original isn't on the current PayPal account (or PayPal lost it): the fee invoice is kept
  // in Shield only, with the same note, instead of a PayPal invoice that points at nothing.
  const origLink = invoiceLink(inv);
  const offPayPal = linkNote(origLink);
  let pp: Awaited<ReturnType<typeof paypal.createAndSendInvoice>> | null = null;
  if (offPayPal) noteSkip(inv.id, `late-fee invoice kept in Shield (${offPayPal.toLowerCase()})`);
  else try {
    pp = await paypal.createAndSendInvoice({
      number: `${feeId}-${Date.now().toString(36)}`, clientEmail: inv.clientEmail, clientName: inv.clientName, currency: inv.currency,
      items: [{ name: itemName, amount }], dueDate: due.toISOString().slice(0, 10),
      note: `Late fee for invoice ${inv.id}, as agreed in its terms. Invoice ${inv.id} is billed separately.`,
      terms: `Payment due by ${due.toDateString()}.`,
    });
  } catch (e) {
    mutate((d) => {
      delete d.invoices.find((i) => i.id === invoiceId)!.feeInvoiceId;
    });
    throw e;
  }
  const fee: Invoice = {
    id: feeId, freelancerId: inv.freelancerId, clientName: inv.clientName, clientEmail: inv.clientEmail, relationship: inv.relationship,
    items: [{ name: itemName, amount }], currency: inv.currency, issuedAt: nowIso(), dueAt: due.toISOString(), lateFeePercent: 0,
    status: "sent", amountPaid: 0, paypalInvoiceId: pp?.invoiceId, payLink: pp?.link, reminders: [], offerPayLater: inv.offerPayLater, feeFor: inv.id,
    paypalLink: pp ? stampLink() : origLink,
  };
  mutate((d) => {
    d.invoices.unshift(fee);
    d.invoices.find((i) => i.id === invoiceId)!.lateFeeApplied = true;
  });
  return fee;
}

/**
 * Background job: send whichever reminders are due. Idempotent. Each invoice runs on its own: one
 * failing invoice never stops the others. PayPal reminders go only to invoices on the current
 * PayPal account; Shield's own reminder email goes out either way.
 */
export async function runCollections(): Promise<string[]> {
  const log: string[] = [];
  const at = now();
  for (const listed of db().invoices) {
    if (listed.feeFor) continue; // chased together with its original
    await perRecord("collections", listed.id, () => remindOne(listed.id, at, log), log);
  }
  return log;
}

async function remindOne(invoiceId: string, at: Date, log: string[]): Promise<void> {
  const inv = db().invoices.find((i) => i.id === invoiceId)!;
  const step = nextStep(inv, at, debtPair(inv).fee);
  if (!step) return;
  const freelancer = db().users.find((u) => u.id === inv.freelancerId)!;
  if (step.tone === "handoff") {
    mutate((d) => {
      d.invoices.find((i) => i.id === inv.id)!.reminders.push({ at: nowIso(), step: step.step, tone: step.tone, subject: "Handed back to you", body: "" });
    });
    await notify(inv.freelancerId, { kind: "invoice", title: `${inv.id} is 3 weeks overdue`, body: `Reminders stopped after ${inv.reminders.length} attempts. Options: call ${inv.clientName}, offer a payment plan, or escalate.`, link: `/get-paid`, email: true });
    log.push(`${inv.id}:handoff`);
    return;
  }
  let justCreated: Invoice | null = null;
  if (step.tone === "final" && inv.lateFeePercent > 0 && isOpen(inv) && !inv.feeInvoiceId) {
    try {
      justCreated = await createLateFeeInvoice(inv.id);
    } catch (e) {
      // Retry on the next run: the final notice shouldn't go out without the fee invoice it names.
      console.error(`[collections] late-fee invoice for ${inv.id} failed:`, (e as Error).message);
      log.push(`${inv.id}:fee_failed`);
      return;
    }
  }
  const fresh = db().invoices.find((i) => i.id === inv.id)!;
  const fee = debtPair(fresh).fee;
  const msg = await polish(draftReminder(fresh, step, freelancer.name, fee), fresh, step.tone, fee);
  if (fresh.paypalInvoiceId && isOpen(fresh))
    await onPayPal(fresh.id, invoiceLink(fresh), markInvoice(fresh.id), () => paypal.remindInvoice(fresh.paypalInvoiceId!, msg.subject, msg.body));
  // A fee invoice PayPal just sent doesn't need a PayPal reminder in the same run.
  if (fee?.paypalInvoiceId && isOpen(fee) && fee.id !== justCreated?.id)
    await onPayPal(fee.id, invoiceLink(fee), markInvoice(fee.id), () => paypal.remindInvoice(fee.paypalInvoiceId!, msg.subject, msg.body));
  await sendEmail(fresh.clientEmail, msg.subject, msg.body);
  mutate((d) => {
    d.invoices.find((i) => i.id === inv.id)!.reminders.push({ at: nowIso(), step: step.step, tone: step.tone, ...msg });
  });
  log.push(`${inv.id}:${step.tone}`);
}

/** The invoice's PayPal account link, and how to store a change to it. */
const invoiceLink = (inv: Invoice) => linkOf(inv, inv.paypalInvoiceId);
const markInvoice = (id: string) => (link: PayPalLink) => mutate((d) => { d.invoices.find((i) => i.id === id)!.paypalLink = link; });

/** For pages: why PayPal isn't used for this invoice, or null. */
export function invoiceLinkNote(inv: Invoice): string | null {
  return inv.paypalInvoiceId || inv.paypalLink ? linkNote(invoiceLink(inv)) : null;
}

/**
 * Record a payment on an invoice. `paidThroughPayPal` is set by the webhook: PayPal already
 * recorded that payment on its invoice, so recording it again there would double it.
 */
export async function recordPayment(invoiceId: string, amount: number, opts: { paidThroughPayPal?: boolean } = {}) {
  const inv = db().invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (!(amount > 0) || amount > balance(inv) + 0.001) throw new Error("Invalid payment amount");
  if (inv.paypalInvoiceId && !opts.paidThroughPayPal)
    await onPayPal(inv.id, invoiceLink(inv), markInvoice(inv.id),
      () => paypal.recordInvoicePayment(inv.paypalInvoiceId!, amount, inv.currency, `${inv.amountPaid.toFixed(2)}+${amount.toFixed(2)}`))
      .catch((e) => console.error(`[collections] recording ${inv.id}'s payment on PayPal failed:`, (e as Error).message));
  mutate((d) => {
    const i = d.invoices.find((x) => x.id === invoiceId)!;
    i.amountPaid = +(i.amountPaid + amount).toFixed(2);
    i.status = balance(i) <= 0.001 ? "paid" : "partially_paid";
    d.transactions.push({ id: uid("tx"), userId: i.freelancerId, at: nowIso(), amount, currency: i.currency, direction: "in",
      counterparty: i.clientName, country: "US", type: "invoice", memo: i.id });
  });
  const fresh = db().invoices.find((i) => i.id === invoiceId)!;
  const { original, fee } = debtPair(fresh);
  const left = debtBalance(original, fee);
  const other = fresh.id === original.id ? fee : original;
  const title = fresh.status !== "paid" ? `Part payment on ${fresh.id}` : left > 0 && other ? `${fresh.id} paid; ${other.id} still open` : `${original.id}${fee ? ` and ${fee.id}` : ""} paid in full`;
  await notify(fresh.freelancerId, { kind: "invoice", title, body: `${fresh.clientName} paid ${fresh.currency} ${amount.toFixed(2)}.${left > 0 && other ? ` ${fresh.currency} ${left.toFixed(2)} left on ${other.id}.` : ""}`, link: "/get-paid" });
  return fresh;
}
