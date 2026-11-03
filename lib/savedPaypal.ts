// "Save PayPal for the shopping agent": Vault v3 save-without-purchase.
// 1. startSave: our server creates a setup token (buyer approves it in the PayPal popup).
// 2. finishSave: our server exchanges the approved setup token for a payment token.
// The payment token id and PayPal customer id stay on the user record on the server; the
// browser only ever sees the payer's email and when it was saved.
import type { Persona, SavedPayPal } from "./types";
import { db, mutate } from "./store";
import { nowIso } from "./clock";
import * as paypal from "./paypal";

export const SAVE_DESCRIPTION = "Shield shopping agent — pays only within your caps";

/** What the page may show. Never includes the token id. */
export interface SavedPayPalView { email?: string; savedAt: string }

function user(userId: Persona) {
  const u = db().users.find((x) => x.id === userId);
  if (!u) throw new Error("Unknown user");
  return u;
}

/** Server-side only: the saved token, if any. */
export function savedPayPalFor(userId: Persona): SavedPayPal | undefined {
  return db().users.find((x) => x.id === userId)?.savedPayPal;
}

export function savedPayPalView(userId: Persona): SavedPayPalView | null {
  const s = savedPayPalFor(userId);
  return s ? { email: s.email, savedAt: s.savedAt } : null;
}

/** Step 1: a setup token for the popup. `returnUrl`/`cancelUrl` are required by PayPal (the popup doesn't use them). */
export async function startSave(userId: Persona, urls: { returnUrl: string; cancelUrl: string }): Promise<{ setupTokenId: string }> {
  const u = user(userId);
  const st = await paypal.createVaultSetupToken({ description: SAVE_DESCRIPTION, ...urls, customerId: u.savedPayPal?.customerId });
  mutate((d) => { d.users.find((x) => x.id === userId)!.pendingVaultSetupToken = st.id; });
  return { setupTokenId: st.id };
}

/** Step 2: after the buyer approved in the popup. Only the setup token we issued to this user is accepted. */
export async function finishSave(userId: Persona, setupTokenId: string): Promise<SavedPayPalView> {
  const u = user(userId);
  if (!setupTokenId || setupTokenId !== u.pendingVaultSetupToken) throw new Error("That PayPal approval doesn't match this session. Click Save PayPal again.");
  const pt = await paypal.createPaymentTokenFromSetup(setupTokenId);
  const previous = u.savedPayPal?.paymentTokenId;
  const saved: SavedPayPal = { paymentTokenId: pt.id, customerId: pt.customerId, email: pt.email ?? (paypal.paypalMode() === "mock" ? u.email : undefined), savedAt: nowIso() };
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    x.savedPayPal = saved;
    delete x.pendingVaultSetupToken;
  });
  // Saving again replaces the old token; remove it on PayPal too (best effort).
  if (previous && previous !== pt.id) await paypal.deletePaymentToken(previous).catch(() => undefined);
  return { email: saved.email, savedAt: saved.savedAt };
}

/** Mock mode only: the popup is simulated, so do both steps at once. */
export async function simulateSave(userId: Persona): Promise<SavedPayPalView> {
  if (paypal.paypalMode() !== "mock") throw new Error("Save PayPal in the PayPal window");
  const { setupTokenId } = await startSave(userId, { returnUrl: "https://example.invalid/r", cancelUrl: "https://example.invalid/c" });
  return finishSave(userId, setupTokenId);
}

/**
 * Delete the payment token on PayPal, then forget it. A token PayPal no longer knows (404) is
 * forgotten too; any other PayPal failure keeps it, so the user can try again.
 */
export async function removeSaved(userId: Persona): Promise<{ removed: boolean }> {
  const s = savedPayPalFor(userId);
  if (!s) return { removed: false };
  try {
    await paypal.deletePaymentToken(s.paymentTokenId);
  } catch (e) {
    if (!(e instanceof paypal.PayPalError && e.status === 404)) throw e;
  }
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    delete x.savedPayPal;
    delete x.pendingVaultSetupToken;
  });
  return { removed: true };
}
