import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, DAY } from "@/lib/clock";
import * as shop from "@/lib/shop";
import * as saved from "@/lib/savedPaypal";

// Monthly reorder example: under the USD 40 auto-approve limit. BIG needs one tap.
const NEED = "Monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40";
const BIG = "toilet paper, paper towels, laundry detergent, coffee, olive oil";
const URLS = { returnUrl: "https://shield.example/shop?paypal=saved", cancelUrl: "https://shield.example/shop?paypal=cancelled" };

type Call = { method: string; url: string; body?: any; requestId?: string };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** PayPal sandbox, faked. `charge` decides how POST /v2/checkout/orders with a vault_id answers. */
function fakePayPal(opts: { charge?: (call: Call, n: number) => Response | Promise<Response>; del?: () => Response } = {}) {
  const calls: Call[] = [];
  let charges = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/v1/oauth2/token")) return json({ access_token: "T", expires_in: 32400 });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = { method: init?.method ?? "GET", url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined, requestId: headers["PayPal-Request-Id"] };
    calls.push(call);
    if (u.endsWith("/v3/vault/setup-tokens")) {
      return json({ id: "SETUP-1", customer: { id: "CUST-1" }, status: "PAYER_ACTION_REQUIRED", payment_source: { paypal: call.body.payment_source.paypal }, links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/x" }] }, 201);
    }
    if (u.endsWith("/v3/vault/payment-tokens") && call.method === "POST") {
      return json({ id: "PTOKEN-1", customer: { id: "CUST-1" }, payment_source: { paypal: { email_address: "buyer@personal.example", payer_id: "PAYER1" } } }, 201);
    }
    if (u.includes("/v3/vault/payment-tokens/") && call.method === "DELETE") return opts.del ? opts.del() : new Response(null, { status: 204 });
    if (u.endsWith("/v2/checkout/orders") && call.body?.payment_source?.paypal?.vault_id) {
      charges++;
      if (opts.charge) return opts.charge(call, charges);
      return json({ id: `ORDER-${charges}`, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP-${charges}`, status: "COMPLETED" }] } }] }, 201);
    }
    if (u.endsWith("/v2/checkout/orders")) return json({ id: "POPUP-ORDER", status: "CREATED", links: [{ rel: "approve", href: "https://x" }] }, 201);
    throw new Error(`unexpected ${call.method} ${u}`);
  }));
  const vaultCharges = () => calls.filter((c) => c.url.endsWith("/v2/checkout/orders") && c.body?.payment_source?.paypal?.vault_id);
  return { calls, vaultCharges };
}

async function savePayPal() {
  const { setupTokenId } = await saved.startSave("meera", URLS);
  return saved.finishSave("meera", setupTokenId);
}

const txFor = (captureId?: string) => db().transactions.filter((t) => t.captureId && t.captureId === captureId);

describe("Saved PayPal for the shopping agent (Vault v3)", () => {
  beforeEach(() => {
    resetDB();
    vi.stubEnv("SHIELD_FORCE_MOCK", "");
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("saves: setup token (MERCHANT, CONSUMER, description), then a payment token kept server-side only", async () => {
    const pp = fakePayPal();
    const { setupTokenId } = await saved.startSave("meera", URLS);
    const setup = pp.calls.find((c) => c.url.endsWith("/v3/vault/setup-tokens"))!;
    expect(setup.method).toBe("POST");
    expect(setup.body.payment_source.paypal).toMatchObject({
      usage_type: "MERCHANT", customer_type: "CONSUMER", description: "Shield shopping agent — pays only within your caps",
      experience_context: { return_url: URLS.returnUrl, cancel_url: URLS.cancelUrl },
    });
    // Only the setup token we issued to this user can be exchanged.
    await expect(saved.finishSave("meera", "SETUP-SOMEONE-ELSE")).rejects.toThrow(/doesn't match/);
    const view = await saved.finishSave("meera", setupTokenId);
    const exchange = pp.calls.find((c) => c.url.endsWith("/v3/vault/payment-tokens"))!;
    expect(exchange.body).toEqual({ payment_source: { token: { id: "SETUP-1", type: "SETUP_TOKEN" } } });
    expect(exchange.requestId).toBe("payment-token-SETUP-1");
    expect(saved.savedPayPalFor("meera")).toMatchObject({ paymentTokenId: "PTOKEN-1", customerId: "CUST-1", email: "buyer@personal.example" });
    // What the page and API get: email and date, never the token.
    expect(view).toEqual({ email: "buyer@personal.example", savedAt: expect.any(String) });
    expect(JSON.stringify(saved.savedPayPalView("meera"))).not.toContain("PTOKEN-1");
  });

  it("charges an auto-approved cart with payment_source.paypal.vault_id, no popup, and labels it", async () => {
    const pp = fakePayPal();
    await savePayPal();
    const c = await shop.planCart("meera", NEED);
    expect(c.status).toBe("paid");
    expect(c.paidVia).toBe("saved_paypal");
    const [charge] = pp.vaultCharges();
    expect(charge.body).toMatchObject({ intent: "CAPTURE", payment_source: { paypal: { vault_id: "PTOKEN-1" } }, purchase_units: [{ reference_id: c.id, amount: { currency_code: "USD", value: c.total.toFixed(2) } }] });
    expect(charge.requestId).toBe(`shield-agent-${c.id}`);
    expect(c.captureId).toBe("CAP-1");
    expect(txFor("CAP-1")).toHaveLength(1);
    const events = c.history!.map((h) => h.event);
    expect(events).toEqual(["Cart built", "Policy check before charge", shop.AGENT_PAID_LABEL]);
    expect(c.history![1].detail).toMatch(/^Auto-approved: USD [\d.]+ is within your USD 40 auto-approve limit; .* monthly cap; agent not revoked$/);
  });

  it("charges a one-tap cart with the saved PayPal once the buyer approves", async () => {
    const pp = fakePayPal();
    await savePayPal();
    const c = await shop.planCart("meera", BIG);
    expect(c.status).toBe("pending_approval");
    expect(pp.vaultCharges()).toHaveLength(0);
    const paid = await shop.approveCart("meera", c.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidVia).toBe("saved_paypal");
    expect(paid.history!.find((h) => h.event === "Policy check before charge")!.detail).toMatch(/^Approved by you/);
  });

  it("re-checks the caps right before charging: revoke or a lowered cap blocks it, and PayPal is never called", async () => {
    const pp = fakePayPal();
    await savePayPal();
    const a = await shop.planCart("meera", BIG);
    shop.updatePolicy("meera", { revoked: true });
    const blocked = await shop.approveCart("meera", a.id);
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toMatch(/revoked/);
    shop.updatePolicy("meera", { revoked: false });
    const b = await shop.planCart("meera", BIG);
    shop.updatePolicy("meera", { autoApproveBelow: 10, perOrderCap: 20, monthlyCap: 400 });
    const capped = await shop.approveCart("meera", b.id);
    expect(capped.status).toBe("blocked");
    expect(capped.reason).toMatch(/per-order cap of 20/);
    expect(pp.vaultCharges()).toHaveLength(0);
    expect(shop.spentThisMonth("meera")).toBe(0);
  });

  it("a retry after an unconfirmed charge reuses the PayPal-Request-Id, offers no popup, and records one payment", async () => {
    let first = true;
    const pp = fakePayPal({
      charge: () => {
        if (first) { first = false; throw new TypeError("fetch failed"); } // PayPal may have charged; we never heard back
        return json({ id: "ORDER-1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1", status: "COMPLETED" }] } }] }, 201);
      },
    });
    await savePayPal();
    await expect(shop.planCart("meera", NEED)).rejects.toThrow(/fetch failed/);
    const cart = db().carts![0];
    expect(cart.status).toBe("awaiting_payment");
    expect(cart.agentChargePending).toBe(true);
    await expect(shop.checkoutOrder("meera", cart.id)).rejects.toThrow(/isn't confirmed/); // no popup for this cart
    const paid = await shop.chargeWithSaved(cart.id, "meera");
    expect(paid.status).toBe("paid");
    const ids = pp.vaultCharges().map((c) => c.requestId);
    expect(ids).toEqual([`shield-agent-${cart.id}`, `shield-agent-${cart.id}`]);
    // A further retry of a paid cart doesn't call PayPal or record anything.
    await shop.chargeWithSaved(cart.id, "meera");
    expect(pp.vaultCharges()).toHaveLength(2);
    expect(txFor("CAP-1")).toHaveLength(1);
  });

  it("PAYER_ACTION_REQUIRED falls back to the popup", async () => {
    const pp = fakePayPal({ charge: () => json({ id: "ORDER-PA", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://x" }] }, 200) });
    await savePayPal();
    const c = await shop.planCart("meera", NEED);
    expect(c.status).toBe("awaiting_payment");
    expect(c.paidVia).toBeUndefined();
    expect(c.fallbackReason).toMatch(/PAYER_ACTION_REQUIRED/);
    expect(c.history!.at(-1)!.event).toBe("Saved PayPal not used");
    expect(db().transactions.some((t) => t.memo?.startsWith("Shopping agent"))).toBe(false);
    // The popup path works for this cart: a normal order, no vault_id.
    expect(await shop.checkoutOrder("meera", c.id)).toEqual({ orderId: "POPUP-ORDER" });
    expect(pp.vaultCharges()).toHaveLength(1);
  });

  it("a PayPal refusal (INSTRUMENT_DECLINED) also falls back to the popup, with PayPal's reason", async () => {
    fakePayPal({ charge: () => json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "dbg1" }, 422) });
    await savePayPal();
    const c = await shop.planCart("meera", NEED);
    expect(c.status).toBe("awaiting_payment");
    expect(c.fallbackReason).toMatch(/^PayPal error INSTRUMENT_DECLINED: .*\(debug id dbg1\)$/);
  });

  it("Remove deletes the payment token on PayPal; the agent then falls back to the popup", async () => {
    const pp = fakePayPal();
    await savePayPal();
    expect(await saved.removeSaved("meera")).toEqual({ removed: true });
    const del = pp.calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("https://api-m.sandbox.paypal.com/v3/vault/payment-tokens/PTOKEN-1");
    expect(saved.savedPayPalFor("meera")).toBeUndefined();
    const c = await shop.planCart("meera", NEED);
    expect(c.status).toBe("awaiting_payment"); // waits for the PayPal window
    expect(pp.vaultCharges()).toHaveLength(0);
  });

  it("Remove forgets a token PayPal no longer has (404), but keeps it after other PayPal errors", async () => {
    fakePayPal({ del: () => json({ name: "INTERNAL_SERVER_ERROR" }, 500) });
    await savePayPal();
    await expect(saved.removeSaved("meera")).rejects.toThrow(/500/);
    expect(saved.savedPayPalFor("meera")).toBeDefined();
    vi.unstubAllGlobals();
    fakePayPal({ del: () => json({ name: "RESOURCE_NOT_FOUND" }, 404) });
    expect(await saved.removeSaved("meera")).toEqual({ removed: true });
    expect(saved.savedPayPalFor("meera")).toBeUndefined();
  });

  describe("monthly reorders", () => {
    it("pays an auto-approvable reorder with the saved PayPal and tells the buyer", async () => {
      fakePayPal();
      await savePayPal();
      const first = await shop.planCart("meera", NEED);
      const r = db().reorders!.find((x) => x.userId === "meera")!;
      advanceClock(31 * DAY);
      expect(await shop.tickReorders()).toEqual([`reorder-paid:${r.id}`]);
      const again = db().carts!.find((c) => c.reorderId === r.id)!;
      expect(again.paidVia).toBe("saved_paypal");
      expect(again.items.map((i) => i.productId)).toEqual(first.items.map((i) => i.productId));
      const note = db().notifications.find((n) => n.userId === "meera" && n.title.startsWith("Your monthly reorder was paid"))!;
      expect(note.title).toBe(`Your monthly reorder was paid: USD ${again.total.toFixed(2)}, within your USD 40 auto-approve limit`);
      expect(await shop.tickReorders()).toEqual([]); // once per cycle
    });

    it("a reorder above the auto-approve limit waits for one tap; PayPal isn't charged", async () => {
      const pp = fakePayPal();
      await savePayPal();
      await shop.planCart("meera", NEED);
      const r = db().reorders![0];
      shop.updatePolicy("meera", { autoApproveBelow: 5 });
      advanceClock(31 * DAY);
      expect(await shop.tickReorders()).toEqual([`reorder-approve:${r.id}`]);
      expect(pp.vaultCharges()).toHaveLength(1); // only the first month's cart
      expect(db().notifications.some((n) => n.title.startsWith("Your monthly reorder needs one tap"))).toBe(true);
    });

    it("a revoked agent builds and pays nothing", async () => {
      const pp = fakePayPal();
      await savePayPal();
      await shop.planCart("meera", NEED);
      const r = db().reorders![0];
      shop.updatePolicy("meera", { revoked: true });
      advanceClock(31 * DAY);
      expect(await shop.tickReorders()).toEqual([`reorder-due:${r.id}`]);
      expect(db().carts!.filter((c) => c.reorderId === r.id)).toHaveLength(0);
      expect(pp.vaultCharges()).toHaveLength(1);
    });
  });
});
