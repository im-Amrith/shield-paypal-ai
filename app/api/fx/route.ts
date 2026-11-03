import { handle } from "@/lib/http";
import { compareBilling, getRates, rateLabel } from "@/lib/fx";

export const POST = handle(async (b) => {
  const price = Number(b.price);
  if (!(price > 0)) throw new Error("Enter the agreed price");
  const { rates, live, source, expiresAt, fallbackReason } = await getRates();
  const clientCurrency = String(b.clientCurrency || "USD");
  if (!rates[clientCurrency]) throw new Error(`No rate for ${clientCurrency}`);
  return {
    ...compareBilling(price, clientCurrency, String(b.homeCurrency || "INR"), rates),
    live, rateSource: source, rateLabel: rateLabel(source), rateExpiresAt: expiresAt, fallbackReason,
  };
});
