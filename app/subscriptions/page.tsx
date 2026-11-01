import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { findRecurring, cancellationEmail } from "@/lib/subscriptions";
import { Card, Badge, Money, PageHeader, Empty } from "@/components/ui";
import { CopyButton } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const me = await getUser();
  const found = findRecurring(db().transactions.filter((t) => t.userId === me.id), now());
  const total = found.reduce((s, r) => s + r.yearlyCost, 0);
  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Repeat charges found in your payment history." back="/protect" />
      {found.length ? (
        <>
          <Card tone="warn" className="mb-4"><p className="font-semibold">You're paying about USD {total.toFixed(2)} a year</p><p className="text-sm text-ink/70">across {found.length} repeat payment{found.length > 1 ? "s" : ""}.</p></Card>
          <div className="space-y-3">
            {found.map((r) => {
              const email = cancellationEmail(r, me.name, me.email);
              return (
                <Card key={r.merchant}>
                  <div className="flex items-center justify-between"><span className="font-semibold">{r.merchant}</span>{r.forgotten && <Badge tone="warn">Possibly forgotten</Badge>}</div>
                  <p className="text-sm text-ink/60"><Money amount={r.amount} currency={r.currency} /> every {r.cadenceDays === 30 ? "month" : `${r.cadenceDays} days`} · {r.count} charges · <Money amount={r.yearlyCost} currency={r.currency} />/year</p>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-brand">How to cancel</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      <li>In PayPal: Settings → Payments → Manage automatic payments → {r.merchant} → Cancel.</li>
                      <li>Also cancel with the merchant, or they may bill you another way. Here's an email you can send:</li>
                    </ol>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink/5 p-2 text-xs">{`Subject: ${email.subject}\n\n${email.body}`}</pre>
                    <div className="mt-2"><CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy email" /></div>
                  </details>
                </Card>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-ink/45">Why not cancel on the merchant's site for you? It needs your login there, hits 2FA and CAPTCHAs, and often breaks their terms. Shield drafts the email instead.</p>
        </>
      ) : <Empty>No repeat payments found. Switch to Ravi to see an example.</Empty>}
    </div>
  );
}
