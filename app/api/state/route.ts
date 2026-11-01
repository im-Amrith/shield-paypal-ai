import { handle } from "@/lib/http";
import { db } from "@/lib/store";
import { getPersona } from "@/lib/session";

// Lightweight polling endpoint so open screens update when something happens elsewhere.
export const GET = handle(async (b) => {
  const me = await getPersona();
  const d = db();
  const unread = d.notifications.filter((n) => n.userId === me && !n.read).length;
  const c = b.caseId ? d.cases.find((x) => x.id === b.caseId) : undefined;
  return { unread, caseUpdatedAt: c?.updatedAt, version: d.notifications.length + d.cases.reduce((s, x) => s + x.messages.length, 0) + d.holds.length + d.vaultDeals.reduce((s, x) => s + x.history.length, 0) };
});
