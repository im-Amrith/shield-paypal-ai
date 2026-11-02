import { notFound } from "next/navigation";
import { Phone, CircleCheck, Ban, AlertTriangle } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, PageHeader, When, Mark, fmtMoney, HeroBand, HeroGauge, Hi, AlertBanner } from "@/components/ui";
import { ActionButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function HoldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = db().holds.find((x) => x.id === id);
  if (!h) notFound();
  const me = await getUser();
  const senior = db().users.find((u) => u.id === h.seniorId)!;
  const guardian = db().users.find((u) => u.id === h.guardianId)!;
  const isGuardian = me.id === h.guardianId;
  const isSenior = me.id === h.seniorId;
  const sFirst = senior.name.split(" ")[0];
  const gFirst = guardian.name.split(" ")[0];
  const level = h.riskScore >= 60 ? "High" : h.riskScore >= 30 ? "Elevated" : "Low";

  return (
    <div className={isSenior ? "text-[17px]" : ""}>
      <PageHeader title={isGuardian ? `Check ${sFirst}'s payment` : "Payment paused for a check"} back="/guardian" backLabel={isGuardian ? "Dad's payments" : "Send money"} />

      <HeroBand visual={<HeroGauge value={h.riskScore} label="Scam risk" valueText={`${h.riskScore} out of 100, ${level.toLowerCase()}`} />}
        label="Scam risk" title={<>{fmtMoney(h.amount, h.currency)} to {h.payee}: <Hi tone={h.riskScore >= 30 ? "accent" : "success"}>{level}</Hi></>}>
        {h.status === "held" ? (isSenior ? `No money has left your account. We've asked ${gFirst} to confirm.` : `No money has left ${sFirst}'s account yet.`) : "This payment has been decided."}
      </HeroBand>

      {h.status === "held" && isGuardian && (
        <AlertBanner title={`${sFirst} is trying to pay ${h.currency} ${h.amount} to ${h.payee}`}
          detail={<span className="inline-flex items-start gap-1.5"><Phone size={15} aria-hidden className="mt-1 shrink-0" />Call {sFirst} first. Scammers often tell people to keep a payment secret, even from family.</span>}
          actions={<>
            <ActionButton size="lg" path="/api/guardian" body={{ action: "block", holdId: h.id }}><Ban size={19} aria-hidden /> Block</ActionButton>
            <ActionButton size="lg" variant="secondary" path="/api/guardian" body={{ action: "approve", holdId: h.id }} confirm={`Send ${fmtMoney(h.amount, h.currency)} to ${h.payee}? This can't be undone.`}>Approve</ActionButton>
          </>} />
      )}
      {h.status === "held" && isSenior && (
        <AlertBanner title="You're safe" detail={<span className="text-[16px]">If someone is pressuring you on the phone right now, hang up. Real officials never ask for payment like this.</span>}
          actions={<ActionButton size="lg" variant="secondary" path="/api/guardian" body={{ action: "cancel", holdId: h.id }}>Cancel this payment</ActionButton>} />
      )}
      {h.status === "held" && !isSenior && !isGuardian && <AlertBanner title="Waiting for a decision" detail="Switch to Meera to decide, or to Ravi to cancel." />}
      {h.status !== "held" && (
        <AlertBanner tone={h.status === "approved" ? "success" : "danger"} Icon={h.status === "approved" ? CircleCheck : Ban}
          title={h.status === "approved" ? "Approved and sent" : h.status === "blocked" ? `Blocked by ${gFirst}` : `Cancelled by ${sFirst}`}
          detail={<>{h.status === "approved" ? "The payment was sent." : "No money was sent."}{h.decidedAt && <> Decided <When iso={h.decidedAt} />.</>}</>} />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card as="section" className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold"><AlertTriangle size={20} aria-hidden className="text-accent" /> Why we paused it</h2>
          <ul className="mt-3 divide-y divide-border">
            {h.reasons.map((r, i) => <li key={i} className={`py-2.5 ${isSenior ? "text-[17px]" : "text-[15px]"}`}>{r}</li>)}
          </ul>
        </Card>
        <Card as="section" className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <Mark name={h.payee} size={48} />
            <div className="min-w-0">
              <p className="text-[14px] text-muted">To</p>
              <p className="text-[20px] font-extrabold leading-tight [overflow-wrap:anywhere]">{h.payee}</p>
            </div>
          </div>
          {h.note && <blockquote className="mt-4 rounded-panel bg-raised px-4 py-3">“{h.note}”</blockquote>}
          <p className="mt-3 text-[14px] text-muted">Requested <When iso={h.createdAt} /></p>
        </Card>
      </div>
    </div>
  );
}
