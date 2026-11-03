// Live check of the saved PayPal (Vault v3) against the PayPal sandbox.
// First save PayPal once in the browser (/shop → "Save PayPal for the shopping agent", as Meera),
// against the same data file, then run:
//   npx tsx --env-file=.env.local scripts/vault-live-check.ts [persona] [amount]
// It charges USD 5 (default) to the saved payment token with no buyer present, exactly like the
// agent does (payment_source.paypal.vault_id, intent CAPTURE), and prints the capture id. It does not
// record anything in Shield's data: refund it from the sandbox business account if you like.
import { db } from "../lib/store";
import { paypalMode, chargeSavedPayPal, paypalErrorInfo, PayPalError } from "../lib/paypal";
import type { Persona } from "../lib/types";

async function main() {
  const persona = (process.argv[2] || "meera") as Persona;
  const amount = Number(process.argv[3] || 5);
  if (paypalMode() !== "sandbox") throw new Error("PayPal sandbox keys aren't set (or SHIELD_FORCE_MOCK=1). Run with --env-file=.env.local");
  if (!(amount > 0 && amount <= 20)) throw new Error("Keep the live check between USD 0.01 and 20");
  const saved = db().users.find((u) => u.id === persona)?.savedPayPal;
  if (!saved) throw new Error(`No saved PayPal for ${persona}. Save it on /shop first (same SHIELD_DB_PATH as the app).`);
  console.log(`Saved PayPal for ${persona}: ${saved.email ?? "(email not returned)"} · saved ${saved.savedAt}`);
  const requestId = `vault-live-check-${Date.now()}`;
  try {
    const r = await chargeSavedPayPal({
      vaultId: saved.paymentTokenId, amount, currency: "USD", description: "Shield saved-PayPal live check",
      referenceId: requestId, requestId,
    });
    console.log(`Order ${r.orderId}: ${r.status}`);
    if (r.captureId) console.log(`Capture id: ${r.captureId}  (USD ${amount.toFixed(2)}, no buyer present)`);
    else console.log("PayPal wants the payer to approve this one; the agent would fall back to the PayPal window.");
  } catch (e) {
    if (e instanceof PayPalError) {
      console.error(paypalErrorInfo(e).message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
