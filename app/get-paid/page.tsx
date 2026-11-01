import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { balance, nextStep, total, LADDER } from "@/lib/collections";
import { Card, Badge, Money, PageHeader, Section, Empty, When } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";

export const dynamic = "force-dynamic";

const toneLabel: Record<string, string> = { heads_up: "Heads-up", friendly: "Friendly nudge", firm: "Firm reminder", final: "Final notice", handoff: "Handed back to you" };

export default async function GetPaid() {
  const me = await getUser();
  const invoices = db().invoices.filter((i) => i.freelancerId === me.id);
  const at = now();
  return (
    <div>
      <PageHeader title="Get Paid" subtitle="Send the invoice once. The collections agent does the chasing, politely and within limits." />
      <Link href="/get-paid/account" className="mb-5 block text-sm font-semibold text-brand underline">Account health & freeze alerts →</Link>
      <Section title="New invoice"><Card><InvoiceForm /></Card></Section>
      <Section title="Invoices">
        {invoices.length ? invoices.map((inv) => {
          const step = nextStep(inv, at);
          const overdue = new Date(inv.dueAt) < at && inv.status !== "paid";
          return (
            <Card key={inv.id}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{inv.id} · {inv.clientName.split(" (")[0]}</span>
                <Badge tone={inv.status === "paid" ? "safe" : overdue ? "danger" : "brand"}>{inv.status === "paid" ? "paid" : overdue ? "overdue" : inv.status.replace("_", " ")}</Badge>
              </div>
              <p className="text-sm text-ink/60">
                <Money amount={total(inv)} currency={inv.currency} />{inv.amountPaid > 0 && inv.status !== "paid" ? <> · <Money amount={balance(inv)} currency={inv.currency} /> left</> : null} · due {new Date(inv.dueAt).toDateString()}
                {inv.lateFeePercent ? ` · ${inv.lateFeePercent}% late fee agreed` : ""}
              </p>
              {inv.reminders.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-brand">{inv.reminders.length} message{inv.reminders.length > 1 ? "s" : ""} sent by the agent</summary>
                  <ol className="mt-2 space-y-2">
                    {inv.reminders.map((r, i) => (
                      <li key={i} className="rounded-lg bg-ink/5 p-2 text-xs">
                        <p className="font-semibold">{toneLabel[r.tone] || r.tone} · <When iso={r.at} /></p>
                        {r.body && <p className="mt-1 whitespace-pre-wrap text-ink/70">{r.body}</p>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {inv.status !== "paid" && (
                <p className="mt-2 text-xs text-ink/50">
                  {step ? `Next: ${toneLabel[step.tone]} (due now)` : (() => {
                    const done = new Set(inv.reminders.map((r) => r.step));
                    const nxt = LADDER.find((s) => !done.has(s.step) && s.tone !== "heads_up");
                    return nxt ? `Next: ${toneLabel[nxt.tone]} ${nxt.offsetDays} days after the due date` : "Reminders finished";
                  })()}
                </p>
              )}
            </Card>
          );
        }) : <Empty>No invoices yet. Send one above, then use Demo → fast-forward to watch the agent work.</Empty>}
      </Section>
    </div>
  );
}
