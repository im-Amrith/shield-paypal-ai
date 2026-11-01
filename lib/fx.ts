// FX-aware billing copilot + fee estimator. PayPal has no public "quote my
// fees" API, so these are ESTIMATES from PayPal's published fee pages,
// configurable here, and shown in the UI as estimates.

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

let rateCache: { at: number; rates: Record<string, number>; live: boolean } | null = null;

export async function getRates(): Promise<{ rates: Record<string, number>; live: boolean }> {
  if (rateCache && Date.now() - rateCache.at < 3600_000) return rateCache;
  if (process.env.SHIELD_FORCE_MOCK !== "1") {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const j = (await res.json()) as { rates?: Record<string, number> };
        if (j.rates?.INR) {
          rateCache = { at: Date.now(), rates: j.rates, live: true };
          return rateCache;
        }
      }
    } catch {
      /* fall back */
    }
  }
  rateCache = { at: Date.now(), rates: FALLBACK_RATES, live: false };
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
