// Vault: escrow-style payments using PayPal authorize-now, capture-later.
// Funds are held on the buyer's payment method (not in our account) and
// captured to the seller only on delivery confirmation or auto-release.
import type { Persona, VaultDeal, VaultStatus } from "./types";
import { db, mutate, uid } from "./store";
import { HOUR, DAY, now, nowIso, hoursBetween } from "./clock";
import * as paypal from "./paypal";
import { PayPalError, HONOR_PERIOD_DAYS, AUTHORIZATION_PERIOD_DAYS } from "./paypal";
import { notify } from "./notify";
import { estimateFees } from "./fx";
import { viaToolkit } from "./toolkit";
import { onPayPal, linkOf, linkNote, stampLink, noteSkip, perRecord, LINK_NOTE, type PayPalLink } from "./paypalLink";

/** PayPal's carrier codes for the names sellers usually type; anything else is sent as OTHER. */
export function paypalCarrier(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  const known: Record<string, string> = {
    indiapost: "INDIA_POST", speedpost: "INDIA_POST", bluedart: "BLUEDART", delhivery: "IND_DELHIVERY", dtdc: "DTDC_IN", ekart: "EKART",
    ups: "UPS", usps: "USPS", fedex: "FEDEX", dhl: "DHL", dhlexpress: "DHL",
  };
  return known[n] || "OTHER";
}

export const MAX_DEAL_DAYS = 21; // stay well inside PayPal's 29-day authorization period

const allowed: Record<string, VaultStatus[]> = {
  authorize: ["created"],
  ship: ["authorized"],
  deliver: ["shipped"],
  confirm: ["shipped", "delivered"],
  dispute: ["authorized", "shipped", "delivered"],
  cancel: ["created", "authorized"],
  resolve: ["disputed"],
};

function assert(deal: VaultDeal | undefined, action: keyof typeof allowed): VaultDeal {
  if (!deal) throw new Error("Vault deal not found");
  if (!allowed[action].includes(deal.status)) throw new Error(`Can't ${action} a deal that is ${deal.status}`);
  return deal;
}

function update(id: string, fn: (d: VaultDeal) => void, event: string, detail?: string): VaultDeal {
  return mutate((x) => {
    const d = x.vaultDeals.find((v) => v.id === id)!;
    fn(d);
    d.history.push({ at: nowIso(), event, detail });
    return { ...d };
  });
}

export function getDeal(id: string) {
  return db().vaultDeals.find((v) => v.id === id);
}

export async function createDeal(sellerId: Persona, title: string, amount: number, currency: string, autoReleaseHours = 72) {
  if (!(amount > 0) || amount > 10000) throw new Error("Amount must be between 0 and 10,000");
  if (!title.trim()) throw new Error("Describe the item");
  const id = uid("vault");
  // No PayPal order yet: it's created when the buyer clicks the PayPal button (checkoutOrder),
  // so it is never stale by the time they pay.
  const deal: VaultDeal = {
    id, sellerId, title: title.trim(), amount, currency, status: "created", createdAt: nowIso(), autoReleaseHours,
    history: [{ at: nowIso(), event: "created", detail: `${currency} ${amount} Vault deal; the buyer pays into a PayPal hold (intent AUTHORIZE)` }],
  };
  mutate((x) => {
    x.vaultDeals.unshift(deal);
  });
  return { deal, fees: estimateFees(amount, currency, "domestic") };
}

/**
 * The buyer clicked the PayPal button: create a fresh AUTHORIZE order for the deal's amount and
 * remember its id. Each click gets a new order; only the latest one can be authorized.
 */
export async function checkoutOrder(id: string, buyerId: Persona): Promise<{ orderId: string }> {
  const deal = assert(getDeal(id), "authorize");
  if (buyerId === deal.sellerId) throw new Error("The seller can't pay their own Vault deal");
  const order = await paypal.createOrder({ amount: deal.amount, currency: deal.currency, description: `Vault: ${deal.title}`, intent: "AUTHORIZE", referenceId: id });
  mutate((x) => {
    const d = x.vaultDeals.find((v) => v.id === id)!;
    d.paypalOrderId = order.id;
    d.orderCreatedAt = nowIso();
    d.paypalLink = stampLink(); // a fresh order on the current PayPal account
  });
  return { orderId: order.id };
}

/** Called after the buyer approves the PayPal order. Places the hold. */
export async function authorize(id: string, buyerId: Persona, approvedOrderId?: string) {
  const deal = assert(getDeal(id), "authorize");
  if (buyerId === deal.sellerId) throw new Error("The seller can't pay their own Vault deal");
  let orderId = approvedOrderId;
  if (orderId && orderId !== deal.paypalOrderId) throw new Error("That PayPal order doesn't belong to this deal. Click the PayPal button again.");
  if (!orderId) {
    // Mock mode's simulated approval: no popup, so make the order here.
    if (paypal.paypalMode() !== "mock") throw new Error("Pay with the PayPal button first");
    orderId = (await checkoutOrder(id, buyerId)).orderId;
  }
  const a = await paypal.authorizeOrder(orderId);
  const out = update(id, (d) => {
    d.status = "authorized";
    d.buyerId = buyerId;
    d.paypalOrderId = orderId;
    d.authorizationId = a.authorizationId;
    d.authorizedAt = nowIso();
  }, "authorized", `Funds held: authorization ${a.authorizationId}`);
  await notify(deal.sellerId, { kind: "vault", title: `Payment secured for "${deal.title}"`, body: `${deal.currency} ${deal.amount} is held. Ship the item and add tracking.`, link: `/vault/${id}` });
  return out;
}

export async function ship(id: string, trackingNumber: string, carrier: string) {
  const deal = assert(getDeal(id), "ship");
  if (!trackingNumber.trim()) throw new Error("Tracking number required");
  const out = update(id, (d) => {
    d.status = "shipped";
    d.trackingNumber = trackingNumber.trim();
    d.carrier = carrier.trim() || "Other";
    d.shippedAt = nowIso();
  }, "shipped", `${carrier} ${trackingNumber}`);
  await shareTracking(id);
  if (deal.buyerId) await notify(deal.buyerId, { kind: "vault", title: `"${deal.title}" has shipped`, body: `Tracking ${trackingNumber}. Confirm when it arrives.`, link: `/vault/${id}` });
  return out;
}

/**
 * Register the tracking number with PayPal. PayPal attaches tracking to a *capture* (Orders v2
 * /track requires capture_id; trackers-batch wants the capture's transaction id), so while the
 * money is only authorized the tracking is kept as "pending" and sent right after release.
 * Seller protection relies on PayPal seeing it. A failure never blocks shipping or release;
 * it's recorded on the deal instead.
 */
export async function shareTracking(id: string) {
  const deal = getDeal(id)!;
  if (!deal.trackingNumber) return;
  // Checked first: a deal off the current PayPal account never gets a capture to attach tracking to.
  const note = linkNote(dealLink(deal));
  if (note) {
    noteSkip(id, note === LINK_NOTE.missing ? "its PayPal record is missing" : "isn't on the current PayPal account");
    update(id, (d) => {
      d.paypalTracking = { status: "skipped", via: "not sent to PayPal", at: nowIso(), detail: `${note}. Tracking is kept in Shield only.` };
    }, "tracking kept in Shield", note);
    return;
  }
  const carrier = paypalCarrier(deal.carrier || "");
  const captureId = deal.captureId;
  if (!captureId) {
    update(id, (d) => {
      d.paypalTracking = { status: "pending", via: "waiting for capture", at: nowIso(), detail: "Sent to PayPal when the payment is released (PayPal tracks captured payments, not holds)" };
    }, "tracking saved for release");
    return;
  }
  try {
    const run = await viaToolkit("create_shipment_tracking",
      { transaction_id: captureId, tracking_number: deal.trackingNumber, carrier, status: "SHIPPED" },
      () => ({ status: "SHIPPED" }),
      () => paypal.addTracking({ captureId, orderId: deal.paypalOrderId!, trackingNumber: deal.trackingNumber!, carrier, carrierNameOther: deal.carrier }));
    update(id, (d) => {
      d.paypalTracking = { status: "shared", via: run.via, at: nowIso(), detail: `${carrier} ${deal.trackingNumber} on capture ${captureId}` };
    }, "tracking shared with PayPal", run.via);
  } catch (e) {
    update(id, (d) => {
      d.paypalTracking = { status: "failed", via: "PayPal Agent Toolkit · create_shipment_tracking", at: nowIso(), detail: (e as Error).message.slice(0, 200) };
    }, "tracking not accepted by PayPal", (e as Error).message.slice(0, 200));
  }
}

/** Carrier says delivered (simulated tracking webhook). Starts the auto-release window. */
export async function markDelivered(id: string) {
  const deal = assert(getDeal(id), "deliver");
  const out = update(id, (d) => {
    d.status = "delivered";
    d.deliveredAt = nowIso();
  }, "delivered", `Auto-release in ${deal.autoReleaseHours}h unless the buyer reports a problem`);
  if (deal.buyerId)
    await notify(deal.buyerId, { kind: "vault", title: `"${deal.title}" was delivered`, body: `Confirm it's as described, or report a problem within ${deal.autoReleaseHours} hours. After that, payment releases to the seller.`, link: `/vault/${id}`, email: true });
  return out;
}

/**
 * Whether a failed capture should be retried through a reauthorization. PayPal (Payments v2):
 * the honor period is 3 days; reauthorize is allowed once, on days 4–29; after that a new
 * authorization is needed. Only a 422 (business rule) qualifies: a 400 is a malformed request
 * and a reauthorization wouldn't fix it, and inside the honor period reauthorize itself is refused.
 */
export function canReauthorize(deal: Pick<VaultDeal, "authorizedAt" | "reauthorizedAt">, err: unknown, at = now()): boolean {
  if (!(err instanceof PayPalError) || err.status !== 422) return false;
  if (!deal.authorizedAt || deal.reauthorizedAt) return false;
  const days = (at.getTime() - new Date(deal.authorizedAt).getTime()) / DAY;
  return days > HONOR_PERIOD_DAYS && days <= AUTHORIZATION_PERIOD_DAYS;
}

async function capture(deal: VaultDeal): Promise<string> {
  try {
    return (await paypal.captureAuthorization(deal.authorizationId!)).captureId;
  } catch (e) {
    if (!canReauthorize(deal, e)) throw e;
    const re = await paypal.reauthorize(deal.authorizationId!, deal.amount, deal.currency);
    update(deal.id, (d) => {
      d.authorizationId = re.authorizationId;
      d.reauthorizedAt = nowIso();
    }, "reauthorized", `Honor period over; capture refused (${(e as PayPalError).issue || "422"}), new authorization ${re.authorizationId}`);
    return (await paypal.captureAuthorization(re.authorizationId)).captureId;
  }
}

/** The deal's PayPal account link, and how to store a change to it. */
const dealLink = (deal: VaultDeal) => linkOf(deal, deal.paypalOrderId, deal.authorizationId, deal.captureId);
const markDeal = (id: string) => (link: PayPalLink) => mutate((x) => { x.vaultDeals.find((v) => v.id === id)!.paypalLink = link; });

async function release(id: string, reason: string) {
  const deal = getDeal(id)!;
  // A deal whose hold isn't on the current PayPal account (or that PayPal no longer has) is still
  // released in Shield; there is just no PayPal capture to record.
  const cap = deal.authorizationId ? await onPayPal(id, dealLink(deal), markDeal(id), () => capture(deal)) : null;
  const captureId = cap?.ok ? cap.value : undefined;
  const out = update(id, (d) => {
    d.status = "released";
    d.captureId = captureId;
    d.releasedAt = nowIso();
  }, "released", `${reason}. ${captureId ? `Capture ${captureId}` : `No PayPal capture: ${cap && !cap.ok ? LINK_NOTE[cap.state] : "no PayPal hold"}`}`);
  // The buyer's payment, with its PayPal capture: Resolve can find it and refund it like any purchase.
  if (deal.buyerId)
    mutate((d) => {
      const seller = d.users.find((u) => u.id === deal.sellerId)?.name || deal.sellerId;
      d.transactions.push({ id: uid("tx"), userId: deal.buyerId!, at: nowIso(), amount: deal.amount, currency: deal.currency, direction: "out",
        counterparty: seller, country: "IN", type: "goods_services", memo: `Vault: ${deal.title}`, captureId });
    });
  if (deal.trackingNumber) await shareTracking(id);
  await notify(deal.sellerId, { kind: "vault", title: `You've been paid for "${deal.title}"`, body: `${deal.currency} ${deal.amount} released (${reason.toLowerCase()}).`, link: `/vault/${id}`, email: true });
  return out;
}

export async function confirmReceipt(id: string, buyerId: Persona) {
  const deal = assert(getDeal(id), "confirm");
  if (deal.buyerId !== buyerId) throw new Error("Only the buyer can confirm receipt");
  return release(id, "Buyer confirmed receipt");
}

export async function dispute(id: string, byId: Persona, reason: string) {
  const deal = assert(getDeal(id), "dispute");
  if (byId !== deal.buyerId) throw new Error("Only the buyer can report a problem");
  const out = update(id, (d) => {
    d.status = "disputed";
    d.disputeReason = reason;
  }, "disputed", `Release paused: ${reason}`);
  await notify(deal.sellerId, { kind: "vault", title: `Problem reported on "${deal.title}"`, body: `Release is paused: ${reason}. Shield support will help you both.`, link: `/vault/${id}`, email: true });
  return out;
}

/** Support resolves a dispute: refund (void) the buyer or pay the seller. */
export async function resolveDispute(id: string, outcome: "refund_buyer" | "pay_seller") {
  const deal = assert(getDeal(id), "resolve");
  if (outcome === "pay_seller") return release(id, "Dispute resolved for the seller");
  if (deal.authorizationId) await onPayPal(id, dealLink(deal), markDeal(id), () => paypal.voidAuthorization(deal.authorizationId!));
  return update(id, (d) => {
    d.status = "voided";
  }, "voided", "Dispute resolved for the buyer; hold released back to the buyer");
}

export async function cancel(id: string, byId: Persona) {
  const deal = assert(getDeal(id), "cancel");
  if (byId !== deal.sellerId && byId !== deal.buyerId) throw new Error("Not your deal");
  if (deal.authorizationId) await onPayPal(id, dealLink(deal), markDeal(id), () => paypal.voidAuthorization(deal.authorizationId!));
  return update(id, (d) => {
    d.status = "voided";
  }, "voided", `Cancelled by ${byId} before shipping`);
}

/** Background job: auto-release and expiry. Safe to run repeatedly; one failing deal never stops the others. */
export async function tickVault(): Promise<string[]> {
  const done: string[] = [];
  const t = now();
  for (const listed of db().vaultDeals) {
    await perRecord("vault", listed.id, async () => {
      const deal = getDeal(listed.id)!;
      if (deal.status === "delivered" && deal.deliveredAt && hoursBetween(deal.deliveredAt, t) >= deal.autoReleaseHours) {
        await release(deal.id, "Auto-released after the delivery window with no problem reported");
        done.push(`released:${deal.id}`);
      } else if (
        ["authorized", "shipped"].includes(deal.status) && deal.authorizedAt &&
        t.getTime() - new Date(deal.authorizedAt).getTime() > MAX_DEAL_DAYS * DAY
      ) {
        // PayPal drops an expired hold by itself, so a failed void doesn't stop the expiry.
        if (deal.authorizationId)
          await onPayPal(deal.id, dealLink(deal), markDeal(deal.id), () => paypal.voidAuthorization(deal.authorizationId!))
            .catch((e) => console.error(`[vault] void for expired ${deal.id} failed:`, (e as Error).message));
        update(deal.id, (d) => {
          d.status = "expired";
        }, "expired", `No delivery within ${MAX_DEAL_DAYS} days; hold released to the buyer`);
        done.push(`expired:${deal.id}`);
      }
    }, done);
  }
  return done;
}

/** For the deal page: why PayPal isn't used for this deal, or null. */
export function dealLinkNote(deal: VaultDeal): string | null {
  return linkNote(dealLink(deal));
}

export function releaseEta(deal: VaultDeal): string | null {
  if (deal.status !== "delivered" || !deal.deliveredAt) return null;
  return new Date(new Date(deal.deliveredAt).getTime() + deal.autoReleaseHours * HOUR).toISOString();
}
