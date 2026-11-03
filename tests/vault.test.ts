import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, HOUR, DAY } from "@/lib/clock";
import * as vault from "@/lib/vault";

async function shipped() {
  const { deal } = await vault.createDeal("meera", "Canon 200D camera", 320, "USD", 72);
  await vault.authorize(deal.id, "buyer");
  await vault.ship(deal.id, "EZ123456789IN", "India Post");
  return deal.id;
}

describe("Vault escrow", () => {
  beforeEach(() => resetDB());

  it("creates an AUTHORIZE order and shows fees up front", async () => {
    const r = await vault.createDeal("meera", "Camera", 320, "USD");
    expect(r.deal.status).toBe("created");
    expect(r.deal.paypalOrderId).toBeTruthy();
    expect(r.fees.fee).toBeGreaterThan(0);
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
    expect(db().vaultDeals.find((d) => d.id === id)!.history.map((h) => h.event)).toEqual(["created", "authorized", "shipped", "tracking shared with PayPal"]);
  });
});
