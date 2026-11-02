import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { findRecurring, cancellationEmail, type Recurring } from "@/lib/subscriptions";
import { Card, Pill, PageHeader, Section, Empty, Mark, When, Note, fmtMoney, HeroBand, HeroFigure, Hi } from "@/components/ui";
import { CopyButton } from "@/components/client";

export const dynamic = "force-dynamic";

function SubList({ found, name, email, max }: { found: Recurring[]; name: string; email: string; max: number }) {
  return (
    <div className="space-y-3">
      {found.map((r) => {
        const mail = cancellationEmail(r, name, email);
        const full = `Subject: ${mail.subject}\n\n${mail.body}`;
        return (
          <Card key={r.merchant} as="article" className="overflow-hidden">
            <div className="flex items-start gap-3 p-5">
              <Mark name={r.merchant} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{r.merchant}</h3>
                  {r.forgotten && <Pill tone="accent">Possibly forgotten</Pill>}
                </div>
                <p className="text-[14px] text-muted">
                  {fmtMoney(r.amount, r.currency)} every {r.cadenceDays === 30 ? "month" : r.cadenceDays === 7 ? "week" : r.cadenceDays === 365 ? "year" : `${r.cadenceDays} days`} · charged {r.count} times · last <When iso={r.lastAt} date />
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-2 flex-1 rounded-full bg-track"><span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(4, (r.yearlyCost / max) * 100)}%` }} /></span>
                  <span className="tabular w-28 shrink-0 text-right text-[15px] font-extrabold">{fmtMoney(r.yearlyCost, r.currency)}<span className="font-medium text-muted"> /yr</span></span>
                </div>
              </div>
            </div>
            <details className="group border-t border-border">
              <summary className="press flex cursor-pointer items-center justify-between px-5 py-3 text-[14px] font-bold text-accent hover:bg-raised">
                How to cancel <span aria-hidden className="text-muted transition group-open:rotate-180">⌄</span>
              </summary>
              <div className="px-5 pb-5">
                <ol className="list-decimal space-y-1.5 pl-5 text-[14px]">
                  <li>In PayPal: Settings → Payments → Manage automatic payments → {r.merchant} → Cancel.</li>
                  <li>Also cancel with {r.merchant}, or they may bill you another way. Shield wrote the email:</li>
                </ol>
                <pre className="mt-3 whitespace-pre-wrap rounded-panel bg-raised p-4 font-sans text-[14px] leading-relaxed">{full}</pre>
                <div className="mt-3"><CopyButton text={full} label="Copy email" /></div>
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}

export default async function SubscriptionsPage() {
  const me = await getUser();
  const d = db();
  const at = now();
  const mine = findRecurring(d.transactions.filter((t) => t.userId === me.id), at);
  const dad = me.guardianOf ? d.users.find((u) => u.id === me.guardianOf) : undefined;
  const dads = dad ? findRecurring(d.transactions.filter((t) => t.userId === dad.id), at) : [];
  const all = [...mine, ...dads];
  const total = all.reduce((s, r) => s + r.yearlyCost, 0);
  const max = Math.max(...all.map((r) => r.yearlyCost), 1);
  const forgotten = all.filter((r) => r.forgotten).length;

  return (
    <div>
      <PageHeader title={me.role === "senior" ? "My subscriptions" : "Subscriptions"} back={me.role === "senior" ? "/" : "/protect"} backLabel={me.role === "senior" ? "Home" : "Protect"}
        subtitle="Repeat charges found in your PayPal history, and how to stop them." />
      <HeroBand visual={<HeroFigure sub="a year">{fmtMoney(total, "USD", 0)}</HeroFigure>} label="Subscriptions"
        title={all.length ? <>Paying <Hi>{fmtMoney(total, "USD")}</Hi> a year</> : <>No repeat <Hi>charges</Hi> found</>}>
        {all.length ? `${all.length} repeat payment${all.length > 1 ? "s" : ""}${dads.length ? `, ${dads.length} on Dad's account` : ""}${forgotten ? `. ${forgotten} look${forgotten > 1 ? "" : "s"} forgotten.` : "."}` : "Nothing repeats in the last 90 days."}
      </HeroBand>

      {all.length ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0">
            {mine.length > 0 && <Section title={dad ? "Yours" : "Found"}><SubList found={mine} name={me.name} email={me.email} max={max} /></Section>}
            {dads.length > 0 && dad && <Section title="On Dad's account" className="!mb-0"><SubList found={dads} name={dad.name} email={dad.email} max={max} /></Section>}
            {!mine.length && dad && <p className="mt-3 text-[14px] text-muted">None found on your own account.</p>}
          </div>
          <Note className="rounded-card border border-border bg-card p-5">Why doesn&apos;t Shield cancel on the merchant&apos;s site for you? It would need your login there, runs into 2FA and CAPTCHAs, and often breaks their terms. So Shield drafts the email instead.</Note>
        </div>
      ) : <Empty>No repeat payments found in the last 90 days.</Empty>}
    </div>
  );
}
