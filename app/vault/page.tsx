import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, Badge, Money, PageHeader, Section, Empty } from "@/components/ui";
import { NewDealForm } from "@/components/VaultForms";

export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "released" ? "safe" : s === "disputed" ? "danger" : s === "voided" || s === "expired" ? "neutral" : "brand") as "safe" | "danger" | "neutral" | "brand";

export default async function VaultPage() {
  const me = await getUser();
  const deals = db().vaultDeals.filter((v) => v.sellerId === me.id || v.buyerId === me.id || (me.role === "buyer" && v.status === "created") || me.role === "support");
  return (
    <div>
      <PageHeader title="Vault" subtitle="Escrow for sales between people. The buyer pays; PayPal holds the money on their account; it's released after delivery." back="/protect" />
      <Card tone="brand" className="mb-5 text-sm">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Seller creates a Vault link and shares it in any chat.</li>
          <li>Buyer pays with PayPal. Funds are authorized, not sent.</li>
          <li>Seller ships with tracking.</li>
          <li>Buyer confirms, or it auto-releases after the check window. A problem pauses release.</li>
        </ol>
      </Card>
      {me.role === "freelancer" && <Section title="Sell something"><Card><NewDealForm /></Card></Section>}
      <Section title="Deals">
        {deals.length ? deals.map((v) => (
          <Link key={v.id} href={`/vault/${v.id}`} className="block">
            <Card>
              <div className="flex items-center justify-between"><span className="font-semibold">{v.title}</span><Badge tone={tone(v.status)}>{v.status}</Badge></div>
              <p className="text-sm text-ink/60"><Money amount={v.amount} currency={v.currency} /> · {v.sellerId === me.id ? "you're selling" : "you're buying"}</p>
            </Card>
          </Link>
        )) : <Empty>No Vault deals yet.</Empty>}
      </Section>
    </div>
  );
}
