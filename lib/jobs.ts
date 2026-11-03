// Background jobs: run by /api/jobs (cron on Render) and after the demo clock moves.
import { tickVault } from "./vault";
import { runCollections } from "./collections";
import { earlyWarning, renotifyUnread } from "./risk";
import { db } from "./store";
import { tickReorders } from "./shop";

export async function runJobs(): Promise<string[]> {
  const log: string[] = [];
  log.push(...(await tickVault()));
  log.push(...(await runCollections()));
  log.push(...(await tickReorders()));
  const re = await renotifyUnread();
  if (re) log.push(`renotified:${re}`);
  for (const u of db().users.filter((x) => x.role === "freelancer")) {
    if (await earlyWarning(u.id)) log.push(`risk-warning:${u.id}`);
  }
  return log;
}
