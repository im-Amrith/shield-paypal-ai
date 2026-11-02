"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass, labelClass, ActionButton, Spinner } from "./client";

export function NewDealForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Canon 200D camera with 18-55 lens");
  const [amount, setAmount] = useState("320");
  const [hours, setHours] = useState("72");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        const r = await api<{ deal: { id: string } }>("/api/vault", { action: "create", title, amount: Number(amount), currency: "USD", autoReleaseHours: Number(hours) });
        router.push(`/vault/${r.deal.id}`);
      } catch (e) { setErr((e as Error).message); setBusy(false); }
    }}>
      <label className={labelClass}>What are you selling?<input required className={`${inputClass} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>Price
          <span className="relative mt-1.5 block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input required inputMode="decimal" className={`${inputClass} tabular pl-7`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </span>
        </label>
        <label className={labelClass}>Buyer can check for
          <select className={`${inputClass} mt-1.5`} value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="48">2 days</option><option value="72">3 days</option><option value="120">5 days</option>
          </select>
        </label>
      </div>
      <button className={buttonClass("primary", true)} disabled={busy}>{busy ? <><Spinner /> Creating…</> : "Create Vault link"}</button>
      {err && <p role="alert" className="text-[14px] text-danger">{err}</p>}
    </form>
  );
}

export function ShipForm({ id }: { id: string }) {
  const [tracking, setTracking] = useState("EZ123456789IN");
  const [carrier, setCarrier] = useState("India Post");
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Carrier<input className={`${inputClass} mt-1.5`} value={carrier} onChange={(e) => setCarrier(e.target.value)} /></label>
        <label className={labelClass}>Tracking number<input className={`${inputClass} mt-1.5`} value={tracking} onChange={(e) => setTracking(e.target.value)} /></label>
      </div>
      <ActionButton full path="/api/vault" body={{ action: "ship", id, trackingNumber: tracking, carrier }}>Mark shipped</ActionButton>
    </div>
  );
}

export function DisputeForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Item not as described");
  if (!open) return <button className={buttonClass("secondary", true)} onClick={() => setOpen(true)}>Report a problem</button>;
  return (
    <div className="arrive space-y-3 rounded-panel border border-border p-4">
      <label className={labelClass}>What went wrong?
        <select className={`${inputClass} mt-1.5`} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Item not as described</option><option>Item damaged</option><option>Wrong item</option><option>Never arrived</option>
        </select>
      </label>
      <p className="text-[14px] text-muted">The money stays held while a support specialist looks at it. The seller is told.</p>
      <div className="flex gap-2">
        <ActionButton variant="danger" path="/api/vault" body={{ action: "dispute", id, reason }}>Pause release</ActionButton>
        <button className={buttonClass("secondary")} onClick={() => setOpen(false)}>Never mind</button>
      </div>
    </div>
  );
}
