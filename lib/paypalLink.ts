// Which PayPal account a record's PayPal IDs belong to, and a per-run report for background jobs.
//
// Every record that holds a PayPal ID (invoice, late-fee invoice, Vault deal, shop cart, saved
// PayPal) carries a `paypalLink`: the mode it was created in and the last 6 characters of the
// PayPal client ID. PayPal is only called for records on the current mode + client. A record
// PayPal no longer has (404 RESOURCE_NOT_FOUND) is marked "missing" and PayPal isn't asked again.
// Either way Shield's own side of the flow (emails, status, release) carries on.
import { AsyncLocalStorage } from "node:async_hooks";
import { PayPalError, paypalMode } from "./paypal";
import { nowIso } from "./clock";

export interface PayPalLink {
  mode: "mock" | "sandbox";
  /** Last 6 characters of the PayPal client ID (sandbox only). */
  client?: string;
  /** Set when PayPal answered that the record doesn't exist; PayPal isn't called for it again. */
  missing?: { at: string; issue: string; debugId?: string };
}

export type LinkState = "current" | "unknown" | "other_account" | "missing";

export const LINK_NOTE: Record<"other_account" | "missing", string> = {
  other_account: "Not linked to the current PayPal account",
  missing: "PayPal record missing",
};

export function currentAccount(): { mode: "mock" | "sandbox"; client?: string } {
  const mode = paypalMode();
  return mode === "sandbox" ? { mode, client: (process.env.PAYPAL_CLIENT_ID || "").slice(-6) } : { mode };
}

/** The link to store on a record whose PayPal ID was just created. */
export function stampLink(): PayPalLink {
  const a = currentAccount();
  return a.client ? { mode: a.mode, client: a.client } : { mode: a.mode };
}

/**
 * The record's link. Records from before links existed have none: a MOCK… id was made in mock mode;
 * any other id is "unknown" and gets one try (success stamps it, a 404 marks it missing).
 */
export function linkOf(rec: { paypalLink?: PayPalLink }, ...ids: (string | undefined)[]): PayPalLink | undefined {
  if (rec.paypalLink) return rec.paypalLink;
  if (ids.some((id) => id?.startsWith("MOCK"))) return { mode: "mock" };
  return undefined;
}

export function linkState(link: PayPalLink | undefined): LinkState {
  if (link?.missing) return "missing";
  const a = currentAccount();
  if (!link) return a.mode === "sandbox" ? "unknown" : "other_account";
  if (link.mode !== a.mode || (a.mode === "sandbox" && link.client !== a.client)) return "other_account";
  return "current";
}

/** The note to show on a record, or null when it's on the current account. */
export function linkNote(link: PayPalLink | undefined): string | null {
  const s = linkState(link);
  return s === "other_account" || s === "missing" ? LINK_NOTE[s] : null;
}

/** PayPal says the resource isn't there (or isn't this account's). */
export function isMissingOnPayPal(e: unknown): e is PayPalError {
  if (!(e instanceof PayPalError)) return false;
  return e.status === 404 || ["RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID", "PERMISSION_DENIED"].includes(e.issue ?? "");
}

/**
 * Call PayPal for an existing record, only when it's linked to the current account. Returns
 * `{ ok: false }` instead of throwing when the call was skipped or PayPal says the record is gone
 * (then `mark` stores the "missing" flag). Other PayPal errors are thrown as before.
 */
export async function onPayPal<T>(
  record: string,
  link: PayPalLink | undefined,
  mark: (link: PayPalLink) => void,
  call: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; state: "other_account" | "missing" }> {
  const state = linkState(link);
  if (state === "other_account" || state === "missing") {
    noteSkip(record, state === "missing" ? "its PayPal record is missing" : "isn't on the current PayPal account");
    return { ok: false, state };
  }
  try {
    const value = await call();
    if (state === "unknown") mark(stampLink());
    return { ok: true, value };
  } catch (e) {
    if (!isMissingOnPayPal(e)) throw e;
    mark({ ...(link ?? stampLink()), missing: { at: nowIso(), issue: e.issue || String(e.status), debugId: e.debugId } });
    console.warn(`[paypal] ${record}: PayPal record missing (${e.issue || e.status}, debug_id ${e.debugId ?? "none"}). PayPal won't be called for it again.`);
    noteSkip(record, `its PayPal record is missing (${e.issue || e.status}${e.debugId ? `, debug id ${e.debugId}` : ""})`);
    return { ok: false, state: "missing" };
  }
}

// ---------- Run report (background jobs) ----------

export interface JobSkip { record: string; reason: string }
export interface JobError { job: string; record?: string; message: string; debugId?: string }
interface Report { skipped: JobSkip[]; errors: JobError[] }

const reports = new AsyncLocalStorage<Report>();

/** Run `fn` with a fresh report that onPayPal / perRecord write into (concurrent runs stay separate). */
export async function withReport<T>(fn: (report: Report) => Promise<T>): Promise<T> {
  const report: Report = { skipped: [], errors: [] };
  return reports.run(report, () => fn(report));
}

export function noteSkip(record: string, reason: string) {
  const r = reports.getStore();
  if (r && !r.skipped.some((s) => s.record === record && s.reason === reason)) r.skipped.push({ record, reason });
}

export function noteError(job: string, record: string | undefined, e: unknown) {
  const debugId = e instanceof PayPalError ? e.debugId : undefined;
  const message = (e as Error)?.message || String(e);
  console.error(`[jobs] ${job}${record ? ` ${record}` : ""} failed: ${message}${debugId ? ` (debug_id ${debugId})` : ""}`);
  reports.getStore()?.errors.push({ job, record, message, debugId });
}

/**
 * Run one record's step of a job. A failure is logged (with PayPal's debug_id), reported, and
 * returned as `${record}:error`, never thrown: one bad record can't stop the others.
 */
export async function perRecord(job: string, record: string, fn: () => Promise<void>, log: string[]): Promise<void> {
  try {
    await fn();
  } catch (e) {
    noteError(job, record, e);
    log.push(`${record}:error`);
  }
}
