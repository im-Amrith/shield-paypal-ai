import { describe, it, expect, beforeEach, vi } from "vitest";

// Spy on the PayPal client: payments made through PayPal must never be recorded on PayPal again.
const { recordInvoicePayment } = vi.hoisted(() => ({ recordInvoicePayment: vi.fn(async () => ({ status: "PAID" })) }));
vi.mock("@/lib/paypal", async (orig) => ({ ...(await orig<typeof import("@/lib/paypal")>()), recordInvoicePayment }));

import { resetDB, db } from "@/lib/store";
import { advanceClock, DAY } from "@/lib/clock";
import { createInvoice, runCollections, recordPayment } from "@/lib/collections";
import { POST } from "@/app/api/paypal/webhook/route";

const input = {
  clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.demo", relationship: "regular" as const,
  items: [{ name: "Brand identity", amount: 800 }], currency: "USD", dueInDays: 14, lateFeePercent: 2, offerPayLater: true,
};
const byId = (id: string) => db().invoices.find((i) => i.id === id)!;

function paid(paypalInvoiceId: string, nested = false) {
  const resource = nested ? { invoice: { id: paypalInvoiceId } } : { id: paypalInvoiceId };
  return new Request("http://localhost/api/paypal/webhook", { method: "POST", body: JSON.stringify({ event_type: "INVOICING.INVOICE.PAID", resource }) });
}

/** An 800 USD invoice taken past the final notice, so it has its 16 USD late-fee invoice. */
async function withFee() {
  const inv = await createInvoice("meera", input);
  for (let d = 0; d < 29; d++) {
    advanceClock(DAY);
    await runCollections();
  }
  return { orig: byId(inv.id), fee: byId(byId(inv.id).feeInvoiceId!) };
}

describe("PayPal invoice webhook", () => {
  beforeEach(() => {
    resetDB();
    recordInvoicePayment.mockClear();
  });

  it("a paid event for the fee invoice pays the fee invoice, not the original", async () => {
    const { orig, fee } = await withFee();
    expect(fee.paypalInvoiceId).not.toBe(orig.paypalInvoiceId);
    const res = await POST(paid(fee.paypalInvoiceId!));
    expect(res.status).toBe(200);
    expect(byId(fee.id).status).toBe("paid");
    expect(byId(orig.id).status).toBe("sent");
    expect(byId(orig.id).amountPaid).toBe(0);
    expect(recordInvoicePayment).not.toHaveBeenCalled();
  });

  it("a paid event for the original (older nested payload) pays the original only", async () => {
    const { orig, fee } = await withFee();
    await POST(paid(orig.paypalInvoiceId!, true));
    expect(byId(orig.id).status).toBe("paid");
    expect(byId(fee.id).status).toBe("sent");
    expect(recordInvoicePayment).not.toHaveBeenCalled();
  });

  it("a repeated event doesn't pay twice, and an unknown id changes nothing", async () => {
    const { orig } = await withFee();
    await POST(paid(orig.paypalInvoiceId!));
    await POST(paid(orig.paypalInvoiceId!));
    expect(byId(orig.id).amountPaid).toBe(800);
    expect(db().transactions.filter((t) => t.memo === orig.id)).toHaveLength(1);
    const before = JSON.stringify(db().invoices);
    await POST(paid("INV2-NOPE"));
    expect(JSON.stringify(db().invoices)).toBe(before);
  });

  it("a payment made outside PayPal (Shield's pay page) is recorded on PayPal, against the right invoice", async () => {
    const { orig, fee } = await withFee();
    await recordPayment(fee.id, 16);
    expect(recordInvoicePayment).toHaveBeenCalledTimes(1);
    expect(recordInvoicePayment.mock.calls[0]).toEqual(expect.arrayContaining([fee.paypalInvoiceId, 16, "USD"]));
    expect(byId(orig.id).amountPaid).toBe(0);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(new Request("http://localhost/api/paypal/webhook", { method: "POST", body: "{nope" }));
    expect(res.status).toBe(400);
  });
});
