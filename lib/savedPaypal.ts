// "Save PayPal for the shopping agent": Vault v3 save-without-purchase.
// 1. startSave: our server creates a setup token (buyer approves it in the PayPal popup).
// 2. finishSave: our server exchanges the approved setup token for a payment token.
// The payment token id and PayPal customer id stay on the user record on the server; the
// browser only ever sees the payer's email and when it was saved.
import type { Persona, SavedPayPal } from "./types";
import { db, mutate } from "./store";
import { nowIso } from "./clock";
import * as paypal from "./paypal";
import { linkNote, linkState, onPayPal, stampLink, type PayPalLink } from "./paypalLink";

export const SAVE_DESCRIPTION = "Shield shopping agent — pays only within your caps";

/** What the page may show. Never includes the token id. */
export interface SavedPayPalView { email?: string; savedAt: string; note?: string }

function user(userId: Persona) {
  const u = db().users.find((x) => x.id === userId);
  if (!u) throw new Error("Unknown user");
  return u;
}

/** The saved PayPal's account link (records saved before links existed: MOCK… tokens are mock). */
const savedLink = (s: SavedPayPal): PayPalLink | undefined => s.paypalLink ?? (s.paymentTokenId.startsWith("MOCK") ? { mode: "mock" } : undefined);

/** Any saved PayPal, usable or not (Remove works on all). */
function storedPayPal(userId: Persona): SavedPayPal | undefined {
  return db().users.find((x) => x.id === userId)?.savedPayPal;
}

/**
 * Server-side only: the saved token the agent may charge. One saved under another PayPal account
 * (or that PayPal no longer has) isn't usable, so carts fall back to the PayPal window.
 */
export function savedPayPalFor(userId: Persona): SavedPayPal | undefined {
  const s = storedPayPal(userId);
  if (!s) return undefined;
  const st = linkState(savedLink(s));
  return st === "current" || st === "unknown" ? s : undefined;
}

export function savedPayPalView(userId: Persona): SavedPayPalView | null {
  const s = storedPayPal(userId);
  if (!s) return null;
  const note = linkNote(savedLink(s));
  return { email: s.email, savedAt: s.savedAt, ...(note ? { note } : {}) };
}

/** Charge (or otherwise use) the saved token; a 404 marks it missing so it isn't used again. */
export function onSavedPayPal<T>(userId: Persona, call: (s: SavedPayPal) => Promise<T>) {
  const s = storedPayPal(userId)!;
  return onPayPal(`saved PayPal (${userId})`, savedLink(s), (link) => mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!.savedPayPal;
    if (x) x.paypalLink = link;
  }), () => call(s));
}

/** Step 1: a setup token for the popup. `returnUrl`/`cancelUrl` are required by PayPal (the popup doesn't use them). */
export async function startSave(userId: Persona, urls: { returnUrl: string; cancelUrl: string }): Promise<{ setupTokenId: string }> {
  const u = user(userId);
  // Reuse the PayPal customer only when the saved PayPal is on the current account.
  const st = await paypal.createVaultSetupToken({ description: SAVE_DESCRIPTION, ...urls, customerId: savedPayPalFor(userId)?.customerId });
  mutate((d) => { d.users.find((x) => x.id === userId)!.pendingVaultSetupToken = st.id; });
  return { setupTokenId: st.id };
}

/** Step 2: after the buyer approved in the popup. Only the setup token we issued to this user is accepted. */
export async function finishSave(userId: Persona, setupTokenId: string): Promise<SavedPayPalView> {
  const u = user(userId);
  if (!setupTokenId || setupTokenId !== u.pendingVaultSetupToken) throw new Error("That PayPal approval doesn't match this session. Click Save PayPal again.");
  const pt = await paypal.createPaymentTokenFromSetup(setupTokenId);
  const previous = u.savedPayPal?.paymentTokenId;
  const saved: SavedPayPal = { paymentTokenId: pt.id, customerId: pt.customerId, email: pt.email ?? (paypal.paypalMode() === "mock" ? u.email : undefined), savedAt: nowIso(), paypalLink: stampLink() };
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    x.savedPayPal = saved;
    delete x.pendingVaultSetupToken;
  });
  // Saving again replaces the old token; remove it on PayPal too (best effort, and only if it's on this account).
  if (previous && previous !== pt.id && u.savedPayPal && linkState(savedLink(u.savedPayPal)) !== "other_account")
    await paypal.deletePaymentToken(previous).catch(() => undefined);
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
  const s = storedPayPal(userId);
  if (!s) return { removed: false };
  // On another PayPal account or already missing: nothing to delete on this account, just forget it.
  await onSavedPayPal(userId, (x) => paypal.deletePaymentToken(x.paymentTokenId));
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    delete x.savedPayPal;
    delete x.pendingVaultSetupToken;
  });
  return { removed: true };
}
