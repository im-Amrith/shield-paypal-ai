import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db, mutate } from "@/lib/store";
import { advanceClock, DAY } from "@/lib/clock";
import { decideSpend } from "@/lib/policy";
import * as shop from "@/lib/shop";
import type { Policy } from "@/lib/types";

const P = (o: Partial<Policy> = {}): Policy => ({ userId: "meera", perOrderCap: 150, monthlyCap: 400, autoApproveBelow: 40, refundHumanAbove: 100, revoked: false, ...o });
const NEED = "Monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40";
const BIG = "toilet paper, paper towels, laundry detergent, coffee, olive oil";

describe("decideSpend caps", () => {
  it("auto-approves at or below the threshold", () => {
    expect(decideSpend(40, 0, P()).decision).toBe("auto");
    expect(decideSpend(12.5, 100, P()).decision).toBe("auto");
  });
  it("asks for one-tap approval between the threshold and the per-order cap", () => {
    expect(decideSpend(40.01, 0, P()).decision).toBe("ask_customer");
    expect(decideSpend(150, 0, P()).decision).toBe("ask_customer");
  });
  it("blocks above the per-order cap", () => {
    const r = decideSpend(150.01, 0, P());
    expect(r.decision).toBe("blocked");
    expect(r.reason).toMatch(/per-order cap/);
  });
  it("blocks when the month would go over the monthly cap", () => {
    const r = decideSpend(30, 380, P());
    expect(r.decision).toBe("blocked");
    expect(r.reason).toMatch(/monthly cap/);
    expect(decideSpend(20, 380, P()).decision).toBe("auto");
  });
  it("blocks everything once revoked", () => {
    expect(decideSpend(1, 0, P({ revoked: true }))).toEqual({ decision: "blocked", reason: "Agent permissions are revoked" });
  });
  it("blocks invalid amounts, including NaN", () => {
    for (const a of [0, -5, Number.NaN, Infinity]) expect(decideSpend(a, 0, P()).decision).toBe("blocked");
  });
});

describe("need parsing and picking (rules)", () => {
  it("reads items, budget and monthly", () => {
    const n = shop.parseNeedRules(NEED);
    expect(n.items).toEqual(["dish soap", "rice 5kg", "AA batteries"]);
    expect(n.budget).toBe(40);
    expect(n.monthly).toBe(true);
  });
  it("reads '$35' style budgets and 'and' lists", () => {
    const n = shop.parseNeedRules("Toilet paper, paper towels and trash bags under $35");
    expect(n.items).toEqual(["Toilet paper", "paper towels", "trash bags"]);
    expect(n.budget).toBe(35);
  });
  it("prefers last month's product when it's offered", async () => {
    const opts = (await shop.searchProducts("dish soap")).items;
    const p = shop.pickRules("dish soap", opts, "s-soap-3");
    expect(p?.productId).toBe("s-soap-3");
    expect(p?.reason).toMatch(/last order/);
  });
  it("labels the built-in list as sample products without a Channel3 key", async () => {
    const r = await shop.searchProducts("AA batteries");
    expect(r.source).toBe("sample");
    expect(r.items.every((i) => i.source === "sample")).toBe(true);
  });
  it("fits the cart to the user's budget", async () => {
    const d = await shop.draftCart("TV, kettle, budget $30", P(), 0);
    expect(d.total).toBeLessThanOrEqual(30);
    expect(d.skipped.some((s) => /budget/.test(s.why))).toBe(true);
  });
});

describe("shopping agent flow", () => {
  beforeEach(() => resetDB());

  it("buys a cart under the auto-approve threshold and records the transaction", async () => {
    const c = await shop.planCart("meera", NEED);
    expect(c.decision).toBe("auto");
    expect(c.status).toBe("paid");
    expect(c.total).toBeLessThanOrEqual(40);
    expect(c.captureId).toBeTruthy();
    const tx = db().transactions.find((t) => t.captureId === c.captureId);
    expect(tx?.amount).toBe(c.total);
    expect(tx?.direction).toBe("out");
    expect(shop.spentThisMonth("meera")).toBe(c.total);
  });

  it("waits for one-tap approval above the threshold, then pays", async () => {
    const c = await shop.planCart("meera", BIG);
    expect(c.total).toBeGreaterThan(40);
    expect(c.status).toBe("pending_approval");
    expect(db().transactions.some((t) => t.memo?.startsWith("Shopping agent"))).toBe(false);
    const paid = await shop.approveCart("meera", c.id);
    expect(paid.status).toBe("paid");
  });

  it("blocks a cart over the per-order cap with the reason", async () => {
    const c = await shop.planCart("meera", "a 55 inch TV");
    expect(c.total).toBeGreaterThan(150);
    expect(c.status).toBe("blocked");
    expect(c.reason).toMatch(/per-order cap of 150/);
    await expect(shop.approveCart("meera", c.id)).rejects.toThrow(/blocked/);
  });

  it("revoking stops a cart that was already approved for checkout", async () => {
    const c = await shop.planCart("meera", BIG);
    mutate((d) => { d.carts!.find((x) => x.id === c.id)!.status = "awaiting_payment"; d.carts!.find((x) => x.id === c.id)!.approvedAt = "x"; d.carts!.find((x) => x.id === c.id)!.paypalOrderId = "O1"; });
    shop.updatePolicy("meera", { revoked: true });
    await expect(shop.pay("meera", c.id)).rejects.toThrow(/revoked/);
    expect(shop.getCart(c.id)!.status).toBe("blocked");
    expect(shop.spentThisMonth("meera")).toBe(0);
  });

  it("lowering a cap after approval blocks the capture", async () => {
    const c = await shop.planCart("meera", BIG);
    mutate((d) => { const x = d.carts!.find((y) => y.id === c.id)!; x.status = "awaiting_payment"; x.approvedAt = "x"; x.paypalOrderId = "O1"; });
    shop.updatePolicy("meera", { autoApproveBelow: 10, perOrderCap: 20, monthlyCap: 400 });
    await expect(shop.pay("meera", c.id)).rejects.toThrow(/per-order cap/);
  });

  it("never lets the month go over the monthly cap", async () => {
    shop.updatePolicy("meera", { autoApproveBelow: 40, perOrderCap: 50, monthlyCap: 50 });
    const a = await shop.planCart("meera", NEED);
    expect(a.status).toBe("paid");
    const b = await shop.planCart("meera", NEED);
    expect(b.status).toBe("blocked");
    expect(b.reason).toMatch(/monthly cap of 50/);
    expect(shop.spentThisMonth("meera")).toBeLessThanOrEqual(50);
  });

  it("only the owner can approve or pay", async () => {
    const c = await shop.planCart("meera", BIG);
    await expect(shop.approveCart("ravi", c.id)).rejects.toThrow(/not found/);
    await expect(shop.pay("ravi", c.id)).rejects.toThrow(/not found/);
  });

  it("validates the caps panel", () => {
    expect(() => shop.updatePolicy("meera", { autoApproveBelow: 200 })).toThrow(/at or below/);
    expect(() => shop.updatePolicy("meera", { perOrderCap: 500 })).toThrow(/monthly cap/);
    expect(() => shop.updatePolicy("meera", { monthlyCap: -1 })).toThrow(/between/);
    expect(shop.updatePolicy("meera", { autoApproveBelow: 30 }).autoApproveBelow).toBe(30);
  });

  it("saves a paid cart as a monthly reorder and proposes it again next month", async () => {
    const c = await shop.planCart("meera", NEED);
    const r = db().reorders!.find((x) => x.userId === "meera")!;
    expect(r.items.map((i) => i.productId)).toEqual(c.items.map((i) => i.productId));
    expect(shop.isDue(r)).toBe(false);
    advanceClock(31 * DAY);
    expect(shop.isDue(db().reorders![0])).toBe(true);
    const log = await shop.tickReorders();
    expect(log).toEqual([`reorder-due:${r.id}`]);
    expect(await shop.tickReorders()).toEqual([]); // once per cycle
    const again = await shop.proposeReorder("meera", r.id);
    expect(again.reorderId).toBe(r.id);
    expect(again.items.map((i) => i.productId)).toEqual(c.items.map((i) => i.productId));
    expect(again.items.every((i) => i.reason === "Same as your last order")).toBe(true);
    expect(again.status).toBe("paid");
  });
});
