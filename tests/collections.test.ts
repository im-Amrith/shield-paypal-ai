import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, DAY, now } from "@/lib/clock";
import { createInvoice, runCollections, recordPayment, nextStep, balance, createLateFeeInvoice, debtPair } from "@/lib/collections";

const byId = (id: string) => db().invoices.find((i) => i.id === id)!;

const input = {
  clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.example", relationship: "regular" as const,
  items: [{ name: "Brand identity", amount: 800 }], currency: "USD", dueInDays: 14, lateFeePercent: 2, offerPayLater: true,
};

describe("Collections agent", () => {
  beforeEach(() => resetDB());

  it("does nothing before the due date for regular clients", async () => {
    await createInvoice("meera", input);
    advanceClock(13 * DAY);
    expect(await runCollections()).toEqual([]);
  });
  it("sends a heads-up before the due date only to new clients", async () => {
    await createInvoice("meera", { ...input, relationship: "new" });
    advanceClock(12.5 * DAY);
    expect(await runCollections()).toEqual(["INV-1001:heads_up"]);
  });
  it("climbs the ladder, applies the agreed late fee, then hands back", async () => {
    const inv = await createInvoice("meera", input);
    const steps: string[] = [];
    for (let d = 0; d < 40; d++) {
      advanceClock(DAY);
      steps.push(...(await runCollections()));
    }
    expect(steps).toEqual([`${inv.id}:friendly`, `${inv.id}:firm`, `${inv.id}:final`, `${inv.id}:handoff`]);
    const after = byId(inv.id);
    expect(after.lateFeeApplied).toBe(true);
    expect(balance(after)).toBe(800); // the original invoice is never rewritten
    expect(balance(byId(after.feeInvoiceId!))).toBeCloseTo(16, 2);
    expect(db().outbox.filter((o) => o.to === input.clientEmail)).toHaveLength(3);
  });
  it("never adds a late fee that wasn't agreed", async () => {
    await createInvoice("meera", { ...input, lateFeePercent: 0 });
    for (let d = 0; d < 30; d++) {
      advanceClock(DAY);
      await runCollections();
    }
    expect(db().invoices[0].lateFeeApplied).toBeFalsy();
    expect(db().invoices[0].feeInvoiceId).toBeUndefined();
    expect(db().invoices).toHaveLength(1); // no fee invoice was created
    expect(balance(db().invoices[0])).toBe(800);
  });
  it("stops chasing once paid", async () => {
    const inv = await createInvoice("meera", input);
    advanceClock(16 * DAY);
    await runCollections();
    await recordPayment(inv.id, 800);
    advanceClock(20 * DAY);
    expect(await runCollections()).toEqual([]);
    expect(db().invoices[0].status).toBe("paid");
  });
  it("tracks part payments and keeps reminding about the balance", async () => {
    const inv = await createInvoice("meera", input);
    await recordPayment(inv.id, 300);
    expect(db().invoices[0].status).toBe("partially_paid");
    advanceClock(16 * DAY);
    const log = await runCollections();
    expect(log).toEqual([`${inv.id}:friendly`]);
    expect(db().invoices[0].reminders[0].body).toContain("500.00");
  });
  it("respects the minimum gap between reminders", () => {
    const inv = { ...db().invoices[0], id: "X", status: "sent" as const, dueAt: new Date(now().getTime() - 10 * DAY).toISOString(),
      reminders: [{ at: new Date(now().getTime() - DAY).toISOString(), step: 1, tone: "friendly", subject: "", body: "" }],
      items: [{ name: "a", amount: 1 }], amountPaid: 0, relationship: "regular" as const, lateFeePercent: 0 } as never;
    expect(nextStep(inv, now())).toBeNull();
  });
  it("rejects bad input", async () => {
    await expect(createInvoice("meera", { ...input, items: [] })).rejects.toThrow();
    await expect(createInvoice("meera", { ...input, lateFeePercent: 25 })).rejects.toThrow();
  });
});

describe("Late fee as a separate invoice", () => {
  beforeEach(() => resetDB());

  /** Run the agent day by day; returns everything it logged. */
  async function runDays(days: number) {
    const log: string[] = [];
    for (let d = 0; d < days; d++) {
      advanceClock(DAY);
      log.push(...(await runCollections()));
    }
    return log;
  }

  it("creates the fee invoice exactly once, at the final step", async () => {
    const inv = await createInvoice("meera", input);
    await runDays(27); // due day 14; firm at +7 (day 21) — no fee yet
    expect(byId(inv.id).feeInvoiceId).toBeUndefined();
    await runDays(2); // final at +14 (day 28)
    const fee = byId(byId(inv.id).feeInvoiceId!);
    expect(fee.feeFor).toBe(inv.id);
    expect(fee.items).toEqual([{ name: `Late fee — 2% of ${inv.id}, per agreed terms`, amount: 16 }]);
    expect(fee.clientEmail).toBe(input.clientEmail);
    expect(fee.paypalInvoiceId).toBeTruthy();
    expect(Math.round((new Date(fee.dueAt).getTime() - now().getTime()) / DAY)).toBe(6); // due 7 days after it was sent (one day ago)
    expect(byId(inv.id).items).toEqual(input.items); // original untouched
    // More runs, and a direct second call, never make another one.
    await runDays(20);
    expect(await createLateFeeInvoice(inv.id)).toBeNull();
    expect(db().invoices.filter((i) => i.feeFor === inv.id)).toHaveLength(1);
    // The final notice names the fee invoice.
    const final = byId(inv.id).reminders.find((r) => r.tone === "final")!;
    expect(final.body).toContain(fee.id);
  });

  it("never creates a fee invoice when no fee was agreed", async () => {
    const inv = await createInvoice("meera", { ...input, lateFeePercent: 0 });
    await runDays(40);
    expect(await createLateFeeInvoice(inv.id)).toBeNull();
    expect(db().invoices.some((i) => i.feeFor)).toBe(false);
  });

  it("paying only the original keeps chasing the fee", async () => {
    const inv = await createInvoice("meera", input);
    await runDays(29);
    const feeId = byId(inv.id).feeInvoiceId!;
    await recordPayment(inv.id, 800);
    expect(byId(inv.id).status).toBe("paid");
    expect(nextStep(byId(inv.id), new Date(now().getTime() + 7 * DAY), byId(feeId))?.tone).toBe("handoff");
    const log = await runDays(10);
    expect(log).toEqual([`${inv.id}:handoff`]);
    expect(balance(byId(feeId))).toBe(16);
  });

  it("paying both stops all reminders", async () => {
    const inv = await createInvoice("meera", input);
    await runDays(29);
    const feeId = byId(inv.id).feeInvoiceId!;
    await recordPayment(feeId, 16);
    expect(byId(inv.id).status).toBe("sent"); // a fee payment is recorded on the fee invoice only
    await recordPayment(inv.id, 800);
    expect(debtPair(byId(feeId)).original.id).toBe(inv.id);
    expect(await runDays(20)).toEqual([]);
    expect(byId(feeId).reminders).toHaveLength(0); // the fee invoice is never chased on its own
  });
});
