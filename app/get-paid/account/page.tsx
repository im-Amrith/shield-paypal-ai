import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { riskFor, explainLimitation, REASON_TEXT } from "@/lib/risk";
import { Card, Badge, Money, PageHeader, Section, RiskMeter, When } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getUser();
  const state = db().accountState[me.id];
  const risk = riskFor(me.id);
  const exp = state?.limited ? await explainLimitation(me.id) : null;
  const txs = db().transactions;

  return (
    <div>
      <PageHeader title="Account health" subtitle="Shield reads the same signals a risk reviewer looks at, so you hear about problems before a freeze — and get a straight answer if one happens." back="/get-paid" />

      {exp ? (
        <>
          <Card tone="danger" className="mb-4">
            <Badge tone="danger">Limited {exp.limitedAt && <>· <When iso={exp.limitedAt} /></>}</Badge>
            <p className="mt-2 text-lg font-semibold">{exp.reason.title}</p>
            <p className="mt-1 text-sm">{exp.reason.plain}</p>
            <p className="mt-2 text-xs text-ink/60">Your money is held, not lost. Holds can last up to 180 days if unresolved; most reviews finish within days of sending documents.</p>
          </Card>
          <Section title="Payments that triggered it">
            <Card>
              <ul className="divide-y divide-ink/10 text-sm">
                {exp.related.map((t) => (
                  <li key={t.id} className="flex justify-between py-1.5">
                    <span>{t.counterparty} <span className="text-ink/50">· {t.country}{t.type === "friends_family" ? " · F&F" : ""}{t.disputed ? " · disputed" : ""}</span></span>
                    <Money amount={t.amount} currency={t.currency} />
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
          <Section title="Send these">
            <Card><ul className="list-disc space-y-1 pl-5 text-sm">{exp.reason.docs.map((d) => <li key={d}>{d}</li>)}</ul></Card>
          </Section>
          <Section title="Your appeal, ready to send" action={<CopyButton text={exp.appeal} label="Copy" />}>
            <Card><pre className="whitespace-pre-wrap text-xs leading-relaxed">{exp.appeal}</pre></Card>
          </Section>
          <div className="space-y-2">
            <a href="/support" className="block text-center text-sm font-semibold text-brand underline">Ask Resolve to submit it and request a review</a>
            <ActionButton full variant="secondary" path="/api/risk" body={{ action: "lift" }}>Demo: PayPal lifts the limitation</ActionButton>
          </div>
        </>
      ) : (
        <>
          <Card tone={risk.level === "low" ? "safe" : "warn"} className="mb-4">
            <RiskMeter score={risk.score} label={`Freeze risk: ${risk.level}`} />
            <p className="mt-2 text-sm">{risk.level === "low" ? "Nothing unusual. Keep invoicing through PayPal and you're in good shape." : "A reviewer would probably look at your account soon. Fix these now to avoid a hold."}</p>
          </Card>
          <Section title="What we see">
            {risk.signals.map((s) => (
              <Card key={s.id}>
                <div className="flex items-center justify-between"><span className="font-semibold">{s.title}</span><Badge tone={s.severity >= 0.5 ? "danger" : "warn"}>{Math.round(s.severity * 100)}</Badge></div>
                <p className="mt-1 text-sm text-ink/70">{s.detail}</p>
                <p className="mt-2 text-sm"><b>Do this:</b> {s.fix}</p>
                <p className="mt-1 text-[11px] text-ink/45">Based on {s.evidence.length} payment{s.evidence.length > 1 ? "s" : ""}: {s.evidence.slice(0, 3).map((id) => txs.find((t) => t.id === id)?.counterparty).join(", ")}{s.evidence.length > 3 ? "…" : ""}</p>
              </Card>
            ))}
          </Section>
          <Card tone="brand">
            <p className="text-sm font-semibold">Demo: what happens if PayPal limits the account?</p>
            <p className="mb-3 text-xs text-ink/60">The sandbox can't freeze accounts, so this fires the same event. You'll get a push + email right away and reminders at 24h and 72h if it's unread.</p>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton full variant="danger" path="/api/risk" body={{ action: "simulate" }}>Simulate a limitation</ActionButton>
              <details><summary className="cursor-pointer text-xs text-brand">Pick a specific reason</summary>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {Object.entries(REASON_TEXT).map(([code, r]) => <ActionButton key={code} full variant="secondary" path="/api/risk" body={{ action: "simulate", reason: code }}>{r.title}</ActionButton>)}
                </div>
              </details>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
