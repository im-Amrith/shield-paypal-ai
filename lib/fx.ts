// FX-aware billing copilot + fee estimator. PayPal has no public "quote my
// fees" API, so these are ESTIMATES from PayPal's published fee pages,
// configurable here, and shown in the UI as estimates. Conversion RATES come from PayPal's
// FX quote API when the account has it (labelled "PayPal rate"), else public mid-market rates.
import * as paypal from "./paypal";

export const FEE_MODEL = {
  domesticRate: 0.0349, // goods & services, domestic
  crossBorderRate: 0.044, // receiving international commercial payments (incl. India)
  conversionMarkup: 0.035, // spread over mid-market when PayPal converts currency
  fixed: { USD: 0.3, EUR: 0.35, GBP: 0.2, AUD: 0.3, CAD: 0.3, JPY: 40, INR: 3, SGD: 0.5 } as Record<string, number>,
};

// Fallback mid-market rates (per 1 USD). Live rates replace these when reachable.
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1, INR: 88.2, EUR: 0.86, GBP: 0.75, AUD: 1.52, CAD: 1.39, JPY: 151, SGD: 1.3,
};

/**
 * Where the conversion rates came from:
 * - "paypal":  PayPal's own quote (POST /v2/pricing/quote-exchange-rates). Shown as "PayPal rate".
 * - "market":  public mid-market rates (open.er-api.com). Shown as "Estimated".
 * - "offline": the FALLBACK_RATES above. Shown as "Estimated".
 */
export type RateSource = "paypal" | "market" | "offline";

export interface Rates {
  /** Units of each currency per 1 USD. */
  rates: Record<string, number>;
  source: RateSource;
  /** True for any rate fetched just now (PayPal or market); false for the bundled offline rates. */
  live: boolean;
  /** PayPal quotes only: when PayPal stops honouring the quoted rates. */
  expiresAt?: string;
  /** Why PayPal's rate wasn't used, e.g. "PayPal FEATURE_NOT_PROVISIONED (debug id …)". */
  fallbackReason?: string;
}

export const rateLabel = (source: RateSource) => (source === "paypal" ? "PayPal rate" : "Estimated");

/** Every currency the copilot can show, so one PayPal call covers them all. */
const QUOTE_CURRENCIES = Object.keys(FALLBACK_RATES).filter((c) => c !== "USD");
const HOUR_MS = 3600_000;
/** After PayPal refuses, wait this long before asking again (a 403 won't fix itself in seconds). */
const PAYPAL_RETRY_MS = 10 * 60_000;

let rateCache: (Rates & { until: number }) | null = null;
let paypalRetryAt = 0;

/** Tests only. */
export function resetRateCache() {
  rateCache = null;
  paypalRetryAt = 0;
}

/** PayPal's quote for USD → each currency, as a per-USD map. Throws unless every currency came back. */
async function paypalRates(): Promise<{ rates: Record<string, number>; expiresAt?: string }> {
  const quotes = await paypal.quoteExchangeRates(QUOTE_CURRENCIES.map((c) => ({ base_currency: "USD", quote_currency: c })));
  const rates: Record<string, number> = { USD: 1 };
  let expiresAt: string | undefined;
  for (const q of quotes) {
    const rate = Number(q.exchange_rate);
    if (q.base_amount?.currency_code !== "USD" || !(rate > 0)) continue;
    rates[q.quote_amount.currency_code] = rate;
    if (q.expiry_time && (!expiresAt || q.expiry_time < expiresAt)) expiresAt = q.expiry_time;
  }
  const missing = QUOTE_CURRENCIES.filter((c) => !rates[c]);
  // Don't mix sources in one comparison: all PayPal, or fall back for all.
  if (missing.length) throw new Error(`PayPal didn't quote ${missing.join(", ")}`);
  return { rates, expiresAt };
}

async function marketRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: Record<string, number> };
    return j.rates?.INR ? j.rates : null;
  } catch {
    return null;
  }
}

function reasonOf(e: unknown): string {
  if (e instanceof paypal.PayPalError) return `PayPal ${e.issue || e.status}${e.debugId ? ` (debug id ${e.debugId})` : ""}`;
  return (e as Error)?.message || "PayPal rate unavailable";
}

/**
 * Conversion rates for the FX copilot: PayPal's quote first, then public mid-market rates, then
 * the bundled offline rates. PayPal quotes are cached until they expire (at most an hour); after
 * a PayPal failure, the fallback is cached for 10 minutes before PayPal is asked again.
 */
export async function getRates(): Promise<Rates> {
  const t = Date.now();
  if (rateCache && t < rateCache.until) return rateCache;
  let fallbackReason: string | undefined;
  if (process.env.SHIELD_FORCE_MOCK !== "1" && paypal.paypalMode() !== "mock" && t >= paypalRetryAt) {
    try {
      const { rates, expiresAt } = await paypalRates();
      const until = Math.min(t + HOUR_MS, expiresAt ? Date.parse(expiresAt) || Infinity : Infinity);
      rateCache = { rates, source: "paypal", live: true, expiresAt, until: until > t ? until : t + 60_000 };
      return rateCache;
    } catch (e) {
      fallbackReason = reasonOf(e);
      paypalRetryAt = t + PAYPAL_RETRY_MS;
      console.warn("[fx] PayPal exchange-rate quote failed, using estimated rates:", fallbackReason);
    }
  }
  const retry = paypalRetryAt > t ? paypalRetryAt : t + HOUR_MS;
  const market = process.env.SHIELD_FORCE_MOCK === "1" ? null : await marketRates();
  rateCache = market
    ? { rates: market, source: "market", live: true, fallbackReason, until: Math.min(t + HOUR_MS, retry) }
    : { rates: FALLBACK_RATES, source: "offline", live: false, fallbackReason, until: Math.min(t + HOUR_MS, retry) };
  return rateCache;
}

export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const usd = amount / (rates[from] ?? NaN);
  return usd * (rates[to] ?? NaN);
}

export function estimateFees(amount: number, currency: string, kind: "domestic" | "cross_border") {
  const rate = kind === "domestic" ? FEE_MODEL.domesticRate : FEE_MODEL.crossBorderRate;
  const fixed = FEE_MODEL.fixed[currency] ?? 0.3;
  const fee = +(amount * rate + fixed).toFixed(2);
  return { amount, currency, ratePercent: +(rate * 100).toFixed(2), fixed, fee, net: +(amount - fee).toFixed(2), estimate: true };
}

export interface BillingOption {
  billCurrency: string;
  invoiceAmount: number;
  clientPays: number; // in the client's currency
  clientExtraPercent: number;
  paypalFee: number; // in bill currency
  conversionCost: number; // in home currency
  netHome: number;
  notes: string[];
}

/**
 * Compare billing currencies for a freelancer whose home currency differs
 * from the client's. priceInClientCurrency is what the work is worth to the
 * client in their own currency.
 */
export function compareBilling(
  priceInClientCurrency: number,
  clientCurrency: string,
  homeCurrency: string,
  rates: Record<string, number>,
): { options: BillingOption[]; recommended: string; reason: string } {
  const candidates = Array.from(new Set([clientCurrency, "USD", homeCurrency]));
  const options: BillingOption[] = candidates.map((cur) => {
    const invoiceAmount = +convert(priceInClientCurrency, clientCurrency, cur, rates).toFixed(2);
    const fee = +(invoiceAmount * FEE_MODEL.crossBorderRate + (FEE_MODEL.fixed[cur] ?? 0.3)).toFixed(2);
    const afterFee = invoiceAmount - fee;
    const notes: string[] = [];
    // Client side: paying in a currency other than their own costs them a conversion spread.
    const clientPays = cur === clientCurrency ? invoiceAmount : convert(invoiceAmount, cur, clientCurrency, rates) * (1 + FEE_MODEL.conversionMarkup);
    if (cur !== clientCurrency) notes.push(`Client pays about ${(FEE_MODEL.conversionMarkup * 100).toFixed(1)}% extra to convert`);
    // Freelancer side: converting to home currency costs the spread.
    const midHome = convert(afterFee, cur, homeCurrency, rates);
    const netHome = cur === homeCurrency ? afterFee : midHome * (1 - FEE_MODEL.conversionMarkup);
    const conversionCost = cur === homeCurrency ? 0 : midHome - netHome;
    if (cur !== homeCurrency) notes.push(`You lose about ${(FEE_MODEL.conversionMarkup * 100).toFixed(1)}% converting to ${homeCurrency}; a multi-currency account can avoid this`);
    return {
      billCurrency: cur,
      invoiceAmount,
      clientPays: +clientPays.toFixed(2),
      clientExtraPercent: +(((clientPays - priceInClientCurrency) / priceInClientCurrency) * 100).toFixed(1),
      paypalFee: fee,
      conversionCost: +conversionCost.toFixed(2),
      netHome: +netHome.toFixed(2),
      notes,
    };
  });
  // Best for the freelancer without silently raising the client's price:
  const fair = options.filter((o) => o.clientExtraPercent <= 0.5);
  const bestFair = fair.sort((a, b) => b.netHome - a.netHome)[0];
  const bestOverall = [...options].sort((a, b) => b.netHome - a.netHome)[0];
  if (bestOverall.billCurrency !== bestFair.billCurrency) {
    const gain = bestOverall.netHome - bestFair.netHome;
    return {
      options,
      recommended: bestFair.billCurrency,
      reason: `Bill in ${bestFair.billCurrency} so the client pays exactly the agreed price. Billing in ${bestOverall.billCurrency} would net you about ${gain.toFixed(0)} ${homeCurrency} more, but only because the client absorbs the conversion; agree that with them first.`,
    };
  }
  return { options, recommended: bestFair.billCurrency, reason: `Billing in ${bestFair.billCurrency} leaves you the most after fees without raising the client's cost.` };
}
