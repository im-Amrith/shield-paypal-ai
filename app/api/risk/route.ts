import { handle } from "@/lib/http";
import { simulateLimitation, liftLimitation, explainLimitation, earlyWarning } from "@/lib/risk";
import { getPersona } from "@/lib/session";

export const POST = handle(async (b) => {
  const me = await getPersona();
  if (b.action === "simulate") return simulateLimitation(me, b.reason || undefined);
  if (b.action === "lift") return liftLimitation(me);
  if (b.action === "warn") return earlyWarning(me);
  if (b.action === "explain") return explainLimitation(me);
  throw new Error("Unknown action");
});
