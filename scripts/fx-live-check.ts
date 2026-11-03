// One live check of the FX copilot's rate source against the PayPal sandbox:
//   npx tsx --env-file=.env.local scripts/fx-live-check.ts
import { getRates, rateLabel } from "../lib/fx";
import { paypalMode } from "../lib/paypal";

async function main() {
  const r = await getRates();
  console.log(`PayPal mode: ${paypalMode()}`);
  console.log(`Source: ${r.source} → shown as "${rateLabel(r.source)}"`);
  if (r.fallbackReason) console.log(`Why not PayPal: ${r.fallbackReason}`);
  if (r.expiresAt) console.log(`PayPal quote valid until: ${r.expiresAt}`);
  console.log(`USD→INR ${r.rates.INR} · USD→EUR ${r.rates.EUR} · USD→GBP ${r.rates.GBP}`);
}

main();
