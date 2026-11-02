import { Lock, HeartHandshake, Repeat, ScanSearch } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { findRecurring } from "@/lib/subscriptions";
import { Card, PageHeader, HeroBand, HeroFigure, Hi, FeatureTile, Section, fmtMoney } from "@/components/ui";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

export default async function Protect() {
  const me = await getUser();
  const d = db();
  const at = now();
  const since = at.getTime() - 30 * 86400_000;
  // "Flagged" = Guardian holds this month: each one is a payment Shield stopped as risky.
  const flagged = d.holds.filter((h) => (h.guardianId === me.id || h.seniorId === me.id) && +new Date(h.createdAt) > since);
  const waiting = flagged.filter((h) => h.status === "held");
  const held = d.vaultDeals.filter((v) => (v.sellerId === me.id || v.buyerId === me.id) && ["authorized", "shipped", "delivered", "disputed"].includes(v.status));
  const heldSum = held.reduce((s, v) => s + v.amount, 0);
  const subsOwner = me.guardianOf ?? me.id;
  const subs = findRecurring(d.transactions.filter((t) => t.userId === subsOwner), at);
  const yearly = subs.reduce((s, r) => s + r.yearlyCost, 0);
  const total = flagged.length + held.length;

  return (
    <div>
      <PageHeader title="Protect" subtitle="Stop a bad payment before it happens, not after." />
      <HeroBand visual={<HeroFigure sub="protected this month">{total}</HeroFigure>} label="Protected this month"
        title={<><Hi>{flagged.length}</Hi> risky payment{flagged.length === 1 ? "" : "s"} stopped</>}>
        {held.length ? `${held.length} sale${held.length > 1 ? "s" : ""} (${fmtMoney(heldSum, "USD")}) held safely in Vault until delivery.` : "No money is held in Vault right now."}
        {waiting.length ? ` ${waiting.length} payment${waiting.length > 1 ? "s" : ""} still waiting for a decision.` : ""}
      </HeroBand>

      <Card as="section" className="mb-6 p-5 sm:p-6">
        <h2 className="flex items-center gap-2.5 text-[18px] font-extrabold"><ScanSearch size={22} aria-hidden className="text-accent" /> Check a message before you pay</h2>
        <p className="mt-1 text-[15px] text-muted">Paste a chat, a listing or an email. Nothing is sent to the other person.</p>
        <form action="/protect/scan" method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="q" className="sr-only">Message to check</label>
          <input id="q" name="q" required placeholder="“Send it as Friends & Family so we both avoid fees…”"
            className="min-h-12 flex-1 rounded-control border border-border bg-raised px-4 text-[15px] text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <button className={buttonClass("primary")}>Check it</button>
        </form>
      </Card>

      <Section title="Tools" className="!mb-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          <FeatureTile href="/vault" Icon={Lock} title="Vault escrow"
            desc={held.length ? `${fmtMoney(heldSum, "USD")} held now · released after delivery` : "Buyer's money held by PayPal, released after delivery"} />
          <FeatureTile href="/guardian" Icon={HeartHandshake} title="Guardian"
            desc={waiting.length ? `${waiting.length} payment${waiting.length > 1 ? "s" : ""} waiting for a decision` : me.guardianOf ? "Ravi's unusual payments wait for your OK" : "Unusual payments wait for a relative's OK"} />
          <FeatureTile href="/subscriptions" Icon={Repeat} title="Subscriptions"
            desc={subs.length ? `${fmtMoney(yearly, "USD")} a year · ${subs.length} found${me.guardianOf ? " on Dad's account" : ""}` : "Finds forgotten repeat charges"} />
        </div>
      </Section>
    </div>
  );
}
