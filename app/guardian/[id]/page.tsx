import { notFound } from "next/navigation";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, Badge, Money, PageHeader, RiskMeter, When } from "@/components/ui";
import { ActionButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function HoldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = db().holds.find((x) => x.id === id);
  if (!h) notFound();
  const me = await getUser();
  const senior = db().users.find((u) => u.id === h.seniorId)!;
  const guardian = db().users.find((u) => u.id === h.guardianId)!;
  return (
    <div className="text-[17px]">
      <PageHeader title={me.id === h.guardianId ? `Check ${senior.name.split(" ")[0]}'s payment` : "Payment paused for a check"} back="/guardian" />
      <Card className="mb-4">
        <p className="text-sm text-ink/60">To</p>
        <p className="text-xl font-semibold">{h.payee}</p>
        <p className="mt-1 text-2xl font-semibold"><Money amount={h.amount} currency={h.currency} /></p>
        {h.note && <p className="mt-1 text-sm italic text-ink/70">“{h.note}”</p>}
        <p className="mt-2 text-xs text-ink/50">Requested <When iso={h.createdAt} /></p>
        <div className="mt-4"><RiskMeter score={h.riskScore} label="Scam risk" /></div>
      </Card>
      <Card tone="warn" className="mb-4">
        <p className="mb-2 font-semibold">Why we paused it</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">{h.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </Card>
      {h.status === "held" ? (
        <div className="space-y-3">
          {me.id === h.guardianId && (
            <>
              <ActionButton full variant="danger" path="/api/guardian" body={{ action: "block", holdId: h.id }}>Block this payment</ActionButton>
              <ActionButton full variant="secondary" path="/api/guardian" body={{ action: "approve", holdId: h.id }} confirm={`Send ${h.currency} ${h.amount} to ${h.payee}?`}>It's fine — approve</ActionButton>
              <p className="text-xs text-ink/50">Tip: call {senior.name.split(" ")[0]} first. Scammers often tell people to keep the payment secret.</p>
            </>
          )}
          {me.id === h.seniorId && (
            <>
              <p className="text-sm">We've asked {guardian.name.split(" ")[0]} to confirm. No money has left your account.</p>
              <ActionButton full variant="secondary" path="/api/guardian" body={{ action: "cancel", holdId: h.id }}>Cancel this payment</ActionButton>
              <p className="text-xs text-ink/50">If someone is pressuring you on the phone right now, hang up. Real officials never ask for payment like this.</p>
            </>
          )}
          {me.id !== h.seniorId && me.id !== h.guardianId && <p className="text-sm text-ink/60">Switch to Meera to decide, or Ravi to cancel.</p>}
        </div>
      ) : (
        <Card tone={h.status === "approved" ? "safe" : "danger"}>
          <Badge tone={h.status === "approved" ? "safe" : "danger"}>{h.status.replace(/_/g, " ")}</Badge>
          <p className="mt-1 text-sm">{h.status === "approved" ? "The payment was sent." : "No money was sent."}{h.decidedAt && <> Decided <When iso={h.decidedAt} />.</>}</p>
        </Card>
      )}
    </div>
  );
}
