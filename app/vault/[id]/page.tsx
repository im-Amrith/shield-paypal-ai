import { notFound } from "next/navigation";
import { getUser } from "@/lib/session";
import { getDeal, releaseEta, MAX_DEAL_DAYS } from "@/lib/vault";
import { estimateFees } from "@/lib/fx";
import { paypalMode } from "@/lib/paypal";
import { Card, Badge, Money, PageHeader, Section, Timeline, When } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { ShipForm, DisputeForm } from "@/components/VaultForms";
import { PayPalPay } from "@/components/PayPalPay";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = getDeal(id);
  if (!deal) notFound();
  const me = await getUser();
  const isSeller = deal.sellerId === me.id;
  const isBuyer = deal.buyerId === me.id || (!deal.buyerId && me.role === "buyer");
  const fees = estimateFees(deal.amount, deal.currency, "domestic");
  const eta = releaseEta(deal);
  const link = `${process.env.APP_URL || "http://localhost:3000"}/vault/${deal.id}`;

  return (
    <div>
      <PageHeader title={deal.title} back="/vault" />
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-semibold"><Money amount={deal.amount} currency={deal.currency} /></span>
          <Badge tone={deal.status === "released" ? "safe" : deal.status === "disputed" ? "danger" : "brand"}>{deal.status}</Badge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink/60">PayPal fee (est., seller pays)</dt><dd className="text-right tabular">{deal.currency} {fees.fee.toFixed(2)} ({fees.ratePercent}% + {fees.fixed})</dd>
          <dt className="text-ink/60">Seller receives</dt><dd className="text-right tabular font-semibold">{deal.currency} {fees.net.toFixed(2)}</dd>
          <dt className="text-ink/60">Shield fee</dt><dd className="text-right">None</dd>
        </dl>
        <p className="mt-2 text-[11px] text-ink/45">Fees are estimates from PayPal's published rates. Holds last at most {MAX_DEAL_DAYS} days, inside PayPal's 29-day authorization limit.</p>
      </Card>

      {deal.status === "created" && isSeller && (
        <Card tone="brand" className="mb-4">
          <p className="font-semibold">Share this link with your buyer</p>
          <p className="my-2 break-all rounded-lg bg-white px-2 py-1 text-xs">{link}</p>
          <CopyButton text={`Let's use a Vault payment so the money is released only after delivery: ${link}`} label="Copy message" />
        </Card>
      )}

      <div className="mb-5 space-y-3">
        {deal.status === "created" && isBuyer && (
          <Card>
            <p className="mb-2 text-sm">Your money will be <b>held</b>, not sent. The seller is paid only after you confirm, or {deal.autoReleaseHours / 24} days after delivery if you don't report a problem.</p>
            <PayPalPay dealId={deal.id} orderId={deal.paypalOrderId!} currency={deal.currency} />
          </Card>
        )}
        {deal.status === "created" && !isBuyer && !isSeller && <p className="text-sm text-ink/60">Switch to the buyer (Arjun) to pay.</p>}
        {deal.status === "authorized" && isSeller && <Card><p className="mb-2 text-sm font-semibold">Payment secured. Ship it and add tracking.</p><ShipForm id={deal.id} /></Card>}
        {deal.status === "authorized" && (isSeller || isBuyer) && <ActionButton full variant="secondary" path="/api/vault" body={{ action: "cancel", id: deal.id }} confirm="Cancel and release the hold?">Cancel before shipping</ActionButton>}
        {deal.status === "shipped" && (
          <Card>
            <p className="text-sm">Shipped with {deal.carrier}, tracking <span className="font-mono">{deal.trackingNumber}</span>.</p>
            <div className="mt-3"><ActionButton full variant="secondary" path="/api/vault" body={{ action: "deliver", id: deal.id }}>Demo: carrier reports delivered</ActionButton></div>
          </Card>
        )}
        {(deal.status === "shipped" || deal.status === "delivered") && isBuyer && (
          <>
            <ActionButton full variant="safe" path="/api/vault" body={{ action: "confirm", id: deal.id }}>It arrived as described — release payment</ActionButton>
            <DisputeForm id={deal.id} />
          </>
        )}
        {deal.status === "delivered" && eta && <Card tone="brand"><p className="text-sm">Auto-releases to the seller on <b><When iso={eta} /></b> unless the buyer reports a problem.</p></Card>}
        {deal.status === "disputed" && (
          <Card tone="danger">
            <p className="font-semibold">Release paused: {deal.disputeReason}</p>
            <p className="text-sm text-ink/70">Money stays held while support reviews it.</p>
            {me.role === "support" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton variant="secondary" path="/api/vault" body={{ action: "resolve", id: deal.id, outcome: "refund_buyer" }}>Refund buyer</ActionButton>
                <ActionButton path="/api/vault" body={{ action: "resolve", id: deal.id, outcome: "pay_seller" }}>Pay seller</ActionButton>
              </div>
            )}
          </Card>
        )}
        {deal.status === "released" && <Card tone="safe"><p className="font-semibold">Paid to the seller.</p><p className="text-xs text-ink/60">PayPal capture {deal.captureId}</p></Card>}
      </div>

      <Section title="What happened">
        <Timeline items={deal.history.map((h) => ({ at: h.at, label: h.event[0].toUpperCase() + h.event.slice(1), detail: h.detail }))} />
      </Section>
      <p className="text-[11px] text-ink/45">PayPal {paypalMode()} · order {deal.paypalOrderId}{deal.authorizationId ? ` · authorization ${deal.authorizationId}` : ""}. Delivery events are simulated in the demo.</p>
    </div>
  );
}
