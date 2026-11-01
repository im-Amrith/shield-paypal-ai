import { handle } from "@/lib/http";
import * as s from "@/lib/support";
import { getPersona } from "@/lib/session";
import { db } from "@/lib/store";

export const POST = handle(async (b) => {
  const me = await getPersona();
  const lang = String(b.lang || "en-IN");
  const own = () => {
    const c = db().cases.find((x) => x.id === b.caseId);
    if (!c) throw new Error("Case not found");
    if (me !== "agent" && c.customerId !== me) throw new Error("Not your case");
    return c;
  };
  switch (b.action) {
    case "start":
      return s.startCase(me, String(b.text || ""), lang);
    case "message":
      own();
      return s.customerMessage(b.caseId, String(b.text || ""), lang);
    case "confirm":
      own();
      return s.executeAction(b.caseId, b.actionId, "customer");
  }
  if (me !== "agent") throw new Error("Support console only");
  own();
  switch (b.action) {
    case "decide":
      return s.humanDecision(b.caseId, b.actionId, !!b.approve, b.note);
    case "takeover":
      return s.humanTakeover(b.caseId);
    case "human_message":
      return s.humanMessage(b.caseId, String(b.text || ""));
    case "resolve":
      return s.resolveCase(b.caseId);
    case "resolve_vault": {
      const { resolveDispute } = await import("@/lib/vault");
      return resolveDispute(b.dealId, b.outcome);
    }
  }
  throw new Error("Unknown action");
});
