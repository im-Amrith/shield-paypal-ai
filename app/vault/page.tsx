import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, Pill, Money, PageHeader, Section, Empty, Track, Avatar, HeroBand, HeroFigure, Hi, fmtMoney } from "@/components/ui";
import { VAULT_STEPS, vaultStage, vaultStatus } from "@/components/vaultStatus";
import { NewDealForm } from "@/components/VaultForms";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const me = await getUser();
  const all = db().vaultDeals.filter((v) => v.sellerId === me.id || v.buyerId === me.id || (me.role === "buyer" && v.status === "created") || me.role === "support");
  const deals = [...all].sort((a, b) => Number(b.status === "disputed") - Number(a.status === "disputed") || b.createdAt.localeCompare(a.createdAt));
  const held = deals.filter((v) => ["authorized", "shipped", "delivered", "disputed"].includes(v.status));
  const heldSum = held.reduce((s, v) => s + v.amount, 0);
  const seller = me.role === "freelancer";
  const disputed = deals.filter((v) => v.status === "disputed").length;

  return (
    <div>
      <PageHeader title={me.role === "support" ? "Vault disputes" : "Vault"} back={seller ? "/protect" : undefined} backLabel="Protect"
        subtitle="Escrow for sales between people. The buyer pays, PayPal holds it, and it's released after delivery." />
      <HeroBand visual={<HeroFigure sub="held right now"><Money amount={heldSum} currency="USD" whole /></HeroFigure>} label="Vault"
        title={held.length ? <>Held safely: <Hi>{fmtMoney(heldSum, "USD")}</Hi></> : <>Nothing <Hi>held</Hi> right now</>}>
        {held.length ? `${held.length} deal${held.length > 1 ? "s" : ""} with money held by PayPal${disputed ? `, ${disputed} paused for a dispute` : ""}. Neither side can spend it until delivery.` : seller ? "Create a Vault link and paste it into the chat with your buyer." : "Deals with money held will show here."}
      </HeroBand>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <Section title={seller ? "Your sales" : "Deals"} className="min-w-0 !mb-0">
          {deals.length ? (
            <div className="space-y-3">
              {deals.map((v) => {
                const st = vaultStatus[v.status];
                const selling = v.sellerId === me.id;
                return (
                  <Link key={v.id} href={`/vault/${v.id}`} className="press block rounded-card border border-border bg-card p-5 hover:border-accent/60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar id={selling ? (v.buyerId ?? "buyer") : v.sellerId} size={36} />
                        <div className="min-w-0">
                          <p className="truncate font-bold">{v.title}</p>
                          <p className="text-[14px] text-muted">{me.role === "support" ? (v.disputeReason ?? "—") : selling ? (v.buyerId ? "Buyer: Arjun Menon" : "No buyer yet") : "Seller: Meera Nair"}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money amount={v.amount} currency={v.currency} size="lg" />
                        <div className="mt-1"><Pill tone={st.tone}>{st.label}</Pill></div>
                      </div>
                    </div>
                    {v.status !== "voided" && v.status !== "expired" && (
                      <div className="mt-4"><Track steps={VAULT_STEPS} current={vaultStage(v.status)} failed={v.status === "disputed"} /></div>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : <Empty>{seller ? "No sales yet. Create a Vault link and paste it into the chat with your buyer." : me.role === "support" ? "No Vault deals are disputed." : "No deals yet. Ask the seller for a Vault link."}</Empty>}
        </Section>

        <aside className="min-w-0 space-y-6">
          {seller && (
            <Card as="section" className="p-5 sm:p-6">
              <h2 className="text-[18px] font-extrabold">Sell something</h2>
              <p className="mb-4 mt-1 text-[14px] text-muted">You get a link to share in any chat. No Shield fee.</p>
              <NewDealForm />
            </Card>
          )}
          <Card as="section" className="p-5 sm:p-6">
            <h2 className="font-extrabold">How the money moves</h2>
            <ol className="mt-3 space-y-3 text-[14px]">
              {[
                ["Buyer pays with PayPal", "The payment is authorized, not sent. It sits on the buyer's account."],
                ["Seller ships with tracking", "The seller sees the money is secured before shipping."],
                ["Buyer confirms, or the check window ends", "Then the payment is captured to the seller."],
                ["A problem pauses release", "Support reviews and refunds or pays out. Holds end within 21 days."],
              ].map(([t, s], i) => (
                <li key={t} className="flex gap-3">
                  <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-extrabold text-on-accent">{i + 1}</span>
                  <span><span className="block font-bold">{t}</span><span className="block text-muted">{s}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
