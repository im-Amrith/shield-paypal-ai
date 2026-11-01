import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";
import { Card, PageHeader, Section, When } from "@/components/ui";
import { ActionButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const d = db();
  const offsetH = Math.round((d.clockOffsetMs || 0) / 3600_000);
  return (
    <div>
      <PageHeader title="Demo controls" subtitle="For judges: fast-forward time to watch week-long flows (reminders, auto-release, re-alerts) in seconds." />
      <Card className="mb-4">
        <p className="text-sm">Demo clock: <b><When iso={now().toISOString()} /></b>{offsetH ? ` (+${offsetH}h)` : ""}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ActionButton variant="secondary" path="/api/demo" body={{ action: "advance", hours: 1 }}>+1 hour</ActionButton>
          <ActionButton variant="secondary" path="/api/demo" body={{ action: "advance", hours: 24 }}>+1 day</ActionButton>
          <ActionButton variant="secondary" path="/api/demo" body={{ action: "advance", hours: 72 }}>+3 days</ActionButton>
          <ActionButton variant="secondary" path="/api/demo" body={{ action: "advance", hours: 168 }}>+1 week</ActionButton>
        </div>
        <p className="mt-2 text-[11px] text-ink/45">Every jump also runs the background jobs: Vault auto-release and expiry, invoice reminders, freeze re-alerts and early warnings.</p>
      </Card>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <ActionButton variant="secondary" path="/api/demo" body={{ action: "jobs" }}>Run jobs now</ActionButton>
        <ActionButton variant="danger" path="/api/demo" body={{ action: "reset" }} confirm="Reset all demo data?">Reset demo</ActionButton>
      </div>
      <Card tone="brand" className="mb-5 text-sm">
        <p className="font-semibold">Suggested walkthrough</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>As Meera: Get Paid → send an invoice, then +1 week twice to watch the agent chase. Switch to Dana and pay half.</li>
          <li>As Meera: Account health → simulate a limitation; read the explanation and appeal.</li>
          <li>As Meera: Vault → create a link. As Arjun: pay, then confirm or report a problem.</li>
          <li>As Ravi: Send money → try the “tax office” preset. As Meera: block it.</li>
          <li>As Ravi: Support → “earbuds never arrived”, reply “that didn't work”. As Priya: approve the refund in the console.</li>
        </ol>
      </Card>
      <Section title="Integrations">
        <Card className="text-sm">
          <p>PayPal: <b>{paypalMode()}</b> · AI: <b>{llmProvider()}</b> · Email: <b>{process.env.RESEND_API_KEY ? "Resend" : "outbox only"}</b></p>
          <p className="mt-1 text-[11px] text-ink/45">Simulated on purpose: account limitation events (the sandbox can't freeze accounts) and carrier delivery scans. Fees are estimates.</p>
        </Card>
      </Section>
      <Section title={`Email outbox (${d.outbox.length})`}>
        {d.outbox.slice(0, 15).map((o, i) => (
          <details key={i} className="rounded-xl border border-ink/10 bg-white p-3">
            <summary className="cursor-pointer text-sm"><b>{o.subject}</b> <span className="text-xs text-ink/50">→ {o.to} · {o.provider}</span></summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-ink/70">{o.body}</pre>
          </details>
        ))}
      </Section>
    </div>
  );
}
