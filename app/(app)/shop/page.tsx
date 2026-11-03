import { ShoppingCart, ExternalLink, Repeat } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { paypalMode } from "@/lib/paypal";
import { policyFor, spentThisMonth, productSource, isDue, nextDue } from "@/lib/shop";
import type { ShopCart } from "@/lib/types";
import { Card, Pill, PageHeader, Section, Empty, When, Mark, Note, HeroBand, HeroGauge, Hi, KeyValues, fmtMoney, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { PayPalButtons } from "@/components/PayPalPay";
import { NeedForm, RevokeSwitch, CapsForm } from "@/components/ShopForms";

export const dynamic = "force-dynamic";

const STATUS: Record<ShopCart["status"], { label: string; tone: Tone }> = {
  awaiting_payment: { label: "Ready to pay", tone: "accent" },
  pending_approval: { label: "Needs your OK", tone: "accent" },
  paid: { label: "Paid", tone: "success" },
  blocked: { label: "Blocked by your caps", tone: "danger" },
  declined: { label: "Declined", tone: "neutral" },
};

const DECISION: Record<ShopCart["decision"], string> = {
  auto: "Auto-approved",
  ask_customer: "One-tap approval",
  needs_human: "Needs review",
  blocked: "Blocked",
};

function CartCard({ cart, revoked }: { cart: ShopCart; revoked: boolean }) {
  const st = STATUS[cart.status];
  const live = cart.status === "pending_approval" || cart.status === "awaiting_payment";
  return (
    <Card as="article" className={`overflow-hidden ${live ? "border-accent" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <p className="text-[13px] text-muted"><When iso={cart.createdAt} />{cart.reorderId ? " · monthly reorder" : ""}</p>
          <h3 className="mt-0.5 font-bold break-words">&ldquo;{cart.need}&rdquo;</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cart.source === "sample" && <Pill>Sample products</Pill>}
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
      </div>
      {cart.items.length > 0 && (
        <ul className="divide-y divide-border">
          {cart.items.map((it) => (
            <li key={it.productId + it.query} className="flex items-start gap-3 px-5 py-4">
              <Mark name={it.retailer} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-muted">For &ldquo;{it.query}&rdquo;</p>
                <p className="font-bold leading-snug">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {it.title} <ExternalLink size={13} aria-label="(opens the retailer)" className="inline align-baseline text-muted" />
                    </a>
                  ) : it.title}
                </p>
                <p className="mt-0.5 text-[14px] text-muted">{it.retailer}{it.rating ? ` · ${it.rating}★` : ""} · {it.reason}</p>
              </div>
              <span className="tabular shrink-0 font-bold">{fmtMoney(it.price, it.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      {cart.skipped.length > 0 && (
        <ul className="space-y-1 border-t border-border px-5 py-3 text-[14px] text-muted">
          {cart.skipped.map((s) => <li key={s.query}>&ldquo;{s.query}&rdquo;: {s.why}</li>)}
        </ul>
      )}
      <div className="border-t border-border bg-raised/50 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="min-w-0 text-[14px] text-muted">{DECISION[cart.decision]}: {cart.reason}</span>
          <span className="tabular text-[20px] font-extrabold">{fmtMoney(cart.total, cart.currency)}</span>
        </div>
        {cart.status === "pending_approval" && !revoked && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ActionButton full path="/api/shop" body={{ action: "approve", id: cart.id }}>Approve {fmtMoney(cart.total, cart.currency)}</ActionButton>
            <ActionButton full variant="secondary" path="/api/shop" body={{ action: "decline", id: cart.id }}>Decline</ActionButton>
          </div>
        )}
        {cart.status === "awaiting_payment" && cart.paypalOrderId && !revoked && (
          <div className="mt-4">
            <PayPalButtons orderId={cart.paypalOrderId} currency={cart.currency} intent="capture" path="/api/shop" body={{ action: "pay", id: cart.id }}
              mockLabel="Pay with PayPal" mockNote="Mock mode: the PayPal approval is simulated." />
            <p className="mt-2 text-[13px] text-muted">Your caps are checked again right before PayPal captures the payment.</p>
          </div>
        )}
        {live && revoked && <p className="mt-3 text-[14px] font-bold text-danger">Agent revoked: this cart can&apos;t be paid.</p>}
        {cart.status === "paid" && <p className="mt-2 text-[14px] text-muted">Paid <When iso={cart.paidAt!} /> · PayPal capture <span className="tabular break-all">{cart.captureId}</span></p>}
      </div>
    </Card>
  );
}

export default async function ShopPage() {
  const me = await getUser();
  const at = now();
  const policy = policyFor(me.id);
  const spent = spentThisMonth(me.id, at);
  const left = Math.max(0, policy.monthlyCap - spent);
  const carts = (db().carts ?? []).filter((c) => c.userId === me.id).slice(0, 8);
  const reorders = (db().reorders ?? []).filter((r) => r.userId === me.id);
  const pct = policy.monthlyCap ? Math.min(100, Math.round((spent / policy.monthlyCap) * 100)) : 100;
  const source = productSource();

  return (
    <div>
      <PageHeader title="Shopping agent" subtitle="Tell it what you need. It finds and compares options, and buys only within the caps you set." />
      <HeroBand
        visual={<HeroGauge value={pct} label="Spent this month" suffix="" valueText={`${fmtMoney(spent, "USD")} of ${fmtMoney(policy.monthlyCap, "USD")} this month`}
          display={<span className="text-[0.62em]">{fmtMoney(spent, "USD", 0)}</span>} />}
        label="Shopping agent"
        title={policy.revoked ? <>Agent is <Hi tone="danger">revoked</Hi></> : <><Hi>{fmtMoney(left, "USD", 0)}</Hi> left this month</>}>
        Buys on its own up to {fmtMoney(policy.autoApproveBelow, "USD", 0)}, asks you up to {fmtMoney(policy.perOrderCap, "USD", 0)} an order, and blocks anything over your caps.
      </HeroBand>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <div className="mb-6 lg:hidden"><RevokeSwitch revoked={policy.revoked} /></div>
          <Section title="New request">
            <Card className="p-5 sm:p-6">
              <NeedForm disabled={policy.revoked} />
              <p className="mt-3 text-[13px] text-muted">
                {source === "channel3" ? "Live products from Channel3, compared across retailers." : "Sample products: a small built-in list. Add CHANNEL3_API_KEY for live products from Channel3."}
                {paypalMode() === "mock" ? " Payments are simulated (no PayPal keys)." : " Checkout runs on PayPal (sandbox)."}
              </p>
            </Card>
          </Section>

          <Section title="Carts" className="!mb-0">
            {carts.length
              ? <div className="space-y-4">{carts.map((c) => <CartCard key={c.id} cart={c} revoked={policy.revoked} />)}</div>
              : <Empty>No carts yet. Try the monthly reorder example above.</Empty>}
          </Section>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="hidden lg:block"><RevokeSwitch revoked={policy.revoked} /></div>
          <Card as="section" className="p-5">
            <h2 className="font-extrabold">Your caps</h2>
            <div className="mt-2">
              <KeyValues items={[
                { k: "Spent this month", v: fmtMoney(spent, "USD"), strong: true },
                { k: "Left this month", v: fmtMoney(left, "USD") },
              ]} />
            </div>
            <div className="mt-4"><CapsForm perOrderCap={policy.perOrderCap} monthlyCap={policy.monthlyCap} autoApproveBelow={policy.autoApproveBelow} /></div>
          </Card>
          <Card as="section" className="p-5">
            <h2 className="flex items-center gap-2 font-extrabold"><Repeat size={17} aria-hidden className="text-accent" /> Monthly reorders</h2>
            {reorders.length ? (
              <ul className="mt-3 space-y-4">
                {reorders.map((r) => (
                  <li key={r.id} className="text-[14px]">
                    <p className="font-bold">{r.items.map((i) => i.query).join(", ")}</p>
                    <p className="text-muted">
                      {r.active ? (isDue(r, at) ? <span className="font-bold text-accent">Due now</span> : <>Next on <When iso={nextDue(r).toISOString()} date /></>) : "Stopped"}
                      {r.budget ? ` · budget ${fmtMoney(r.budget, "USD", 0)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.active && !policy.revoked && <ActionButton path="/api/shop" body={{ action: "reorder", id: r.id }}>{isDue(r, at) ? "Build this month's cart" : "Reorder now"}</ActionButton>}
                      <ActionButton variant="secondary" path="/api/shop" body={{ action: "reorder-active", id: r.id, active: !r.active }}>{r.active ? "Stop" : "Resume"}</ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[14px] text-muted">Paid carts are saved here, and the agent offers them again a month later.</p>}
          </Card>
          <Note className="rounded-card border border-border bg-card p-5">
            <ShoppingCart size={16} aria-hidden className="mb-1 inline text-accent" /> Every purchase goes through the same guardrails engine as Vault, Guardian and support refunds: checked when the cart is built, and again right before PayPal takes the money.
          </Note>
        </aside>
      </div>
    </div>
  );
}
