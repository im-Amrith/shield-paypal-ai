import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, DAY, now } from "@/lib/clock";
import { createInvoice, runCollections, recordPayment, nextStep, balance } from "@/lib/collections";

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
    const after = db().invoices[0];
    expect(after.lateFeeApplied).toBe(true);
    expect(balance(after)).toBeCloseTo(816, 2);
    expect(db().outbox.filter((o) => o.to === input.clientEmail)).toHaveLength(3);
  });
  it("never adds a late fee that wasn't agreed", async () => {
    await createInvoice("meera", { ...input, lateFeePercent: 0 });
    for (let d = 0; d < 30; d++) {
      advanceClock(DAY);
      await runCollections();
    }
    expect(db().invoices[0].lateFeeApplied).toBeFalsy();
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
