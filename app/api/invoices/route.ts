import { handle } from "@/lib/http";
import { createInvoice, recordPayment, runCollections } from "@/lib/collections";
import { getPersona } from "@/lib/session";

export const POST = handle(async (b) => {
  const me = await getPersona();
  if (b.action === "create") {
    return createInvoice(me, {
      clientName: String(b.clientName || "").trim() || "Client",
      clientEmail: String(b.clientEmail || "").trim(),
      relationship: ["new", "regular", "key_account"].includes(b.relationship) ? b.relationship : "regular",
      items: (b.items || []).map((i: { name: string; amount: number }) => ({ name: String(i.name || "Work"), amount: Number(i.amount) })),
      currency: String(b.currency || "USD"),
      dueInDays: Math.max(1, Math.min(90, Number(b.dueInDays) || 14)),
      lateFeePercent: Number(b.lateFeePercent) || 0,
      offerPayLater: !!b.offerPayLater,
    });
  }
  if (b.action === "pay") return recordPayment(b.id, Number(b.amount));
  if (b.action === "run") return runCollections();
  throw new Error("Unknown action");
});
