import Link from "next/link";
import { ShieldCheck, Wallet, MessageCircle, HeartHandshake, ScanSearch, Lock, Repeat } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { riskFor } from "@/lib/risk";
import { Card, Badge, Section, Money } from "@/components/ui";
import { Alerts } from "@/components/Alerts";
import { balance } from "@/lib/collections";

export const dynamic = "force-dynamic";

function Tile({ href, title, body, Icon }: { href: string; title: string; body: string; Icon: typeof ShieldCheck }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white p-4 hover:border-brand/40">
      <span className="rounded-xl bg-brand-soft p-2 text-brand"><Icon size={22} aria-hidden /></span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink/60">{body}</span>
      </span>
    </Link>
  );
}

export default async function Home() {
  const user = await getUser();
  const d = db();
  const alerts = d.notifications.filter((n) => n.userId === user.id).slice(0, 8);
  const first = user.name.split(" ")[0];

  if (user.role === "senior") {
    const myHolds = d.holds.filter((h) => h.seniorId === user.id && h.status === "held");
    return (
      <div className="text-[17px]">
        <h1 className="mb-1 text-3xl font-semibold">Namaskaram, {first}</h1>
        <p className="mb-5 text-ink/60">Guardian mode is on. {d.users.find((u) => u.id === user.guardedBy)?.name.split(" ")[0]} checks unusual payments with you.</p>
        <div className="space-y-3">
          <Tile href="/guardian" title="Send money safely" body="We check every payment for scam signs first" Icon={HeartHandshake} />
          <Tile href="/protect/scan" title="Is this message a scam?" body="Paste a message or add a screenshot" Icon={ScanSearch} />
          <Tile href="/subscriptions" title="My subscriptions" body="Find payments that repeat every month" Icon={Repeat} />
          <Tile href="/support" title="Get help — speak or type" body="English, हिन्दी or മലയാളം" Icon={MessageCircle} />
        </div>
        {myHolds.length > 0 && (
          <Card tone="warn" className="mt-5">
            <p className="font-semibold">{myHolds.length} payment{myHolds.length > 1 ? "s" : ""} paused for a check</p>
            <Link className="text-sm text-brand underline" href={`/guardian/${myHolds[0].id}`}>See why</Link>
          </Card>
        )}
        <div id="alerts" className="mt-6"><Section title="Alerts"><Alerts items={alerts} /></Section></div>
      </div>
    );
  }

  if (user.role === "support") {
    const waiting = d.cases.filter((c) => c.status === "waiting_human").length;
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Hi {first}</h1>
        <Card tone={waiting ? "warn" : undefined}>
          <p className="font-semibold">{waiting} case{waiting === 1 ? "" : "s"} waiting for you</p>
          <Link href="/console" className="text-sm text-brand underline">Open the support console</Link>
        </Card>
        <div id="alerts" className="mt-6"><Section title="Alerts"><Alerts items={alerts} /></Section></div>
      </div>
    );
  }

  if (user.role === "client") {
    const mine = d.invoices.filter((i) => i.clientEmail === user.email && i.status !== "paid" && i.status !== "cancelled");
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Hi {first}</h1>
        <Section title="Invoices to pay">
          {mine.length ? mine.map((i) => (
            <Card key={i.id}>
              <p className="font-semibold">{i.id} · <Money amount={balance(i)} currency={i.currency} /></p>
              <p className="text-sm text-ink/60">Due {new Date(i.dueAt).toDateString()} · {i.reminders.length} reminder(s) received</p>
              <Link className="mt-2 inline-block text-sm text-brand underline" href={`/get-paid/pay/${i.id}`}>Pay now</Link>
            </Card>
          )) : <p className="text-sm text-ink/50">Nothing due.</p>}
        </Section>
        <div id="alerts"><Section title="Alerts"><Alerts items={alerts} /></Section></div>
      </div>
    );
  }

  if (user.role === "buyer") {
    const deals = d.vaultDeals.filter((v) => v.buyerId === user.id || v.status === "created");
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold">Hi {first}</h1>
        <div className="space-y-3">
          <Tile href="/protect/scan" title="Check a seller before you pay" body="Paste the chat or listing" Icon={ScanSearch} />
          <Tile href="/vault" title="Vault payments" body="Your money is released only after delivery" Icon={Lock} />
        </div>
        <Section title="Your Vault deals">
          {deals.length ? deals.map((v) => (
            <Link key={v.id} href={`/vault/${v.id}`} className="block rounded-xl border border-ink/10 bg-white p-3">
              <span className="font-medium">{v.title}</span> · <Money amount={v.amount} currency={v.currency} /> <Badge>{v.status}</Badge>
            </Link>
          )) : <p className="text-sm text-ink/50">No deals yet. Ask the seller for a Vault link.</p>}
        </Section>
        <div id="alerts"><Section title="Alerts"><Alerts items={alerts} /></Section></div>
      </div>
    );
  }

  // Freelancer (Meera)
  const risk = riskFor(user.id);
  const state = d.accountState[user.id];
  const open = d.invoices.filter((i) => i.freelancerId === user.id && (i.status === "sent" || i.status === "partially_paid"));
  const owed = open.reduce((s, i) => s + balance(i), 0);
  const guardianHolds = d.holds.filter((h) => h.guardianId === user.id && h.status === "held");
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Hi {first}</h1>
      <p className="mb-4 text-sm text-ink/60">Here's what Shield is watching for you.</p>

      {guardianHolds.map((h) => (
        <Card key={h.id} tone="warn" className="mb-3">
          <p className="font-semibold">Ravi is trying to pay {h.currency} {h.amount} to {h.payee}</p>
          <p className="text-sm text-ink/70">Risk {h.riskScore}/100 · {h.reasons[0]}</p>
          <Link href={`/guardian/${h.id}`} className="mt-2 inline-block text-sm font-semibold text-brand underline">Review and decide</Link>
        </Card>
      ))}

      <Link href="/get-paid/account" className="mb-3 block">
        <Card tone={state?.limited ? "danger" : risk.level === "low" ? "safe" : "warn"}>
          <div className="flex items-center justify-between">
            <p className="font-semibold">{state?.limited ? "Account limited — see why" : `Account health: ${risk.level === "low" ? "good" : `${risk.level} risk`}`}</p>
            <Badge tone={state?.limited ? "danger" : risk.level === "low" ? "safe" : "warn"}>{risk.score}/100</Badge>
          </div>
          {!state?.limited && risk.signals[0] && <p className="mt-1 text-sm text-ink/70">{risk.signals[0].title}. Tap to fix it before PayPal reviews you.</p>}
        </Card>
      </Link>

      <div className="grid grid-cols-1 gap-3">
        <Tile href="/protect" title="Protect" body="Scam check · Vault escrow · Guardian for Dad" Icon={ShieldCheck} />
        <Tile href="/get-paid" title={`Get Paid · ${open.length} open invoice${open.length === 1 ? "" : "s"}`} body={owed ? `USD ${owed.toFixed(2)} outstanding; the agent is chasing` : "Invoices, FX copilot, collections agent"} Icon={Wallet} />
        <Tile href="/support" title="Resolve" body="AI support that can actually act, with your OK" Icon={MessageCircle} />
      </div>

      <div id="alerts" className="mt-6"><Section title="Alerts"><Alerts items={alerts} /></Section></div>
    </div>
  );
}
