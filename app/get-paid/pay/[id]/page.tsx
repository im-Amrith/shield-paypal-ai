import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { balance } from "@/lib/collections";
import { Card, Money, PageHeader } from "@/components/ui";
import { ActionButton, buttonClass } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function PayInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = db().invoices.find((i) => i.id === id);
  if (!inv) notFound();
  const due = balance(inv);
  const freelancer = db().users.find((u) => u.id === inv.freelancerId)!;
  return (
    <div>
      <PageHeader title={`Invoice ${inv.id}`} subtitle={`From ${freelancer.name}`} back="/" />
      <Card className="mb-4">
        {inv.items.map((it, i) => <p key={i} className="flex justify-between text-sm"><span>{it.name}</span><Money amount={it.amount} currency={inv.currency} /></p>)}
        <p className="mt-2 flex justify-between border-t border-ink/10 pt-2 font-semibold"><span>Balance</span><Money amount={due} currency={inv.currency} /></p>
      </Card>
      {due > 0 ? (
        <div className="space-y-3">
          {inv.payLink && <a href={inv.payLink} target="_blank" rel="noreferrer" className={buttonClass("primary", true)}>Pay on PayPal{inv.offerPayLater ? " (Pay Later available)" : ""}</a>}
          <ActionButton full variant={inv.payLink ? "secondary" : "primary"} path="/api/invoices" body={{ action: "pay", id: inv.id, amount: due }}>{inv.payLink ? "Demo: record full payment" : "Pay in full (simulated)"}</ActionButton>
          <ActionButton full variant="secondary" path="/api/invoices" body={{ action: "pay", id: inv.id, amount: +(due / 2).toFixed(2) }}>Pay half now, rest later</ActionButton>
        </div>
      ) : <Card tone="safe"><p className="font-semibold">Paid in full. Thank you!</p></Card>}
    </div>
  );
}
