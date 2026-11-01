import { handle } from "@/lib/http";
import { attemptPayment, decideHold } from "@/lib/guardian";
import { getPersona } from "@/lib/session";
import { db } from "@/lib/store";

export const POST = handle(async (b) => {
  const me = await getPersona();
  if (b.action === "pay") {
    const amount = Number(b.amount);
    if (!(amount > 0)) throw new Error("Enter an amount");
    if (!String(b.payee || "").trim()) throw new Error("Who are you paying?");
    return attemptPayment(me, { payee: String(b.payee).trim(), amount, currency: "USD", note: String(b.note || ""), method: b.method || "paypal" });
  }
  const hold = db().holds.find((h) => h.id === b.holdId);
  if (!hold) throw new Error("Hold not found");
  if (b.action === "approve" || b.action === "block") {
    if (hold.guardianId !== me) throw new Error("Only the guardian can approve or block");
    return decideHold(hold.id, b.action === "approve" ? "approved" : "blocked");
  }
  if (b.action === "cancel") {
    if (hold.seniorId !== me) throw new Error("Only the sender can cancel");
    return decideHold(hold.id, "cancelled_by_senior");
  }
  throw new Error("Unknown action");
});
