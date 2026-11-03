"use client";
// While a PayPal popup is open the page must not re-render the button's container: PayPal's SDK
// fails with "Detected container element removed from DOM". LiveRefresh (and anything else that
// would call router.refresh) checks this flag first.

let open = 0;
let since = 0;
/** A popup left open longer than this (tab abandoned) no longer blocks refreshes. */
const MAX_HOLD_MS = 15 * 60_000;

export function setCheckoutOpen(on: boolean) {
  open = on ? 1 : 0;
  since = on ? Date.now() : 0;
}

export function isCheckoutOpen(): boolean {
  if (open && Date.now() - since > MAX_HOLD_MS) setCheckoutOpen(false);
  return open === 1;
}
