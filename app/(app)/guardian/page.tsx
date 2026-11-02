import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import type { GuardianHold } from "@/lib/types";
import { Card, Pill, Money, PageHeader, Section, Empty, When, Mark, Note, HeroBand, HeroGauge, HeroIcon, Hi, AlertBanner, type Tone } from "@/components/ui";
import { GuardianForm } from "@/components/GuardianForm";
import { ActionButton } from "@/components/client";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

const STATUS: Record<GuardianHold["status"], { label: string; tone: Tone }> = {
  held: { label: "Waiting for a decision", tone: "accent" },
  approved: { label: "Approved and sent", tone: "success" },
  blocked: { label: "Blocked", tone: "danger" },
  cancelled_by_senior: { label: "Cancelled by Ravi", tone: "neutral" },
};

function HoldList({ holds, big }: { holds: GuardianHold[]; big?: boolean }) {
  if (!holds.length) return <Empty>No payment has needed a check yet. Everyday bills go straight through.</Empty>;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {holds.map((h) => (
          <li key={h.id}>
            <Link href={`/guardian/${h.id}`} className={`press flex items-center gap-3 px-4 hover:bg-raised sm:px-5 ${big ? "py-5" : "py-4"}`}>
              <Mark name={h.payee} size={big ? 44 : 40} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-bold ${big ? "text-[18px]" : ""}`}>{h.payee}</span>
                <span className={`block text-muted ${big ? "text-[16px]" : "text-[14px]"}`}><When iso={h.createdAt} /> · risk {h.riskScore}/100</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold"><Money amount={h.amount} currency={h.currency} size={big ? "lg" : "body"} /></span>
                <span className="mt-1 block"><Pill tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Pill></span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function GuardianPage() {
  const me = await getUser();
  const d = db();
  const holds = d.holds.filter((h) => h.seniorId === me.id || h.guardianId === me.id).sort((a, b) => Number(b.status === "held") - Number(a.status === "held") || b.createdAt.localeCompare(a.createdAt));
  const senior = me.role === "senior";
  const guardian = d.users.find((u) => u.id === me.guardedBy);
  const pending = holds.filter((h) => h.status === "held");
  const top = [...pending].sort((a, b) => b.riskScore - a.riskScore)[0];

  if (senior) {
    return (
      <div className="text-[17px]">
        <PageHeader title="Send money" subtitle={<span className="text-[17px]">If a payment looks unusual we pause it and ask {guardian?.name.split(" ")[0]}. You can always cancel.</span>} />
        {top ? (
          <HeroBand visual={<HeroGauge value={top.riskScore} label="Scam risk of your paused payment" valueText={`${top.riskScore} out of 100`} />}
            label="Paused for a check" title={<>Payment to {top.payee}: <Hi>paused</Hi></>}>
            <span className="text-[17px]">No money has left your account. {guardian?.name.split(" ")[0]} has been asked to look at it.</span>
          </HeroBand>
        ) : (
          <HeroBand visual={<HeroIcon Icon={ShieldCheck} />} label="Your protection" title={<>Guardian mode is <Hi>on</Hi></>}>
            <span className="text-[17px]">Every payment is checked for scam signs before it goes.</span>
          </HeroBand>
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <Card className="min-w-0 p-5 sm:p-7"><GuardianForm /></Card>
          <Section title="Payments we checked" className="!mb-0 min-w-0"><HoldList holds={holds} big /></Section>
        </div>
      </div>
    );
  }

  const dadOut = d.transactions.filter((t) => t.userId === me.guardianOf && t.direction === "out" && !t.recurring);
  const seen = (name: string) => dadOut.filter((t) => t.counterparty === name).length > 1;
  const everyday = dadOut.filter((t) => seen(t.counterparty)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  return (
    <div>
      <PageHeader title="Dad's payments" subtitle="Ravi's unusual payments wait for your OK. Everyday bills go straight through." />
      {top ? (
        <>
          <HeroBand visual={<HeroGauge value={top.riskScore} label="Scam risk" valueText={`${top.riskScore} out of 100`} />}
            label="Waiting for you" title={<>Scam risk: <Hi>{top.riskScore >= 60 ? "High" : top.riskScore >= 30 ? "Elevated" : "Low"}</Hi></>}>
            Ravi wants to pay {top.payee} {top.currency} {top.amount}. No money has left his account.
          </HeroBand>
          <AlertBanner title={`Ravi is trying to pay ${top.currency} ${top.amount} to ${top.payee}`} detail={top.reasons.join(" · ")}
            actions={<>
              <ActionButton path="/api/guardian" body={{ action: "block", holdId: top.id }} done="Blocked">Block</ActionButton>
              <Link href={`/guardian/${top.id}`} className={buttonClass("secondary")}>Review</Link>
            </>} />
        </>
      ) : (
        <HeroBand visual={<HeroIcon Icon={ShieldCheck} />} label="Guardian mode" title={<>Nothing <Hi>waiting</Hi></>}>
          Unusual payments from Ravi will appear here for your decision.
        </HeroBand>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <Section title="Checked payments"><HoldList holds={holds} /></Section>
          <Section title="Went straight through" className="!mb-0">
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {everyday.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Mark name={t.counterparty} size={36} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.counterparty}</span><span className="block text-[13px] text-muted"><When iso={t.at} date /> · known payee</span></span>
                    <span className="font-semibold"><Money amount={t.amount} currency={t.currency} /></span>
                  </li>
                ))}
              </ul>
            </Card>
            <Note className="mt-2">Ravi&apos;s last {everyday.length} everyday payments. Guardian mode only steps in when something looks unusual.</Note>
          </Section>
        </div>
        <Card as="section" className="p-5">
          <h2 className="font-extrabold">What gets paused</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] text-muted">
            <li>A new payee with an amount far above Ravi&apos;s usual</li>
            <li>Gift cards or crypto as payment</li>
            <li>Scam language: tax office, arrest, prizes, romance, OTPs</li>
          </ul>
          <p className="mt-3 text-[13px] text-muted">To try it, switch to Ravi from the person menu and use the “tax office” example.</p>
        </Card>
      </div>
    </div>
  );
}
