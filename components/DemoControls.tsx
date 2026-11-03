"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CalendarPlus, CalendarRange, CalendarDays, Play, RotateCcw, CircleCheck, CircleAlert } from "lucide-react";
import { api, ActionButton, Spinner, buttonClass } from "./client";

const JUMPS = [
  { hours: 1, label: "+1 hour", Icon: Clock },
  { hours: 24, label: "+1 day", Icon: CalendarPlus },
  { hours: 72, label: "+3 days", Icon: CalendarRange },
  { hours: 168, label: "+1 week", Icon: CalendarDays },
];

interface JobsRun { summary: string; skipped: { record: string; reason: string }[]; errors: { job: string; record?: string; message: string; debugId?: string }[] }

/** Time jumps and "Run jobs", with a one-line summary of what the jobs did (never a raw error). */
export function DemoControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [run, setRun] = useState<{ label: string; jobs: JobsRun } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async (label: string, body: Record<string, unknown>) => {
    setBusy(label); setErr(null);
    try {
      const r = await api<{ jobs: JobsRun }>("/api/demo", body);
      setRun({ label, jobs: r.jobs });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const trouble = run && (run.jobs.errors.length > 0 || run.jobs.skipped.length > 0);
  return (
    <>
      <section aria-label="Time controls" className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6 lg:gap-4">
        {[...JUMPS.map((j) => ({ ...j, body: { action: "advance", hours: j.hours } })), { hours: 0, label: "Run jobs", Icon: Play, body: { action: "jobs" } }].map((j) => (
          <div key={j.label} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
            <j.Icon size={26} aria-hidden className="text-accent" />
            <button className={buttonClass("secondary", true)} disabled={busy !== null} aria-busy={busy === j.label} onClick={() => go(j.label, j.body)}>
              {busy === j.label ? <><Spinner /> Running…</> : j.label}
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          <RotateCcw size={26} aria-hidden className="text-danger" />
          <ActionButton full variant="danger" path="/api/demo" body={{ action: "reset" }} confirm="Reset all demo data back to the seed?" onDone={() => setRun(null)}>Reset</ActionButton>
        </div>
      </section>
      <div className="mb-6 min-h-[24px]" role="status" aria-live="polite">
        {run && (
          <div className={`arrive rounded-control border p-3 text-[14px] ${trouble ? "border-border bg-raised" : "border-transparent"}`}>
            <p className="flex items-start gap-2">
              {trouble ? <CircleAlert size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" /> : <CircleCheck size={17} aria-hidden className="mt-0.5 shrink-0 text-success" />}
              <span><span className="font-bold">{run.label}:</span> {run.jobs.summary}</span>
            </p>
            {trouble && (
              <details className="mt-2 pl-6 text-muted">
                <summary className="cursor-pointer">Details</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {run.jobs.skipped.map((s, i) => <li key={`s${i}`}>{s.record} {s.reason}. Shield did its own part (emails, status); PayPal wasn&apos;t called.</li>)}
                  {run.jobs.errors.map((e, i) => <li key={`e${i}`}>{e.record ?? e.job}: {e.message}{e.debugId ? ` (debug id ${e.debugId})` : ""}. The other records still ran.</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
        {err && <p role="alert" className="text-[14px] text-danger">{err}</p>}
      </div>
    </>
  );
}
