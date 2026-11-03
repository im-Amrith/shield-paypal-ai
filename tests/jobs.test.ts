import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Tracking goes through the REST fallback here (the real toolkit would make its own PayPal calls).
vi.mock("@/lib/toolkit", async (orig) => ({
  ...(await orig<typeof import("@/lib/toolkit")>()),
  viaToolkit: async (_tool: string, _args: unknown, _parse: unknown, fallback: () => Promise<unknown>) => ({ value: await fallback(), via: "REST (test)" }),
}));

import { resetDB, db, mutate } from "@/lib/store";
import { advanceClock, DAY, HOUR } from "@/lib/clock";
import { createInvoice } from "@/lib/collections";
import * as vault from "@/lib/vault";
import { runJobs } from "@/lib/jobs";
import { linkState } from "@/lib/paypalLink";
import { POST as demo } from "@/app/api/demo/route";

const INVOICE = {
  clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.demo", relationship: "regular" as const,
  items: [{ name: "Brand identity", amount: 800 }], currency: "USD", dueInDays: 14, lateFeePercent: 0, offerPayLater: false,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const notFound = (debugId: string) => json({ name: "RESOURCE_NOT_FOUND", message: "The specified resource does not exist.", debug_id: debugId, details: [{ issue: "INVALID_RESOURCE_ID" }] }, 404);

/** The PayPal sandbox, faked. `remind` decides how an invoice reminder answers. */
function fakePayPal(opts: { remind?: (invoiceId: string) => Response } = {}) {
  const calls: { method: string; url: string }[] = [];
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u.endsWith("/v1/oauth2/token")) return json({ access_token: "T", expires_in: 32400 });
    calls.push({ method, url: u });
    const path = new URL(u).pathname;
    if (path === "/v2/checkout/orders") return json({ id: `ORDER-${++n}`, status: "CREATED", links: [] }, 201);
    if (/^\/v2\/checkout\/orders\/[^/]+\/authorize$/.test(path)) return json({ purchase_units: [{ payments: { authorizations: [{ id: `AUTH-${++n}`, status: "CREATED" }] } }] }, 201);
    if (/^\/v2\/payments\/authorizations\/[^/]+\/capture$/.test(path)) return json({ id: `CAP-${++n}`, status: "COMPLETED" }, 201);
    if (/^\/v2\/checkout\/orders\/[^/]+\/track$/.test(path)) return json({ id: "TRACK" }, 201);
    const remind = path.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/remind$/);
    if (remind) return opts.remind ? opts.remind(remind[1]) : new Response(null, { status: 204 });
    throw new Error(`unexpected ${method} ${u}`);
  }));
  return { calls, reminds: () => calls.filter((c) => c.url.endsWith("/remind")) };
}

const sandbox = () => {
  vi.stubEnv("SHIELD_FORCE_MOCK", "");
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-ABC123");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
};

/** A Vault deal on the current (fake sandbox) account, delivered and past its release window. */
async function deliveredDeal() {
  const { deal } = await vault.createDeal("meera", "Canon 200D", 320, "USD", 72);
  const { orderId } = await vault.checkoutOrder(deal.id, "buyer");
  await vault.authorize(deal.id, "buyer", orderId);
  await vault.ship(deal.id, "EZ123456789IN", "India Post");
  await vault.markDelivered(deal.id);
  return deal.id;
}

describe("Background jobs never let one record stop the run", () => {
  beforeEach(() => {
    resetDB();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("a stale invoice from mock mode doesn't block a Vault auto-release in the same run", async () => {
    const stale = await createInvoice("meera", INVOICE); // mock mode (the test default)
    expect(stale.paypalLink).toEqual({ mode: "mock" });
    sandbox();
    const pp = fakePayPal();
    const dealId = await deliveredDeal();
    expect(vault.getDeal(dealId)!.paypalLink).toEqual({ mode: "sandbox", client: "ABC123" });
    advanceClock(15 * DAY); // invoice overdue, delivery window long past

    const run = await runJobs();
    expect(run.errors).toEqual([]);
    expect(run.log).toEqual(expect.arrayContaining([`released:${dealId}`, `${stale.id}:friendly`]));
    const deal = vault.getDeal(dealId)!;
    expect(deal.status).toBe("released");
    expect(deal.captureId).toMatch(/^CAP-/);
    // The mock invoice: no PayPal call, but Shield's own reminder email still went out.
    expect(pp.reminds()).toHaveLength(0);
    expect(db().outbox.some((o) => o.to === INVOICE.clientEmail)).toBe(true);
    expect(run.skipped).toContainEqual({ record: stale.id, reason: "isn't on the current PayPal account" });
    expect(run.summary).toMatch(new RegExp(`^Ran 5 jobs · \\d+ updates · 1 skipped: ${stale.id} isn't on the current PayPal account$`));
  });

  it("a PayPal 404 marks the record 'PayPal record missing' and PayPal isn't asked again", async () => {
    sandbox();
    const inv = await (async () => {
      vi.stubEnv("SHIELD_FORCE_MOCK", "1");
      const i = await createInvoice("meera", INVOICE);
      vi.stubEnv("SHIELD_FORCE_MOCK", "");
      return i;
    })();
    // An invoice from an older PayPal app: a real-looking id, no link (before links existed).
    mutate((d) => { const i = d.invoices.find((x) => x.id === inv.id)!; i.paypalInvoiceId = "INV2-OLDAPP-0001"; delete i.paypalLink; });
    const pp = fakePayPal({ remind: () => notFound("f3799528d60e2") });
    advanceClock(15 * DAY);

    const first = await runJobs();
    expect(first.errors).toEqual([]);
    expect(first.log).toContain(`${inv.id}:friendly`); // the reminder email still went out
    const marked = db().invoices.find((i) => i.id === inv.id)!;
    expect(marked.paypalLink?.missing).toMatchObject({ issue: "INVALID_RESOURCE_ID", debugId: "f3799528d60e2" });
    expect(linkState(marked.paypalLink)).toBe("missing");
    expect(first.summary).toMatch(/1 skipped: INV-\d+ its PayPal record is missing \(INVALID_RESOURCE_ID, debug id f3799528d60e2\)/);

    advanceClock(7 * DAY); // next ladder step (firm, due + 7 days)
    const second = await runJobs();
    expect(second.log).toContain(`${inv.id}:firm`);
    expect(pp.reminds()).toHaveLength(1); // only the first, failed attempt
    expect(second.skipped).toContainEqual({ record: inv.id, reason: "its PayPal record is missing" });
  });

  it("any other failure is reported with PayPal's debug id while the other records still run", async () => {
    sandbox();
    const pp = fakePayPal({ remind: (id) => (id === "INV2-BROKEN" ? json({ name: "INTERNAL_SERVER_ERROR", debug_id: "dbg500" }, 500) : new Response(null, { status: 204 })) });
    vi.stubEnv("SHIELD_FORCE_MOCK", "1");
    const a = await createInvoice("meera", INVOICE);
    const b = await createInvoice("meera", INVOICE);
    vi.stubEnv("SHIELD_FORCE_MOCK", "");
    // Both on the current account; only `a`'s PayPal reminder fails.
    mutate((d) => {
      for (const [id, pid] of [[a.id, "INV2-BROKEN"], [b.id, "INV2-FINE"]] as const) {
        const i = d.invoices.find((x) => x.id === id)!;
        i.paypalInvoiceId = pid;
        i.paypalLink = { mode: "sandbox", client: "ABC123" };
      }
    });
    const dealId = await deliveredDeal();
    advanceClock(15 * DAY);

    const run = await runJobs();
    expect(run.errors).toEqual([expect.objectContaining({ job: "collections", record: a.id, debugId: "dbg500" })]);
    expect(run.log).toEqual(expect.arrayContaining([`${a.id}:error`, `${b.id}:friendly`, `released:${dealId}`]));
    expect(pp.reminds().map((c) => c.url)).toEqual(expect.arrayContaining([expect.stringContaining("INV2-FINE")]));
    expect(run.summary).toMatch(new RegExp(`1 failed: ${a.id}: .*\\(debug id dbg500\\)`));
  });

  it("a Vault hold on another PayPal account is still released in Shield, without a PayPal call", async () => {
    sandbox();
    const pp = fakePayPal();
    const dealId = await deliveredDeal();
    mutate((d) => { d.vaultDeals.find((v) => v.id === dealId)!.paypalLink = { mode: "sandbox", client: "OLDAPP" }; });
    const before = pp.calls.length;
    advanceClock(73 * HOUR);
    const run = await runJobs();
    const deal = vault.getDeal(dealId)!;
    expect(deal.status).toBe("released");
    expect(deal.captureId).toBeUndefined();
    expect(deal.history.at(-1)?.detail ?? "").toMatch(/Not linked to the current PayPal account|Tracking is kept in Shield only/);
    expect(deal.paypalTracking?.status).toBe("skipped");
    expect(pp.calls.length).toBe(before);
    expect(run.skipped.some((s) => s.record === dealId)).toBe(true);
  });

  it("/api/demo '+1 week' answers ok with a summary, never a raw PayPal error", async () => {
    sandbox();
    fakePayPal({ remind: () => notFound("f3799528d60e2") });
    vi.stubEnv("SHIELD_FORCE_MOCK", "1");
    const inv = await createInvoice("meera", INVOICE);
    vi.stubEnv("SHIELD_FORCE_MOCK", "");
    mutate((d) => { const i = d.invoices.find((x) => x.id === inv.id)!; i.paypalInvoiceId = "INV2-OLDAPP-0002"; delete i.paypalLink; });
    advanceClock(14 * DAY);
    const res = await demo(new Request("http://localhost/api/demo", { method: "POST", body: JSON.stringify({ action: "advance", hours: 168 }) }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.data.jobs.summary).toMatch(/^Ran 5 jobs · /);
    expect(j.data.jobs.errors).toEqual([]);
  });
});
