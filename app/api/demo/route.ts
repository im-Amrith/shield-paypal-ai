import { handle } from "@/lib/http";
import { advanceClock, HOUR } from "@/lib/clock";
import { resetDB } from "@/lib/store";
import { runJobs } from "@/lib/jobs";

export const POST = handle(async (b) => {
  if (process.env.DEMO_CONTROLS === "off") throw new Error("Demo controls are disabled");
  if (b.action === "reset") {
    resetDB();
    return { reset: true };
  }
  if (b.action === "advance") {
    const hours = Math.max(1, Math.min(24 * 30, Number(b.hours) || 24));
    const at = advanceClock(hours * HOUR);
    return { now: at.toISOString(), jobs: await runJobs() };
  }
  if (b.action === "jobs") return { jobs: await runJobs() };
  throw new Error("Unknown action");
});
