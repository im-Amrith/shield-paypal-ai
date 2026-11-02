import Link from "next/link";
import { ShieldAlert, FileCheck2, FlaskConical, Wrench } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { riskFor, explainLimitation, REASON_TEXT } from "@/lib/risk";
import { Card, Money, PageHeader, Section, When, Mark, Note, HeroBand, HeroGauge, Hi, AlertBanner, AlertRows } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { goods_services: "Goods & services", friends_family: "Friends & Family", invoice: "Invoice", refund: "Refund" };

export default async function AccountPage() {
  const me = await getUser();
  const state = db().accountState[me.id];
  const risk = riskFor(me.id);
  const exp = state?.limited ? await explainLimitation(me.id) : null;
  const txs = db().transactions;
  const level = risk.level === "high" ? "High" : risk.level === "elevated" ? "Elevated" : "Low";

  const hero = (
    <HeroBand visual={<HeroGauge value={risk.score} label="Freeze risk" valueText={`${risk.score} out of 100, ${exp ? "account limited" : level.toLowerCase()}`} />}
      label="Account Health"
      title={exp ? <>Account: <Hi tone="danger">Limited</Hi></> : <>Freeze risk: <Hi tone={risk.level === "low" ? "success" : "accent"}>{level}</Hi></>}>
      {exp
        ? <>PayPal limited your account{exp.limitedAt && <> on <When iso={exp.limitedAt} /></>}. Here is why, and what gets it lifted.</>
        : risk.signals.length
          ? <>{risk.signals[0].title}. {risk.signals.length > 1 ? `${risk.signals.length} things a reviewer would notice; each has a fix below.` : "Fix it before PayPal reviews you."}</>
          : "Nothing unusual. Keep invoicing through PayPal and you're in good shape."}
    </HeroBand>
  );

  if (exp) {
    return (
      <div>
        <PageHeader title="Account health" back="/get-paid" backLabel="Get Paid" />
        {hero}
        <AlertBanner tone="danger" Icon={ShieldAlert} title={exp.reason.title}
          detail={<>{exp.reason.plain} Your money is held, not lost. A hold can last up to 180 days if nothing is sent; most reviews finish within days of receiving documents.</>}
          actions={<Link href="/support" className={buttonClass("primary")}>Ask Resolve to submit the appeal</Link>} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Section title="The payments that triggered it" className="!mb-0">
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {exp.related.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <Mark name={t.counterparty} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{t.counterparty}</span>
                        <span className="block text-[13px] text-muted">{TYPE[t.type]} · {t.country} · <When iso={t.at} date /></span>
                      </span>
                      <span className="shrink-0 text-right font-semibold">
                        <Money amount={t.amount} currency={t.currency} sign="in" />
                        {(t.disputed || t.type === "friends_family") && <span className="block text-[13px] text-danger">{t.disputed ? "Disputed" : "F&F for a sale"}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Note className="mt-2">PayPal doesn&apos;t publish its exact reasons. Shield reads the same signals a reviewer looks at in your history.</Note>
            </Section>
            <Card as="section" className="p-5 sm:p-6">
              <h2 className="font-extrabold">Send these documents</h2>
              <ul className="mt-3 space-y-2.5">
                {exp.reason.docs.map((d) => <li key={d} className="flex gap-2.5 text-[15px]"><FileCheck2 size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />{d}</li>)}
              </ul>
            </Card>
          </div>
          <aside className="min-w-0 space-y-4">
            <Card as="section" className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-extrabold">Your appeal, ready to send</h2>
                <CopyButton text={exp.appeal} label="Copy" />
              </div>
              <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-panel bg-raised p-4 font-sans text-[14px] leading-relaxed">{exp.appeal}</pre>
            </Card>
            <div className="rounded-card border border-dashed border-border p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold"><FlaskConical size={16} aria-hidden className="text-muted" /> Demo</p>
              <div className="mt-2"><ActionButton full variant="secondary" path="/api/risk" body={{ action: "lift" }}>PayPal lifts the limitation</ActionButton></div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Account health" back="/get-paid" backLabel="Get Paid" subtitle="Shield reads the signals a PayPal risk reviewer looks at, so you hear about a problem before a freeze." />
      {hero}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <AlertRows title="What a reviewer would see" empty="No warning signs in the last 90 days."
          items={risk.signals.map((s) => {
            const names = [...new Set(s.evidence.map((id) => txs.find((t) => t.id === id)?.counterparty).filter(Boolean))];
            return {
              key: s.id, Icon: Wrench, tone: s.severity >= 0.5 ? "danger" as const : "accent" as const,
              text: s.title,
              sub: <>
                {s.detail}
                <span className="mt-2 block rounded-[8px] bg-accent-tint px-3 py-2 text-fg"><b className="font-bold">Do this:</b> {s.fix}</span>
                <span className="mt-1 block text-[12px]">From {s.evidence.length} payment{s.evidence.length > 1 ? "s" : ""}: {names.slice(0, 4).join(", ")}{names.length > 4 ? ` and ${names.length - 4} more` : ""}</span>
              </>,
              time: s.severity >= 0.5 ? "Serious" : "Fix",
            };
          })} />
        <aside className="min-w-0 space-y-4">
          <Card className="p-5">
            <h2 className="font-extrabold">If PayPal limits you</h2>
            <p className="mt-1 text-[14px] text-muted">You get a push and an email straight away, again at 24 and 72 hours if unread, and this page turns into a plain explanation with an appeal ready to send.</p>
          </Card>
          <div className="rounded-card border border-dashed border-border p-5">
            <p className="flex items-center gap-2 font-bold"><FlaskConical size={16} aria-hidden className="text-muted" /> Try it</p>
            <p className="mb-3 mt-1 text-[13px] text-muted">The sandbox can&apos;t freeze accounts, so this fires the same event Shield would receive.</p>
            <ActionButton full variant="secondary" path="/api/risk" body={{ action: "simulate" }}>Simulate a limitation</ActionButton>
            <details className="mt-2">
              <summary className="press cursor-pointer rounded-control px-1 py-2 text-[14px] font-bold text-accent">Pick a specific reason</summary>
              <div className="mt-1 grid gap-2">
                {Object.entries(REASON_TEXT).map(([code, r]) => <ActionButton key={code} full variant="quiet" path="/api/risk" body={{ action: "simulate", reason: code }}>{r.title}</ActionButton>)}
              </div>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
