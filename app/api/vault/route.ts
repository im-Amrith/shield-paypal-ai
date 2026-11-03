import { handle } from "@/lib/http";
import * as vault from "@/lib/vault";
import { getPersona } from "@/lib/session";

export const POST = handle(async (b) => {
  const me = await getPersona();
  switch (b.action) {
    case "create":
      return vault.createDeal(me, String(b.title || ""), Number(b.amount), String(b.currency || "USD"), Number(b.autoReleaseHours) || 72);
    case "order": // the buyer clicked the PayPal button: a fresh AUTHORIZE order for this deal
      return vault.checkoutOrder(String(b.id), me);
    case "authorize":
      return vault.authorize(b.id, me, b.orderId);
    case "ship":
      if (vault.getDeal(b.id)?.sellerId !== me) throw new Error("Only the seller can add tracking");
      return vault.ship(b.id, String(b.trackingNumber || ""), String(b.carrier || ""));
    case "deliver": // simulated carrier webhook (demo control)
      return vault.markDelivered(b.id);
    case "confirm":
      return vault.confirmReceipt(b.id, me);
    case "dispute":
      return vault.dispute(b.id, me, String(b.reason || "Item not as described"));
    case "cancel":
      return vault.cancel(b.id, me);
    case "resolve":
      if (me !== "agent") throw new Error("Only support can resolve disputes");
      return vault.resolveDispute(b.id, b.outcome);
    default:
      throw new Error("Unknown action");
  }
});
