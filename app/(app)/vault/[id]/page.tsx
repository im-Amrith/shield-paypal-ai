import { notFound } from "next/navigation";
import { Lock, Truck, PackageCheck, CircleCheck, PauseCircle, Link2, ShieldCheck } from "lucide-react";
import { getUser } from "@/lib/session";
import { getDeal, releaseEta, MAX_DEAL_DAYS } from "@/lib/vault";
import { estimateFees } from "@/lib/fx";
import { paypalMode } from "@/lib/paypal";
import { Card, Pill, PageHeader, Section, Timeline, When, Track, KeyValues, Note, fmtMoney, HeroBand, HeroGauge, Hi, AlertBanner } from "@/components/ui";
import { VAULT_STEPS, vaultStage, vaultStatus } from "@/components/vaultStatus";
import { ActionButton, CopyButton } from "@/components/client";
import { ShipForm, DisputeForm } from "@/components/VaultForms";
import { PayPalPay } from "@/components/PayPalPay";

export const dynamic = "force-dynamic";

function whereMoney(status: string) {
  switch (status) {
    case "created": return "Still with the buyer. Nothing has been paid yet.";
    case "authorized": case "shipped": case "delivered": return "Held by PayPal on the buyer's account. Neither side can spend it.";
    case "disputed": return "Held by PayPal while support reviews the problem.";
    case "released": return "Paid to the seller.";
    default: return "Released back to the buyer. Nothing was charged.";
  }
}

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
  const st = vaultStatus[deal.status];
  const stage = vaultStage(deal.status);
  const live = deal.status !== "voided" && deal.status !== "expired";
  const pct = live ? Math.round((stage / (VAULT_STEPS.length - 1)) * 100) : 0;

  // The next step for whoever is looking, as one banner.
  let next: React.ReactNode = null;
  if (deal.status === "created" && isSeller) {
    next = <AlertBanner Icon={Link2} title="Send this link to your buyer" detail={<span className="tabular break-all">{link}</span>}
      actions={<CopyButton variant="primary" text={`Let's use a Vault payment so the money is released only after delivery: ${link}`} label="Copy message" />} />;
  } else if (deal.status === "created" && isBuyer) {
    next = (
      <Card className="mb-5 border-l-4 border-l-accent p-5 sm:p-6">
        <h2 className="text-[18px] font-extrabold">Pay {fmtMoney(deal.amount, deal.currency)} into Vault</h2>
        <p className="mb-4 mt-1 text-[15px] text-muted">Your money is <b className="font-bold text-fg">held, not sent</b>. Meera is paid only after you confirm, or {deal.autoReleaseHours / 24} days after delivery if you don&apos;t report a problem.</p>
        <PayPalPay dealId={deal.id} orderId={deal.paypalOrderId!} currency={deal.currency} />
      </Card>
    );
  } else if (deal.status === "created") {
    next = <AlertBanner Icon={Lock} title="Waiting for the buyer to pay" detail="Switch to Arjun (the buyer) from the person menu to pay." />;
  } else if (deal.status === "authorized" && isSeller) {
    next = (
      <Card className="mb-5 border-l-4 border-l-accent p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[18px] font-extrabold"><Truck size={20} aria-hidden className="text-accent" /> Payment secured. Ship it.</h2>
        <p className="mb-4 mt-1 text-[14px] text-muted">Arjun&apos;s {fmtMoney(deal.amount, deal.currency)} is held. Add tracking so he can follow the parcel.</p>
        <ShipForm id={deal.id} />
        <div className="mt-3"><ActionButton full variant="secondary" path="/api/vault" body={{ action: "cancel", id: deal.id }} confirm="Cancel the deal and release the hold back to the buyer?">Cancel before shipping</ActionButton></div>
      </Card>
    );
  } else if (deal.status === "authorized") {
    next = <AlertBanner Icon={ShieldCheck} title="Your payment is held" detail="Meera has been told to ship. You'll get an alert with tracking."
      actions={isBuyer ? <ActionButton variant="secondary" path="/api/vault" body={{ action: "cancel", id: deal.id }} confirm="Cancel the deal and release the hold back to you?">Cancel before shipping</ActionButton> : undefined} />;
  } else if (deal.status === "shipped") {
    next = <AlertBanner Icon={Truck} title="On its way" detail={<>{deal.carrier} · <span className="tabular">{deal.trackingNumber}</span> · Demo: real carrier events would arrive by webhook.</>}
      actions={<ActionButton variant="secondary" path="/api/vault" body={{ action: "deliver", id: deal.id }}>Simulate delivery scan</ActionButton>} />;
  } else if (deal.status === "delivered") {
    next = <AlertBanner Icon={PackageCheck} title="Delivered" detail={eta ? <>Releases to Meera on <b className="text-fg"><When iso={eta} /></b> unless {isBuyer ? "you report" : "the buyer reports"} a problem.</> : undefined} />;
  } else if (deal.status === "disputed") {
    next = <AlertBanner tone="danger" Icon={PauseCircle} title={`Release paused: ${deal.disputeReason}`} detail="The money stays held while a support specialist reviews it. Both sides are kept informed."
      actions={me.role === "support" ? <>
        <ActionButton path="/api/vault" body={{ action: "resolve", id: deal.id, outcome: "pay_seller" }} confirm={`Pay ${fmtMoney(deal.amount, deal.currency)} to the seller?`}>Pay seller</ActionButton>
        <ActionButton variant="secondary" path="/api/vault" body={{ action: "resolve", id: deal.id, outcome: "refund_buyer" }} confirm={`Refund ${fmtMoney(deal.amount, deal.currency)} to the buyer?`}>Refund buyer</ActionButton>
      </> : undefined} />;
  } else if (deal.status === "released") {
    next = <AlertBanner tone="success" Icon={CircleCheck} title="Paid to the seller" detail={<>PayPal capture <span className="tabular">{deal.captureId}</span></>} />;
  }

  return (
    <div>
      <PageHeader title={deal.title} subtitle={isSeller ? "You're selling to Arjun Menon" : isBuyer ? "You're buying from Meera Nair" : "Vault deal"} />

      <HeroBand
        visual={<HeroGauge value={pct} label="Deal progress" suffix="" valueText={`Step ${stage + 1} of ${VAULT_STEPS.length}: ${st.label}`}
          display={<span className="text-[0.62em]">{fmtMoney(deal.amount, deal.currency, 0)}</span>} />}
        label="Vault deal"
        title={<>Status: <Hi tone={st.tone === "neutral" ? "accent" : st.tone}>{st.label}</Hi></>}
        aside={undefined}>
        {whereMoney(deal.status)}
        {live && <div className="mt-4 text-left"><Track steps={VAULT_STEPS} current={stage} failed={deal.status === "disputed"} /></div>}
      </HeroBand>

      {next}
      {deal.paypalTracking && (
        <p className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-[14px]">
          {deal.paypalTracking.status === "shared"
            ? <Pill tone="success">Tracking shared with PayPal</Pill>
            : <Pill tone="danger">PayPal didn&apos;t accept the tracking</Pill>}
          <span className="text-muted">{deal.paypalTracking.status === "shared" ? deal.paypalTracking.via : deal.paypalTracking.detail}</span>
        </p>
      )}
      {(deal.status === "shipped" || deal.status === "delivered") && isBuyer && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <ActionButton full path="/api/vault" body={{ action: "confirm", id: deal.id }}>It arrived. Release payment</ActionButton>
          <DisputeForm id={deal.id} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Section title="What happened" className="!mb-0 min-w-0">
          <Card className="p-5 sm:p-6">
            <Timeline items={deal.history.map((h) => ({ at: h.at, label: h.event[0].toUpperCase() + h.event.slice(1), detail: h.detail }))} />
          </Card>
        </Section>
        <aside className="min-w-0 space-y-4">
          <Card as="section" className="p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="font-extrabold">{isSeller ? "What you'll receive" : "Fees"}</h2><Pill tone={st.tone}>{st.label}</Pill></div>
            <div className="mt-2">
              <KeyValues items={[
                { k: "Deal amount", v: fmtMoney(deal.amount, deal.currency) },
                { k: <>PayPal fee <span className="text-[13px]">({fees.ratePercent}% + {fees.fixed})</span></>, v: `−${fmtMoney(fees.fee, deal.currency)}` },
                { k: "Shield fee", v: "None" },
                { k: "Seller receives", v: fmtMoney(fees.net, deal.currency), strong: true },
              ]} />
            </div>
            <Note className="mt-2">The seller pays the fee. Estimate from PayPal&apos;s published rates.</Note>
          </Card>
          <Card as="section" className="p-5">
            <h2 className="font-extrabold">Protection terms</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] text-muted">
              <li>Buyer check window: {deal.autoReleaseHours / 24} days after delivery</li>
              <li>Holds end within {MAX_DEAL_DAYS} days, inside PayPal&apos;s 29-day authorization limit</li>
              <li>Either side can cancel before shipping; nothing is charged</li>
            </ul>
          </Card>
          <Note>PayPal {paypalMode()} · order <span className="tabular">{deal.paypalOrderId}</span>{deal.authorizationId ? <> · authorization <span className="tabular">{deal.authorizationId}</span></> : null}</Note>
        </aside>
      </div>
    </div>
  );
}
