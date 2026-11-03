import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRates, rateLabel, resetRateCache, FALLBACK_RATES } from "@/lib/fx";
import { quoteExchangeRates } from "@/lib/paypal";
import { POST } from "@/app/api/fx/route";

// Response shape from PayPal's Pricing v2 spec (rate_detail): money objects plus string rates.
const quote = (c: string, rate: string, expiry = "2026-11-03T18:00:00Z") => ({
  base_amount: { currency_code: "USD", value: "1.00" },
  quote_amount: { currency_code: c, value: rate },
  exchange_rate: rate,
  fx_id: `FX-${c}`,
  expiry_time: expiry,
  rate_refresh_time: "2026-11-03T17:00:00Z",
});
const PAYPAL_QUOTES = {
  exchange_rate_quotes: [
    quote("INR", "88.4012"), quote("EUR", "0.8611", "2026-11-03T17:30:00Z"), quote("GBP", "0.7502"),
    quote("AUD", "1.5233"), quote("CAD", "1.3911"), quote("JPY", "151.2"), quote("SGD", "1.3021"),
  ],
};
const NOT_PROVISIONED = {
  name: "NOT_AUTHORIZED", message: "Authorization failed due to insufficient permissions.", debug_id: "f545522f035d5",
  details: [{ issue: "FEATURE_NOT_PROVISIONED", description: "FX-as-a-Service is not provisioned for this account." }],
};
const MARKET = { result: "success", rates: { USD: 1, INR: 88.0, EUR: 0.86, GBP: 0.75, AUD: 1.52, CAD: 1.39, JPY: 151, SGD: 1.3 } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake network: PayPal OAuth, PayPal FX quotes, and the public mid-market rates. */
function network(opts: { paypal?: () => Response; market?: () => Response }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith("/v1/oauth2/token")) return json({ access_token: "TEST_TOKEN", expires_in: 32400, scope: "https://uri.paypal.com/services/pricing/quote-exchange-rates/read" });
    if (u.endsWith("/v2/pricing/quote-exchange-rates")) return (opts.paypal ?? (() => json(PAYPAL_QUOTES)))();
    if (u.startsWith("https://open.er-api.com/")) return (opts.market ?? (() => json(MARKET)))();
    throw new Error(`unexpected fetch ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const fx = () => calls.filter((c) => c.url.endsWith("/v2/pricing/quote-exchange-rates"));
  return { calls, fx };
}

describe("FX rates: PayPal quote first, then estimated", () => {
  beforeEach(() => {
    resetRateCache();
    // Sandbox mode for these tests (the suite defaults to SHIELD_FORCE_MOCK=1).
    vi.stubEnv("SHIELD_FORCE_MOCK", "");
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends quote_items in PayPal's shape and returns rate_detail objects", async () => {
    const net = network({});
    const out = await quoteExchangeRates([
      { base_currency: "USD", quote_currency: "INR" },
      { base_currency: "USD", quote_currency: "EUR", base_amount: 100, markup_percent: 0 },
    ]);
    const [req] = net.fx();
    expect(req.url).toBe("https://api-m.sandbox.paypal.com/v2/pricing/quote-exchange-rates");
    expect(req.init?.method).toBe("POST");
    expect((req.init?.headers as Record<string, string>).Authorization).toBe("Bearer TEST_TOKEN");
    expect(JSON.parse(String(req.init?.body))).toEqual({
      quote_items: [
        { base_currency: "USD", quote_currency: "INR" },
        { base_currency: "USD", quote_currency: "EUR", base_amount: "100.00", markup_percent: "0" },
      ],
    });
    expect(out[0].exchange_rate).toBe("88.4012");
  });

  it("uses PayPal's rates when every currency is quoted, labelled 'PayPal rate'", async () => {
    const net = network({});
    const r = await getRates();
    expect(r.source).toBe("paypal");
    expect(rateLabel(r.source)).toBe("PayPal rate");
    expect(r.rates.INR).toBe(88.4012);
    expect(r.rates.USD).toBe(1);
    expect(r.expiresAt).toBe("2026-11-03T17:30:00Z"); // the earliest expiry across the quotes
    // One call quotes every currency the copilot shows; nothing hits the market API.
    const items = JSON.parse(String(net.fx()[0].init?.body)).quote_items;
    expect(items.map((i: { quote_currency: string }) => i.quote_currency).sort()).toEqual(Object.keys(FALLBACK_RATES).filter((c) => c !== "USD").sort());
    expect(net.calls.some((c) => c.url.includes("er-api"))).toBe(false);
    await getRates();
    expect(net.fx()).toHaveLength(1); // cached
  });

  it("falls back to mid-market rates on 403 FEATURE_NOT_PROVISIONED, labelled 'Estimated', and doesn't retry PayPal for 10 minutes", async () => {
    const net = network({ paypal: () => json(NOT_PROVISIONED, 403) });
    const r = await getRates();
    expect(r.source).toBe("market");
    expect(rateLabel(r.source)).toBe("Estimated");
    expect(r.rates.INR).toBe(88.0);
    expect(r.fallbackReason).toBe("PayPal FEATURE_NOT_PROVISIONED (debug id f545522f035d5)");
    await getRates();
    expect(net.fx()).toHaveLength(1);
  });

  it("asks PayPal again once the 10-minute back-off has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-03T12:00:00Z"), toFake: ["Date"] });
    try {
      let paypalUp = false;
      const net = network({ paypal: () => (paypalUp ? json(PAYPAL_QUOTES) : json(NOT_PROVISIONED, 403)) });
      expect((await getRates()).source).toBe("market");
      paypalUp = true;
      vi.setSystemTime(new Date("2026-11-03T12:11:00Z"));
      expect((await getRates()).source).toBe("paypal");
      expect(net.fx()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't mix sources: a quote missing a currency means estimated rates for all", async () => {
    network({ paypal: () => json({ exchange_rate_quotes: PAYPAL_QUOTES.exchange_rate_quotes.filter((q) => q.quote_amount.currency_code !== "JPY") }) });
    const r = await getRates();
    expect(r.source).toBe("market");
    expect(r.fallbackReason).toBe("PayPal didn't quote JPY");
  });

  it("uses the bundled offline rates when both PayPal and the market API fail", async () => {
    network({ paypal: () => json({ name: "INTERNAL_SERVER_ERROR" }, 500), market: () => new Response("down", { status: 503 }) });
    const r = await getRates();
    expect(r.source).toBe("offline");
    expect(r.live).toBe(false);
    expect(r.rates).toEqual(FALLBACK_RATES);
    expect(rateLabel(r.source)).toBe("Estimated");
  });

  it("never calls PayPal in mock mode", async () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    const net = network({});
    expect((await getRates()).source).toBe("market");
    expect(net.fx()).toHaveLength(0);
  });

  it("the FX copilot API reports the rate source and label", async () => {
    network({});
    const res = await POST(new Request("http://localhost/api/fx", { method: "POST", body: JSON.stringify({ price: 800, clientCurrency: "USD", homeCurrency: "INR" }) }));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.data).toMatchObject({ rateSource: "paypal", rateLabel: "PayPal rate", rateExpiresAt: "2026-11-03T17:30:00Z" });
    // INR net at PayPal's rate: the USD option converts through 88.4012.
    expect(j.data.options.find((o: { billCurrency: string }) => o.billCurrency === "USD").netHome).toBeGreaterThan(0);
  });
});
