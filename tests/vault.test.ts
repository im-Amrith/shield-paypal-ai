import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, HOUR, DAY } from "@/lib/clock";
import * as vault from "@/lib/vault";
import { canReauthorize, paypalCarrier } from "@/lib/vault";
import { PayPalError } from "@/lib/paypal";

async function shipped() {
  const { deal } = await vault.createDeal("meera", "Canon 200D camera", 320, "USD", 72);
  await vault.authorize(deal.id, "buyer");
  await vault.ship(deal.id, "EZ123456789IN", "India Post");
  return deal.id;
}

describe("Vault escrow", () => {
  beforeEach(() => resetDB());

  it("shows fees up front and creates the PayPal order only when the buyer pays", async () => {
    const r = await vault.createDeal("meera", "Camera", 320, "USD");
    expect(r.deal.status).toBe("created");
    expect(r.deal.paypalOrderId).toBeUndefined();
    expect(r.fees.fee).toBeGreaterThan(0);
    const first = await vault.checkoutOrder(r.deal.id, "buyer");
    const second = await vault.checkoutOrder(r.deal.id, "buyer"); // a second click: a fresh order
    expect(second.orderId).not.toBe(first.orderId);
    expect(vault.getDeal(r.deal.id)!.paypalOrderId).toBe(second.orderId);
    await expect(vault.authorize(r.deal.id, "buyer", first.orderId)).rejects.toThrow(/doesn't belong/);
    expect((await vault.authorize(r.deal.id, "buyer", second.orderId)).status).toBe("authorized");
  });
  it("the seller can't pay their own deal", async () => {
    const r = await vault.createDeal("meera", "Camera", 320, "USD");
    await expect(vault.checkoutOrder(r.deal.id, "meera")).rejects.toThrow(/seller/);
  });
  it("releases on buyer confirmation", async () => {
    const id = await shipped();
    const d = await vault.confirmReceipt(id, "buyer");
    expect(d.status).toBe("released");
    expect(d.captureId).toBeTruthy();
  });
  it("only the buyer can confirm", async () => {
    const id = await shipped();
    await expect(vault.confirmReceipt(id, "meera")).rejects.toThrow(/buyer/);
  });
  it("auto-releases after the window if the buyer stays silent", async () => {
    const id = await shipped();
    await vault.markDelivered(id);
    advanceClock(71 * HOUR);
    expect(await vault.tickVault()).toEqual([]);
    advanceClock(2 * HOUR);
    expect(await vault.tickVault()).toEqual([`released:${id}`]);
    expect(vault.getDeal(id)!.status).toBe("released");
  });
  it("a dispute freezes release; support can refund the buyer", async () => {
    const id = await shipped();
    await vault.markDelivered(id);
    await vault.dispute(id, "buyer", "Lens is cracked");
    advanceClock(5 * DAY);
    expect(await vault.tickVault()).toEqual([]);
    const d = await vault.resolveDispute(id, "refund_buyer");
    expect(d.status).toBe("voided");
  });
  it("rejects illegal transitions", async () => {
    const { deal } = await vault.createDeal("meera", "Bag", 40, "USD");
    await expect(vault.ship(deal.id, "X1", "DHL")).rejects.toThrow(/Can't ship/);
    await expect(vault.confirmReceipt(deal.id, "buyer")).rejects.toThrow();
  });
  it("expires holds that never ship within the max window", async () => {
    const { deal } = await vault.createDeal("meera", "Bag", 40, "USD");
    await vault.authorize(deal.id, "buyer");
    advanceClock(22 * DAY);
    expect(await vault.tickVault()).toEqual([`expired:${deal.id}`]);
  });
  it("cancel before shipping voids the hold", async () => {
    const { deal } = await vault.createDeal("meera", "Bag", 40, "USD");
    await vault.authorize(deal.id, "buyer");
    expect((await vault.cancel(deal.id, "buyer")).status).toBe("voided");
  });
  it("keeps an audit trail", async () => {
    const id = await shipped();
    expect(db().vaultDeals.find((d) => d.id === id)!.history.map((h) => h.event)).toEqual(["created", "authorized", "shipped", "tracking saved for release"]);
  });
});

describe("PayPal authorization rules (honor period / reauthorize)", () => {
  const day = 24 * 3600 * 1000;
  const at = new Date("2026-11-20T12:00:00Z");
  const authorized = (days: number) => new Date(at.getTime() - days * day).toISOString();
  const err422 = new PayPalError("capture failed", 422, JSON.stringify({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "AUTHORIZATION_EXPIRED" }] }));

  it("reads PayPal's issue code off the error body", () => {
    expect(err422.issue).toBe("AUTHORIZATION_EXPIRED");
  });

  it("reauthorizes only on days 4–29, once, and only for a 422", () => {
    expect(canReauthorize({ authorizedAt: authorized(2) }, err422, at)).toBe(false); // inside the 3-day honor period
    expect(canReauthorize({ authorizedAt: authorized(5) }, err422, at)).toBe(true);
    expect(canReauthorize({ authorizedAt: authorized(29) }, err422, at)).toBe(true);
    expect(canReauthorize({ authorizedAt: authorized(30) }, err422, at)).toBe(false); // needs a new authorization
    expect(canReauthorize({ authorizedAt: authorized(5), reauthorizedAt: authorized(1) }, err422, at)).toBe(false);
    expect(canReauthorize({ authorizedAt: authorized(5) }, new PayPalError("bad", 400, "{}"), at)).toBe(false);
    expect(canReauthorize({ authorizedAt: authorized(5) }, new Error("network"), at)).toBe(false);
  });

  it("maps carrier names to PayPal's carrier codes", () => {
    expect(paypalCarrier("India Post")).toBe("INDIA_POST");
    expect(paypalCarrier("Blue Dart")).toBe("BLUEDART");
    expect(paypalCarrier("DTDC")).toBe("DTDC_IN");
    expect(paypalCarrier("Delhivery")).toBe("IND_DELHIVERY");
    expect(paypalCarrier("FedEx")).toBe("FEDEX");
    expect(paypalCarrier("Some Courier")).toBe("OTHER");
  });
});
