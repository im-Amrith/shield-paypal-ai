import Link from "next/link";
import { Activity } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { balance, debtBalance, debtPair, nextStep, total, LADDER, invoiceLinkNote } from "@/lib/collections";
import type { Invoice } from "@/lib/types";
import { Card, Pill, Money, PageHeader, Section, Empty, When, Track, Mark, fmtMoney, relDays, HeroBand, HeroGauge, Hi, LinkNote, type Tone } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";
import { clientEmail } from "@/lib/seed";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

const TONE_LABEL: Record<string, string> = { heads_up: "Heads-up", friendly: "Friendly nudge", firm: "Firm reminder", final: "Final notice", handoff: "Back to you" };
const SHORT: Record<string, string> = { heads_up: "Heads-up", friendly: "Nudge", firm: "Firm", final: "Final", handoff: "Back to you" };
const LADDER_STEPS = LADDER.map((s) => SHORT[s.tone]);

function status(inv: Invoice, at: Date): { label: string; tone: Tone } {
  if (inv.status === "paid") return { label: "Paid", tone: "success" };
  if (inv.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  if (new Date(inv.dueAt) < at) return { label: inv.status === "partially_paid" ? "Part paid · overdue" : "Overdue", tone: "accent" };
  if (inv.status === "partially_paid") return { label: "Part paid", tone: "accent" };
  return { label: "Sent", tone: "neutral" };
}

function nextLine(inv: Invoice, at: Date, fee?: Invoice) {
  const step = nextStep(inv, at, fee);
  if (step) return `${TONE_LABEL[step.tone]} goes out on the next run`;
  const nxt = LADDER.find((s) => s.step > Math.max(-1, ...inv.reminders.map((r) => r.step)));
  if (!nxt) return "Reminders finished. You decide what happens next.";
  const when = new Date(new Date(inv.dueAt).getTime() + nxt.offsetDays * 86400_000);
  return `Next: ${TONE_LABEL[nxt.tone].toLowerCase()} ${relDays(when.toISOString(), at)}`;
}

export default async function GetPaid() {
  const me = await getUser();
  const at = now();
  const invoices = db().invoices.filter((i) => i.freelancerId === me.id).sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid") || a.dueAt.localeCompare(b.dueAt));
  const open = invoices.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const outstanding = open.reduce((s, i) => s + balance(i), 0);
  const overdue = open.filter((i) => new Date(i.dueAt) < at);
  const collected = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const pct = collected + outstanding ? Math.round((collected / (collected + outstanding)) * 100) : 0;
  const sent = invoices.reduce((s, i) => s + i.reminders.length, 0);

  return (
    <div>
      <PageHeader title="Get Paid" subtitle="Send the invoice once. The collections agent chases it politely, never more than every 3 days." />
      <HeroBand
        visual={<HeroGauge value={pct} display={`${pct}`} suffix="%" label="Share of invoiced money collected" valueText={`${pct}% collected`} />}
        label="Outstanding"
        title={<><Hi>{fmtMoney(outstanding, "USD")}</Hi> still owed</>}
        aside={<Link href="/get-paid/account" className={buttonClass("secondary")}><Activity size={17} aria-hidden /> Account health</Link>}>
        {invoices.length
          ? `${pct}% of what you've invoiced is collected (${fmtMoney(collected, "USD")}). ${open.length} open, ${overdue.length} overdue · ${sent} reminder${sent === 1 ? "" : "s"} sent for you.`
          : "No invoices yet. Send one below and the agent takes it from there."}
      </HeroBand>

      <section id="new" className="mb-8 scroll-mt-20"><InvoiceForm defaultClientEmail={clientEmail()} /></section>

      <Section title="Invoices" className="!mb-0">
        {invoices.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {invoices.map((inv) => {
              const st = status(inv, at);
              const reached = inv.reminders.length ? Math.max(...inv.reminders.map((r) => r.step)) + 1 : 0;
              const { fee } = debtPair(inv);
              const chasing = !inv.feeFor && inv.status !== "cancelled" && debtBalance(inv, fee) > 0;
              return (
                <Card key={inv.id} as="article" className="overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <Mark name={inv.clientName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-bold">{inv.clientName.split(" (")[0]}</h3>
                            <p className="truncate text-[14px] text-muted">{inv.id} · {inv.items[0]?.name}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Money amount={inv.status === "paid" ? total(inv) : balance(inv)} currency={inv.currency} size="lg" />
                            <div className="mt-1"><Pill tone={st.tone}>{st.label}</Pill></div>
                          </div>
                        </div>
                        <p className="mt-2 text-[14px] text-muted">
                          Due <When iso={inv.dueAt} date /> ({relDays(inv.dueAt, at)})
                          {inv.amountPaid > 0 && inv.status !== "paid" && <> · {fmtMoney(inv.amountPaid, inv.currency)} of {fmtMoney(total(inv), inv.currency)} paid</>}
                          {inv.lateFeePercent ? ` · ${inv.lateFeePercent}% late fee agreed` : ""}
                          {fee && <> · <span className="font-semibold text-fg">Late fee invoiced separately ({fee.id})</span></>}
                          {inv.feeFor && <> · Late fee for {inv.feeFor}, chased together with it</>}
                        </p>
                        <LinkNote note={invoiceLinkNote(inv)} className="mt-1" />
                      </div>
                    </div>
                    {chasing && (
                      <div className="mt-4">
                        <Track steps={LADDER_STEPS} current={reached} />
                        <p className="mt-3 text-[14px]">{nextLine(inv, at, fee)}{fee && inv.status === "paid" ? ` (for the open late fee, ${fee.id})` : ""}</p>
                      </div>
                    )}
                  </div>
                  {inv.reminders.length > 0 && (
                    <details className="group border-t border-border">
                      <summary className="press flex cursor-pointer items-center justify-between px-5 py-3 text-[14px] font-bold text-accent hover:bg-raised">
                        {inv.reminders.length} message{inv.reminders.length > 1 ? "s" : ""} the agent sent <span aria-hidden className="text-muted transition group-open:rotate-180">⌄</span>
                      </summary>
                      <ol className="space-y-3 px-5 pb-5">
                        {inv.reminders.map((r, i) => (
                          <li key={i} className="rounded-panel bg-raised p-4">
                            <p className="flex flex-wrap justify-between gap-2 text-[14px]"><span className="font-bold">{TONE_LABEL[r.tone] || r.tone}</span><span className="text-muted"><When iso={r.at} /></span></p>
                            {r.subject && <p className="mt-1 text-[14px] font-semibold">{r.subject}</p>}
                            {r.body && <p className="mt-1 whitespace-pre-wrap text-[14px] text-muted">{r.body}</p>}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </Card>
              );
            })}
          </div>
        ) : <Empty>No invoices yet. Send one above, then use Demo to fast-forward a week and watch the agent chase it.</Empty>}
      </Section>
    </div>
  );
}
