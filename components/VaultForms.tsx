"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass, ActionButton } from "./client";

export function NewDealForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Canon 200D camera with 18-55 lens");
  const [amount, setAmount] = useState("320");
  const [hours, setHours] = useState("72");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        const r = await api<{ deal: { id: string } }>("/api/vault", { action: "create", title, amount: Number(amount), currency: "USD", autoReleaseHours: Number(hours) });
        router.push(`/vault/${r.deal.id}`);
      } catch (e) { setErr((e as Error).message); setBusy(false); }
    }}>
      <label className="block text-sm font-medium">What are you selling?<input className={`${inputClass} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Price (USD)<input inputMode="decimal" className={`${inputClass} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block text-sm font-medium">Buyer can check for
          <select className={`${inputClass} mt-1`} value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="48">2 days</option><option value="72">3 days</option><option value="120">5 days</option>
          </select>
        </label>
      </div>
      <button className={buttonClass("primary", true)} disabled={busy}>{busy ? "Creating…" : "Create Vault link"}</button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}

export function ShipForm({ id }: { id: string }) {
  const [tracking, setTracking] = useState("EZ123456789IN");
  const [carrier, setCarrier] = useState("India Post");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Carrier" className={inputClass} value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        <input aria-label="Tracking number" className={inputClass} value={tracking} onChange={(e) => setTracking(e.target.value)} />
      </div>
      <ActionButton full path="/api/vault" body={{ action: "ship", id, trackingNumber: tracking, carrier }}>Add tracking & mark shipped</ActionButton>
    </div>
  );
}

export function DisputeForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Item not as described");
  if (!open) return <button className={buttonClass("secondary", true)} onClick={() => setOpen(true)}>Report a problem</button>;
  return (
    <div className="space-y-2">
      <select aria-label="Problem" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
        <option>Item not as described</option><option>Item damaged</option><option>Wrong item</option><option>Never arrived</option>
      </select>
      <ActionButton full variant="danger" path="/api/vault" body={{ action: "dispute", id, reason }}>Pause release and get help</ActionButton>
    </div>
  );
}
