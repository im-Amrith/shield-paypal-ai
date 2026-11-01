import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, Badge, Money, PageHeader, Section, Empty, When } from "@/components/ui";
import { GuardianForm } from "@/components/GuardianForm";

export const dynamic = "force-dynamic";

export default async function GuardianPage() {
  const me = await getUser();
  const d = db();
  const holds = d.holds.filter((h) => h.seniorId === me.id || h.guardianId === me.id);
  const senior = me.role === "senior";
  return (
    <div>
      <PageHeader
        title={senior ? "Send money safely" : "Guardian mode"}
        subtitle={senior
          ? `Payments that look unusual are paused until ${d.users.find((u) => u.id === me.guardedBy)?.name.split(" ")[0]} confirms. You can always cancel.`
          : "Your father turned this on. Unusual payments wait for your OK; everyday ones go straight through."}
        back="/protect"
      />
      {senior ? <Card className="mb-5"><GuardianForm /></Card> : (
        <Card tone="brand" className="mb-5 text-sm">
          <p>Switch to <b>Ravi</b> in the top bar to try a payment. Holds are triggered by new payees with unusual amounts, gift cards or crypto, and scam language (tax office, arrest, romance, prizes, OTPs).</p>
        </Card>
      )}
      <Section title="Checked payments">
        {holds.length ? holds.map((h) => (
          <Link key={h.id} href={`/guardian/${h.id}`} className="block">
            <Card tone={h.status === "held" ? "warn" : undefined}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{h.payee}</span>
                <Badge tone={h.status === "held" ? "warn" : h.status === "approved" ? "safe" : "danger"}>{h.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="text-sm text-ink/60"><Money amount={h.amount} currency={h.currency} /> · <When iso={h.createdAt} /></p>
            </Card>
          </Link>
        )) : <Empty>No payments have needed a check.</Empty>}
      </Section>
    </div>
  );
}
