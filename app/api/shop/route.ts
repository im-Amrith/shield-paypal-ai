import { handle } from "@/lib/http";
import { getPersona } from "@/lib/session";
import * as shop from "@/lib/shop";

// Shopping agent. Every path that can move money (plan → auto checkout, approve, pay)
// goes through decideSpend() inside lib/shop.ts.
export const POST = handle(async (b) => {
  const me = await getPersona();
  switch (b.action) {
    case "plan":
      return shop.planCart(me, String(b.need || ""));
    case "approve":
      return shop.approveCart(me, String(b.id));
    case "decline":
      return shop.declineCart(me, String(b.id));
    case "order": // the payer clicked the PayPal button: a fresh CAPTURE order for this cart
      return shop.checkoutOrder(me, String(b.id));
    case "pay":
      return shop.pay(me, String(b.id), b.orderId ? String(b.orderId) : undefined);
    case "reorder":
      return shop.proposeReorder(me, String(b.id));
    case "reorder-active":
      return shop.setReorderActive(me, String(b.id), Boolean(b.active));
    case "caps":
      return shop.updatePolicy(me, { perOrderCap: Number(b.perOrderCap), monthlyCap: Number(b.monthlyCap), autoApproveBelow: Number(b.autoApproveBelow) });
    case "revoke":
      return shop.updatePolicy(me, { revoked: Boolean(b.revoked) });
    default:
      throw new Error("Unknown action");
  }
});
