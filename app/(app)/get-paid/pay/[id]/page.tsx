import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { balance, debtBalance, debtPair, total } from "@/lib/collections";
import type { Invoice } from "@/lib/types";
import { Card, PageHeader, When, Avatar, Note, fmtMoney, relDays, HeroBand, HeroFigure, Hi, AlertBanner } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

/** Pay actions for one invoice. Each invoice of a pair (original + late fee) gets its own. */
function PayActions({ inv, label }: { inv: Invoice; label: string }) {
  const due = balance(inv);
  return (
    <AlertBanner Icon={CircleCheck} title={`${label}: pay ${fmtMoney(due, inv.currency)}`}
      detail={inv.payLink ? `Opens PayPal invoice ${inv.id}${inv.offerPayLater ? "; Pay Later is available" : ""}.` : `Mock mode: payment of ${inv.id} is simulated. With sandbox keys this opens the real PayPal invoice.`}
      actions={<>
        {inv.payLink
          ? <a href={inv.payLink} target="_blank" rel="noreferrer" className={buttonClass("primary")}>Pay {inv.id} on PayPal</a>
          : <ActionButton path="/api/invoices" body={{ action: "pay", id: inv.id, amount: due }}>Pay {inv.id} in full</ActionButton>}
        {!inv.feeFor && <ActionButton variant="secondary" path="/api/invoices" body={{ action: "pay", id: inv.id, amount: +(due / 2).toFixed(2) }}>Pay half ({fmtMoney(+(due / 2).toFixed(2), inv.currency)})</ActionButton>}
        {inv.payLink && <ActionButton variant="secondary" path="/api/invoices" body={{ action: "pay", id: inv.id, amount: due }}>Record full payment (demo)</ActionButton>}
      </>} />
  );
}

function Lines({ inv }: { inv: Invoice }) {
  const due = balance(inv);
  return (
    <dl className="divide-y divide-border px-5">
      {inv.items.map((it, i) => (
        <div key={i} className="flex justify-between gap-4 py-3"><dt>{it.name}</dt><dd className="tabular font-semibold">{fmtMoney(it.amount, inv.currency)}</dd></div>
      ))}
      {inv.amountPaid > 0 && <div className="flex justify-between gap-4 py-3 text-muted"><dt>Paid so far</dt><dd className="tabular">−{fmtMoney(inv.amountPaid, inv.currency)}</dd></div>}
      <div className="flex justify-between gap-4 py-3 text-[17px] font-extrabold"><dt>Balance {inv.id}</dt><dd className="tabular">{fmtMoney(due, inv.currency)}</dd></div>
    </dl>
  );
}

export default async function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = db().invoices.find((i) => i.id === id);
  if (!found) notFound();
  // Always show the whole debt: the original and, once created, its separate late-fee invoice.
  const { original: inv, fee } = debtPair(found);
  const due = debtBalance(inv, fee);
  const at = now();
  const freelancer = db().users.find((u) => u.id === inv.freelancerId)!;
  const late = new Date(inv.dueAt) < at && balance(inv) > 0;
  const open = [inv, fee].filter((i): i is Invoice => !!i && balance(i) > 0 && (i.status === "sent" || i.status === "partially_paid"));

  return (
    <div>
      <PageHeader title={`Invoice ${inv.id}`} subtitle={`From ${freelancer.name} · brand and product design, Kochi`} />
      <HeroBand visual={<HeroFigure sub={due > 0 ? "balance due" : "paid in full"}>{fmtMoney(due > 0 ? due : total(inv) + (fee ? total(fee) : 0), inv.currency)}</HeroFigure>}
        label="Balance due"
        title={due > 0 ? <>Due <Hi>{relDays((open[0] ?? inv).dueAt, at)}</Hi></> : <>Paid <Hi tone="success">in full</Hi></>}>
        {due > 0
          ? <>{late ? "This invoice is past its due date. " : ""}{fee ? <>Includes the late fee, invoiced separately as {fee.id}: {fmtMoney(balance(inv), inv.currency)} on {inv.id} and {fmtMoney(balance(fee), fee.currency)} on {fee.id}.</> : <>Due <When iso={inv.dueAt} date />{inv.amountPaid > 0 ? ` · ${fmtMoney(inv.amountPaid, inv.currency)} already paid` : ""}.</>}</>
          : "Thank you. Meera has been notified and reminders have stopped."}
      </HeroBand>

      {due > 0
        ? open.map((i) => <PayActions key={i.id} inv={i} label={i.feeFor ? `Late fee ${i.id}` : `Invoice ${i.id}`} />)
        : <AlertBanner tone="success" Icon={CircleCheck} title="Paid in full. Thank you." detail="Meera has been notified. Reminders have stopped." />}

      <Card className="max-w-3xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <Avatar id={inv.freelancerId} size={44} />
          <div className="min-w-0"><p className="font-bold">{freelancer.name}</p><p className="text-[14px] text-muted">Invoice {inv.id}{fee ? ` · late fee invoiced separately (${fee.id})` : ""}</p></div>
        </div>
        <Lines inv={inv} />
        {fee && <><p className="border-t border-border px-5 pt-4 text-[14px] font-bold">Late fee invoice {fee.id} · due <When iso={fee.dueAt} date /></p><Lines inv={fee} /></>}
        {inv.lateFeePercent > 0 && <Note className="px-5 pb-4">Terms: a {inv.lateFeePercent}% late fee applies after the due date, as agreed on the invoice. It is billed as its own invoice, so {inv.id} itself never changes.</Note>}
      </Card>
    </div>
  );
}
