import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { balance, total } from "@/lib/collections";
import { Card, PageHeader, When, Avatar, Note, fmtMoney, relDays, HeroBand, HeroFigure, Hi, AlertBanner } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

export default async function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = db().invoices.find((i) => i.id === id);
  if (!inv) notFound();
  const due = balance(inv);
  const at = now();
  const freelancer = db().users.find((u) => u.id === inv.freelancerId)!;
  const late = new Date(inv.dueAt) < at && due > 0;

  return (
    <div>
      <PageHeader title={`Invoice ${inv.id}`} subtitle={`From ${freelancer.name} · brand and product design, Kochi`} />
      <HeroBand visual={<HeroFigure sub={due > 0 ? "balance due" : "paid in full"}>{fmtMoney(due > 0 ? due : total(inv), inv.currency)}</HeroFigure>}
        label="Balance due"
        title={due > 0 ? <>Due <Hi>{relDays(inv.dueAt, at)}</Hi></> : <>Paid <Hi tone="success">in full</Hi></>}>
        {due > 0 ? <>{late ? "This invoice is past its due date. " : ""}Due <When iso={inv.dueAt} date />{inv.amountPaid > 0 ? ` · ${fmtMoney(inv.amountPaid, inv.currency)} already paid` : ""}.</> : "Thank you. Meera has been notified and reminders have stopped."}
      </HeroBand>

      {due > 0 ? (
        <AlertBanner Icon={CircleCheck} title={`Pay ${fmtMoney(due, inv.currency)} to ${freelancer.name}`}
          detail={inv.payLink ? `Opens the PayPal invoice${inv.offerPayLater ? "; Pay Later is available" : ""}.` : "Mock mode: payment is simulated. With sandbox keys this opens the real PayPal invoice."}
          actions={<>
            {inv.payLink
              ? <a href={inv.payLink} target="_blank" rel="noreferrer" className={buttonClass("primary")}>Pay on PayPal</a>
              : <ActionButton path="/api/invoices" body={{ action: "pay", id: inv.id, amount: due }}>Pay in full</ActionButton>}
            <ActionButton variant="secondary" path="/api/invoices" body={{ action: "pay", id: inv.id, amount: +(due / 2).toFixed(2) }}>Pay half ({fmtMoney(+(due / 2).toFixed(2), inv.currency)})</ActionButton>
            {inv.payLink && <ActionButton variant="secondary" path="/api/invoices" body={{ action: "pay", id: inv.id, amount: due }}>Record full payment (demo)</ActionButton>}
          </>} />
      ) : (
        <AlertBanner tone="success" Icon={CircleCheck} title="Paid in full. Thank you." detail="Meera has been notified. Reminders have stopped." />
      )}

      <Card className="max-w-3xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <Avatar id={inv.freelancerId} size={44} />
          <div className="min-w-0"><p className="font-bold">{freelancer.name}</p><p className="text-[14px] text-muted">Invoice {inv.id}</p></div>
        </div>
        <dl className="divide-y divide-border px-5">
          {inv.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-4 py-3"><dt>{it.name}</dt><dd className="tabular font-semibold">{fmtMoney(it.amount, inv.currency)}</dd></div>
          ))}
          {inv.amountPaid > 0 && <div className="flex justify-between gap-4 py-3 text-muted"><dt>Paid so far</dt><dd className="tabular">−{fmtMoney(inv.amountPaid, inv.currency)}</dd></div>}
          <div className="flex justify-between gap-4 py-3 text-[17px] font-extrabold"><dt>Balance</dt><dd className="tabular">{fmtMoney(due, inv.currency)}</dd></div>
        </dl>
        {inv.lateFeePercent > 0 && <Note className="px-5 pb-4">Terms: a {inv.lateFeePercent}% late fee applies after the due date, as agreed on the invoice.</Note>}
      </Card>
    </div>
  );
}
