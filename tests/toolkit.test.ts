import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetDB, db, mutate } from "@/lib/store";
import { setToolkitRunner, runToolkit, ToolkitError, ToolkitUnavailable } from "@/lib/toolkit";
import { startCase, escalateTier2, executeAction, humanDecision } from "@/lib/support";
import * as vault from "@/lib/vault";

type Call = { tool: string; args: Record<string, any> };
let calls: Call[] = [];

/** A fake @paypal/agent-toolkit: records calls, answers like PayPal (JSON strings, as the toolkit does). */
function fakeToolkit(answers: Record<string, unknown> = {}) {
  calls = [];
  setToolkitRunner(async (tool, args) => {
    calls.push({ tool, args });
    if (tool in answers) return JSON.stringify(answers[tool]);
    if (tool === "create_refund") return JSON.stringify({ id: "TKREF123", status: "COMPLETED" });
    if (tool === "list_disputes") return JSON.stringify({ items: [{ dispute_id: "PP-D-1" }] });
    if (tool === "create_shipment_tracking") return JSON.stringify({ tracker_identifiers: [{ transaction_id: args.transaction_id }] });
    return JSON.stringify({});
  });
}

describe("PayPal Agent Toolkit wiring", () => {
  beforeEach(() => resetDB());
  afterEach(() => setToolkitRunner(null));

  it("parses toolkit errors and never treats them as success", async () => {
    fakeToolkit({ create_refund: { error: { message: "CAPTURE_FULLY_REFUNDED" } } });
    await expect(runToolkit("create_refund", { capture_id: "C1" })).rejects.toBeInstanceOf(ToolkitError);
  });

  it("treats the toolkit's {ok:false, status} error shape as a failure", async () => {
    fakeToolkit({ create_refund: { ok: false, status: 404, code: "PAYPAL_API_HTTP_ERROR", message: "The specified resource does not exist." } });
    await expect(runToolkit("create_refund", { capture_id: "C1" })).rejects.toThrow(/does not exist/);
  });

  it("a small refund runs create_refund only after the customer confirms", async () => {
    fakeToolkit();
    // Meera's 45 USD template sale refund: under her 100 limit, so the customer confirms.
    mutate((d) => { d.transactions.push({ id: "tx_t1", userId: "meera", at: new Date().toISOString(), amount: 45, currency: "USD", direction: "out", counterparty: "Pixelcraft Fonts", country: "US", type: "goods_services", memo: "font licence", captureId: "CAP-REAL-1" }); });
    let c = await startCase("meera", "I want a refund for the Pixelcraft Fonts font licence, it never arrived");
    c = await escalateTier2(c.id);
    const refund = c.actions.find((a) => a.tool === "issue_refund")!;
    expect(refund.decision).toBe("ask_customer");
    expect(calls.filter((x) => x.tool === "create_refund")).toHaveLength(0); // policy first: nothing ran yet
    await expect(executeAction(c.id, refund.id, "policy")).rejects.toThrow(/confirmation/);
    expect(calls.filter((x) => x.tool === "create_refund")).toHaveLength(0);

    c = await executeAction(c.id, refund.id, "customer");
    const call = calls.find((x) => x.tool === "create_refund")!;
    expect(call.args).toMatchObject({ capture_id: "CAP-REAL-1", amount: { currency_code: "USD", value: "45.00" } });
    const done = c.actions.find((a) => a.id === refund.id)!;
    expect(done.status).toBe("executed");
    expect(done.via).toBe("PayPal Agent Toolkit · create_refund");
    expect(done.result).toMatch(/TKREF123/);
    expect(c.timeline.some((t) => t.label.includes("via PayPal Agent Toolkit · create_refund"))).toBe(true);
  });

  it("a refund above the human limit waits for a specialist before the toolkit runs", async () => {
    fakeToolkit();
    mutate((d) => { d.transactions.push({ id: "tx_t2", userId: "meera", at: new Date().toISOString(), amount: 180, currency: "USD", direction: "out", counterparty: "Lumen Studio Lights", country: "US", type: "goods_services", memo: "softbox kit", captureId: "CAP-REAL-2" }); });
    let c = await startCase("meera", "Refund my Lumen Studio Lights softbox kit please, it arrived broken");
    c = await escalateTier2(c.id);
    const refund = c.actions.find((a) => a.tool === "issue_refund")!;
    expect(refund.decision).toBe("needs_human");
    await expect(executeAction(c.id, refund.id, "customer")).rejects.toThrow(/specialist/);
    expect(calls.some((x) => x.tool === "create_refund")).toBe(false);
    c = await humanDecision(c.id, refund.id, true);
    expect(calls.filter((x) => x.tool === "create_refund")).toHaveLength(1);
    expect(c.actions.find((a) => a.id === refund.id)!.via).toBe("PayPal Agent Toolkit · create_refund");
  });

  it("a revoked customer gets nothing through, so the toolkit is never called", async () => {
    fakeToolkit();
    mutate((d) => { d.policies.find((p) => p.userId === "meera")!.revoked = true; });
    let c = await startCase("meera", "refund my 60 dollar payment to Pixel Shop");
    c = await escalateTier2(c.id);
    expect(c.actions.filter((a) => a.tool !== "lookup_transactions").every((a) => a.decision === "blocked")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("a PayPal error from the toolkit fails the action and isn't retried through REST", async () => {
    fakeToolkit({ create_refund: { error: { message: "CAPTURE_FULLY_REFUNDED" } } });
    mutate((d) => { d.transactions.push({ id: "tx_t3", userId: "meera", at: new Date().toISOString(), amount: 30, currency: "USD", direction: "out", counterparty: "Pixelcraft Fonts", country: "US", type: "goods_services", captureId: "CAP-3" }); });
    let c = await startCase("meera", "refund the Pixelcraft Fonts payment please");
    c = await escalateTier2(c.id);
    const refund = c.actions.find((a) => a.tool === "issue_refund")!;
    c = await executeAction(c.id, refund.id, "customer");
    expect(c.actions.find((a) => a.id === refund.id)!.status).toBe("failed");
    expect(calls.filter((x) => x.tool === "create_refund")).toHaveLength(1);
    expect(db().transactions.find((t) => t.id === "tx_t3")!.refunded).toBeFalsy();
  });

  it("falls back to the REST client when the toolkit can't load", async () => {
    setToolkitRunner(async () => { throw new ToolkitUnavailable("not installed"); });
    let c = await startCase("meera", "I have a dispute open, what's happening with it?");
    c = await escalateTier2(c.id);
    const a = c.actions.find((x) => x.tool === "list_disputes");
    expect(a?.status).toBe("executed");
    expect(a?.via).toMatch(/PayPal REST/);
  });

  it("mock mode (no toolkit, no keys) behaves as before and says so", async () => {
    setToolkitRunner(null);
    let c = await startCase("meera", "I have a dispute open, what's happening with it?");
    c = await escalateTier2(c.id);
    const a = c.actions.find((x) => x.tool === "list_disputes")!;
    expect(a.status).toBe("executed");
    expect(a.via).toBe("list_disputes · mock (no PayPal keys)");
  });

  it("Vault keeps tracking pending while the money is only authorized (PayPal tracks captures)", async () => {
    fakeToolkit();
    const { deal } = await vault.createDeal("meera", "Canon 200D camera", 320, "USD");
    await vault.authorize(deal.id, "buyer");
    await vault.ship(deal.id, "EZ123456789IN", "India Post");
    expect(calls.some((x) => x.tool === "create_shipment_tracking")).toBe(false);
    const saved = vault.getDeal(deal.id)!;
    expect(saved.paypalTracking?.status).toBe("pending");
    expect(saved.status).toBe("shipped");
  });

  it("Vault shares tracking through create_shipment_tracking against the capture on release", async () => {
    fakeToolkit();
    const { deal } = await vault.createDeal("meera", "Canon 200D camera", 320, "USD");
    await vault.authorize(deal.id, "buyer");
    await vault.ship(deal.id, "EZ123456789IN", "India Post");
    const d = await vault.confirmReceipt(deal.id, "buyer");
    const saved = vault.getDeal(deal.id)!;
    const call = calls.find((x) => x.tool === "create_shipment_tracking")!;
    expect(call.args).toMatchObject({ tracking_number: "EZ123456789IN", carrier: "INDIA_POST", status: "SHIPPED", transaction_id: saved.captureId });
    expect(call.args.transaction_id).not.toBe(d.authorizationId);
    expect(saved.paypalTracking?.status).toBe("shared");
    expect(saved.paypalTracking?.via).toBe("PayPal Agent Toolkit · create_shipment_tracking");
    expect(saved.status).toBe("released");
  });

  it("a tracking rejection is recorded but doesn't undo the release", async () => {
    fakeToolkit({ create_shipment_tracking: { error: { message: "INVALID_TRACKING_NUMBER" } } });
    const { deal } = await vault.createDeal("meera", "Camera", 320, "USD");
    await vault.authorize(deal.id, "buyer");
    await vault.ship(deal.id, "X1", "Some Courier");
    await vault.confirmReceipt(deal.id, "buyer");
    const saved = vault.getDeal(deal.id)!;
    expect(saved.status).toBe("released");
    expect(saved.paypalTracking?.status).toBe("failed");
    expect(saved.paypalTracking?.detail).toMatch(/INVALID_TRACKING_NUMBER/);
  });
});
