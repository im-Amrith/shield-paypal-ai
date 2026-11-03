// Background jobs: run by /api/jobs (cron on Render) and after the demo clock moves.
// Each job, and each record inside a job, runs on its own: one failing record (say, an invoice
// whose PayPal ID belongs to another PayPal app) is logged and reported, never fatal to the run.
import { tickVault } from "./vault";
import { runCollections } from "./collections";
import { earlyWarning, renotifyUnread } from "./risk";
import { db } from "./store";
import { tickReorders } from "./shop";
import { withReport, noteError, perRecord, type JobSkip, type JobError } from "./paypalLink";

export interface JobsRun {
  /** How many jobs ran. */
  ran: number;
  /** What happened, e.g. "released:vault_1", "INV-1001:friendly", "INV-1002:error". */
  log: string[];
  /** Records whose PayPal side was skipped (other PayPal account, or the PayPal record is missing). */
  skipped: JobSkip[];
  /** Records that failed, with PayPal's debug_id when there is one. */
  errors: JobError[];
  /** One line for people, e.g. "Ran 5 jobs · 2 updates · 1 skipped: INV-1001 isn't on the current PayPal account". */
  summary: string;
}

const JOBS: [string, (log: string[]) => Promise<string[]>][] = [
  ["Vault auto-release and expiry", () => tickVault()],
  ["invoice reminders", () => runCollections()],
  ["monthly reorders", () => tickReorders()],
  ["freeze re-alerts", async () => { const n = await renotifyUnread(); return n ? [`renotified:${n}`] : []; }],
  ["early warnings", async (log) => {
    const out: string[] = [];
    for (const u of db().users.filter((x) => x.role === "freelancer")) {
      await perRecord("early warnings", u.id, async () => { if (await earlyWarning(u.id)) out.push(`risk-warning:${u.id}`); }, log);
    }
    return out;
  }],
];

export async function runJobs(): Promise<JobsRun> {
  return withReport(async (report) => {
    const log: string[] = [];
    for (const [name, job] of JOBS) {
      try {
        log.push(...(await job(log)));
      } catch (e) {
        noteError(name, undefined, e); // a job-level failure: the remaining jobs still run
      }
    }
    return { ran: JOBS.length, log, skipped: report.skipped, errors: report.errors, summary: summarize(JOBS.length, log, report.skipped, report.errors) };
  });
}

function summarize(ran: number, log: string[], skipped: JobSkip[], errors: JobError[]): string {
  const updates = log.filter((l) => !l.endsWith(":error")).length;
  const parts = [`Ran ${ran} jobs`, updates ? `${updates} update${updates > 1 ? "s" : ""}` : "nothing due"];
  const list = <T,>(items: T[], fmt: (x: T) => string) => items.slice(0, 3).map(fmt).join("; ") + (items.length > 3 ? `; +${items.length - 3} more` : "");
  if (skipped.length) parts.push(`${skipped.length} skipped: ${list(skipped, (s) => `${s.record} ${s.reason}`)}`);
  if (errors.length) parts.push(`${errors.length} failed: ${list(errors, (e) => `${e.record ?? e.job}: ${e.message.slice(0, 80)}${e.debugId ? ` (debug id ${e.debugId})` : ""}`)}`);
  return parts.join(" · ");
}
