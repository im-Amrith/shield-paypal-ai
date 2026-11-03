import Link from "next/link";
import { ScanSearch, Lock, Send, Headphones, ShieldCheck, Database, Inbox, ChevronRight, Repeat, type LucideIcon } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { riskFor } from "@/lib/risk";
import { balance } from "@/lib/collections";
import type { Transaction } from "@/lib/types";
import {
  Card, Section, Money, PageHeader, RowList, Row, Mark, Track, Stats, Empty, fmtMoney, relDays, When,
  HeroBand, HeroGauge, HeroFigure, HeroIcon, Hi, AlertBanner, FeatureTile,
} from "@/components/ui";
import { Alerts } from "@/components/Alerts";
import { ActionButton } from "@/components/client";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

const DAY = 86400_000;
const TYPE: Record<Transaction["type"], string> = { goods_services: "Goods & services", friends_family: "Friends & Family", invoice: "Invoice", refund: "Refund" };
/** "Good evening, Meera" and today's date, in the person's own time zone (demo clock). */
function greet(first: string, tz: string, at: Date, hello?: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(at));
  const part = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(at);
  return { title: `${hello ?? part}, ${first}`, day };
}

function Greeting({ title, day, sub, big }: { title: string; day: string; sub: React.ReactNode; big?: boolean }) {
  return (
    <PageHeader title={title} subtitle={<span className={big ? "text-[17px]" : ""}><span className="text-fg/80">{day}</span> · {sub}</span>} />
  );
}

const usd = (n: number) => `USD ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Large tap-target link for Ravi's view. */
function BigDoor({ href, label, sub, Icon }: { href: string; label: string; sub: string; Icon: LucideIcon }) {
  return (
    <Link href={href} className="press flex min-h-[84px] items-center gap-4 rounded-card border border-border bg-card px-5 py-4 hover:border-accent/60 hover:bg-raised">
      <Icon size={30} strokeWidth={2} aria-hidden className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-extrabold">{label}</span>
        <span className="block text-[16px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={22} aria-hidden className="shrink-0 text-muted" />
    </Link>
  );
}

function TxRows({ txs, limit = 6 }: { txs: Transaction[]; limit?: number }) {
  if (!txs.length) return <Empty>No payments yet.</Empty>;
  return (
    <RowList>
      {txs.slice(0, limit).map((t) => (
        <Row key={t.id} lead={<Mark name={t.counterparty} />} title={t.counterparty}
          sub={<>{TYPE[t.type]} · {t.country} · <When iso={t.at} date /></>}
          trail={<Money amount={t.amount} currency={t.currency} sign={t.direction === "in" ? "in" : undefined} />}
          trailSub={t.disputed ? <span className="text-danger">Disputed</span> : undefined} />
      ))}
    </RowList>
  );
}

export default async function Home() {
  const user = await getUser();
  const d = db();
  const at = now();
  const alerts = d.notifications.filter((n) => n.userId === user.id);
  const first = user.name.split(" ")[0];
  const g = greet(first, user.role === "client" ? "America/New_York" : "Asia/Kolkata", at, user.role === "senior" ? "Namaskaram" : undefined);

  /* ---------------- Ravi: Guardian mode, larger type and tap targets ---------------- */
  if (user.role === "senior") {
    const myHolds = d.holds.filter((h) => h.seniorId === user.id && h.status === "held");
    const guardian = d.users.find((u) => u.id === user.guardedBy);
    const gFirst = guardian?.name.split(" ")[0] ?? "your guardian";
    const mine = d.transactions.filter((t) => t.userId === user.id).sort((a, b) => b.at.localeCompare(a.at));
    return (
      <div className="text-[17px]">
        <Greeting {...g} big sub="Here’s what Shield is watching for you" />
        <HeroBand visual={<HeroIcon Icon={ShieldCheck} />} label="Your protection" title={<>Guardian mode is <Hi>on</Hi></>}>
          <span className="text-[17px] lg:text-[19px]">{gFirst} checks unusual payments with you before any money leaves. Everyday bills go straight through.</span>
        </HeroBand>
        {myHolds.map((h) => (
          <AlertBanner key={h.id} title={`Your payment to ${h.payee} is paused`}
            detail={<span className="text-[16px]">{usd(h.amount)} has not left your account. We&apos;ve asked {gFirst} to look at it.</span>}
            actions={<Link href={`/guardian/${h.id}`} className={buttonClass("primary", false, "lg")}>See why</Link>} />
        ))}
        <div className="grid gap-3 lg:grid-cols-3">
          <BigDoor href="/guardian" label="Send money" sub="We check it for scam signs first" Icon={Send} />
          <BigDoor href="/protect/scan" label="Is this a scam?" sub="Paste it, or add a screenshot" Icon={ScanSearch} />
          <BigDoor href="/support" label="Get help" sub="Speak or type: English, हिन्दी, മലയാളം" Icon={Headphones} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <Section title="Your recent payments" className="!mb-0"><TxRows txs={mine} limit={5} /></Section>
          <div className="space-y-4">
            <Alerts items={alerts} limit={4} />
            <BigDoor href="/subscriptions" label="My subscriptions" sub="Payments that repeat every month" Icon={Repeat} />
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- Priya: support overview ---------------- */
  if (user.role === "support") {
    const waiting = d.cases.filter((c) => c.status === "waiting_human");
    const open = d.cases.filter((c) => c.status !== "resolved");
    const resolved = d.cases.filter((c) => c.status === "resolved");
    const aiOnly = resolved.filter((c) => c.tier < 3 && !c.actions.some((a) => a.decision === "needs_human"));
    const disputes = d.vaultDeals.filter((v) => v.status === "disputed");
    return (
      <div>
        <Greeting {...g} sub="Here’s what’s waiting for a person" />
        <HeroBand visual={<HeroFigure sub="cases waiting">{waiting.length}</HeroFigure>} label="Support queue"
          title={<>Waiting for you: <Hi>{waiting.length}</Hi></>}
          aside={<Link href="/console" className={buttonClass("primary")}><Inbox size={18} aria-hidden /> Open the queue</Link>}>
          {waiting.length ? "The AI handled the rest within policy. These need your approval." : "No case needs a person right now. The AI is handling open cases within policy."}
        </HeroBand>
        {disputes.length > 0 && (
          <AlertBanner tone="danger" title={`${disputes.length} Vault dispute${disputes.length > 1 ? "s" : ""} to review`}
            detail={disputes.map((v) => `${v.title}: ${v.disputeReason}`).join(" · ")}
            actions={<Link href="/vault" className={buttonClass("secondary")}>Review</Link>} />
        )}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <Card className="p-2"><Stats items={[
            { label: "Waiting for you", value: <span className={waiting.length ? "text-accent" : "text-muted"}>{waiting.length}</span> },
            { label: "Open cases", value: open.length },
            { label: "Resolved", value: resolved.length, sub: resolved.length ? `${aiOnly.length} without a person` : "—" },
            { label: "Vault disputes", value: <span className={disputes.length ? "text-danger" : "text-muted"}>{disputes.length}</span> },
          ]} /></Card>
          <Alerts items={alerts} limit={5} />
        </div>
      </div>
    );
  }

  /* ---------------- Dana: invoices to pay ---------------- */
  if (user.role === "client") {
    const mine = d.invoices.filter((i) => i.clientEmail === user.email);
    const due = mine.filter((i) => i.status === "sent" || i.status === "partially_paid");
    const paid = mine.filter((i) => i.status === "paid");
    const owed = due.reduce((s, i) => s + balance(i), 0);
    return (
      <div>
        <Greeting {...g} sub="Invoices from Meera Nair Design" />
        <HeroBand visual={<HeroFigure sub="amount due"><Money amount={owed} currency="USD" whole /></HeroFigure>} label="Invoices"
          title={due.length ? <>Amount due: <Hi>{fmtMoney(owed, "USD")}</Hi></> : <>Nothing <Hi tone="success">to pay</Hi></>}>
          {due.length ? `${due.length} invoice${due.length > 1 ? "s" : ""} open. Pay Later is available where Meera turned it on, and partial payments are fine.` : "When Meera sends an invoice it shows up here with a pay button."}
        </HeroBand>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <div className="space-y-3">
            {due.map((i) => {
              const late = new Date(i.dueAt) < at;
              return (
                <Card key={i.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] text-muted">{i.id} · {i.items[0]?.name}</p>
                      <p className="mt-1"><Money amount={balance(i)} currency={i.currency} size="xl" /></p>
                      <p className="mt-1 text-[14px] text-muted">
                        <span className={late ? "font-bold text-accent" : ""}>Due {relDays(i.dueAt, at)}</span> · {new Date(i.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {i.amountPaid > 0 && <> · {fmtMoney(i.amountPaid, i.currency)} of {fmtMoney(i.amountPaid + balance(i), i.currency)} paid</>}
                      </p>
                    </div>
                    <Link href={`/get-paid/pay/${i.id}`} className={buttonClass("primary")}>Review and pay</Link>
                  </div>
                  <dl className="mt-4 divide-y divide-border border-t border-border text-[14px]">
                    {i.items.map((it, k) => <div key={k} className="flex justify-between gap-4 py-2"><dt>{it.name}</dt><dd className="tabular font-semibold">{fmtMoney(it.amount, i.currency)}</dd></div>)}
                    <div className="flex justify-between gap-4 py-2 text-muted"><dt>Terms</dt><dd className="text-right">{i.feeFor ? `Late fee for ${i.feeFor}, per its agreed terms` : i.feeInvoiceId ? `Late fee invoiced separately (${i.feeInvoiceId})` : i.lateFeePercent ? `${i.lateFeePercent}% late fee after the due date` : "No late fee"}{i.offerPayLater ? " · Pay Later available" : ""}</dd></div>
                    <div className="flex justify-between gap-4 py-2 text-muted"><dt>Reminders received</dt><dd className="tabular">{i.reminders.length}</dd></div>
                  </dl>
                </Card>
              );
            })}
            {paid.length > 0 && (
              <Section title="Paid" className="!mb-0 pt-3">
                <RowList>{paid.map((i) => <Row key={i.id} href={`/get-paid/pay/${i.id}`} lead={<Mark name={i.items[0]?.name ?? i.id} />} title={i.items[0]?.name ?? i.id} sub={i.id} trail={<Money amount={i.amountPaid} currency={i.currency} />} trailSub="Paid" />)}</RowList>
              </Section>
            )}
            {!due.length && !paid.length && <Empty>No invoices yet.</Empty>}
          </div>
          <Alerts items={alerts} limit={4} />
        </div>
      </div>
    );
  }

  /* ---------------- Arjun: buyer ---------------- */
  if (user.role === "buyer") {
    const deals = d.vaultDeals.filter((v) => v.buyerId === user.id || v.status === "created");
    const held = deals.filter((v) => ["authorized", "shipped", "delivered", "disputed"].includes(v.status));
    const heldSum = held.reduce((s, v) => s + v.amount, 0);
    const stage = (s: string) => ({ created: 0, authorized: 1, shipped: 2, delivered: 3, released: 4 } as Record<string, number>)[s] ?? 1;
    return (
      <div>
        <Greeting {...g} sub="Here’s what Shield is watching for you" />
        <HeroBand visual={<HeroFigure sub="held in Vault"><Money amount={heldSum} currency="USD" whole /></HeroFigure>} label="Vault"
          title={held.length ? <>Held safely: <Hi>{fmtMoney(heldSum, "USD")}</Hi></> : <>Nothing <Hi>held</Hi> yet</>}>
          {held.length ? `${held.length} payment${held.length > 1 ? "s" : ""} held by PayPal. Each seller is paid only after the item reaches you.` : "Check the seller, then pay through Vault. The seller is paid only after the item reaches you."}
        </HeroBand>
        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          <FeatureTile href="/protect/scan" Icon={ScanSearch} title="Scam check" desc="Paste the seller's chat or listing" />
          <FeatureTile href="/vault" Icon={Lock} title="Vault" desc="Money held until delivery" />
          <FeatureTile href="/support" Icon={Headphones} title="Support" desc="AI help that can act, with your OK" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <Section title="Your Vault deals" className="!mb-0 min-w-0">
            {deals.length ? (
              <div className="space-y-3">
                {deals.map((v) => (
                  <Link key={v.id} href={`/vault/${v.id}`} className="press block rounded-card border border-border bg-card p-5 hover:border-accent/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate font-bold">{v.title}</p><p className="text-[14px] text-muted">{v.status === "created" ? "Waiting for your payment" : v.status === "disputed" ? "Release paused — support is reviewing" : "Your money is held by PayPal"}</p></div>
                      <Money amount={v.amount} currency={v.currency} size="lg" />
                    </div>
                    <div className="mt-4"><Track steps={["Pay", "Held", "Shipped", "Delivered", "Released"]} current={stage(v.status)} failed={v.status === "disputed"} /></div>
                  </Link>
                ))}
              </div>
            ) : <Empty>No deals yet. Ask the seller to send you a Vault link instead of asking for Friends & Family.</Empty>}
          </Section>
          <Alerts items={alerts} limit={4} />
        </div>
      </div>
    );
  }

  /* ---------------- Meera: matches the "Hero score" design ---------------- */
  const risk = riskFor(user.id);
  const state = d.accountState[user.id];
  const open = d.invoices.filter((i) => i.freelancerId === user.id && (i.status === "sent" || i.status === "partially_paid"));
  const owed = open.reduce((s, i) => s + balance(i), 0);
  const dadHolds = d.holds.filter((h) => h.guardianId === user.id && h.status === "held");
  const level = risk.level === "high" ? "High" : risk.level === "elevated" ? "Elevated" : "Low";
  const month = d.transactions.filter((t) => t.userId === user.id && t.direction === "in" && +new Date(t.at) > at.getTime() - 30 * DAY);

  return (
    <div>
      <Greeting {...g} sub="Here’s what Shield is watching for you" />

      <Link href="/get-paid/account" className="block rounded-card" aria-label={`Account health: freeze risk ${risk.score} out of 100, ${state?.limited ? "account limited" : level}. Open account health.`}>
        <HeroBand
          visual={<HeroGauge value={risk.score} label="Freeze risk" valueText={`${risk.score} out of 100, ${state?.limited ? "account limited" : level.toLowerCase()}`} />}
          label="Account Health"
          title={state?.limited ? <>Account: <Hi tone="danger">Limited</Hi></> : <>Freeze risk: <Hi tone={risk.level === "low" ? "success" : "accent"}>{level}</Hi></>}>
          {state?.limited
            ? <>PayPal limited your account. Shield has the reason and an appeal ready to send.</>
            : risk.signals[0]
              ? <>{risk.signals[0].title}.<br className="hidden lg:block" /> Fix it before PayPal reviews you.</>
              : <>Nothing unusual in your payments. Keep invoicing through PayPal.</>}
        </HeroBand>
      </Link>

      {dadHolds.map((h) => (
        <AlertBanner key={h.id}
          title={`Ravi is trying to pay ${usd(h.amount)} to ${h.payee}`}
          detail={`Risk ${h.riskScore}/100 · ${h.reasons[0] ?? "Unusual payment"}`}
          actions={<>
            <ActionButton path="/api/guardian" body={{ action: "block", holdId: h.id }} done="Blocked">Block</ActionButton>
            <Link href={`/guardian/${h.id}`} className={buttonClass("secondary")}>Review</Link>
          </>} />
      ))}

      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-[1fr_1fr_1fr_1.7fr] lg:gap-4">
        <FeatureTile href="/protect" Icon={ShieldCheck} title="Protect" desc="Scam check · Vault escrow · Guardian" />
        <FeatureTile href="/get-paid" Icon={Database} title="Get Paid"
          desc={open.length ? `${open.length} open invoice${open.length > 1 ? "s" : ""} · ${usd(owed)} outstanding · agent is chasing` : `${usd(month.reduce((s, t) => s + t.amount, 0))} received in 30 days`} />
        <FeatureTile href="/support" Icon={Headphones} title="Resolve" desc="AI support that can act, with your OK" />
        <div className="col-span-3 lg:col-span-1"><Alerts items={alerts} limit={3} /></div>
      </div>
    </div>
  );
}
