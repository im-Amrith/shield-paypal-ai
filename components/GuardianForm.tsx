"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { api, buttonClass, inputClass, Spinner } from "./client";

const PRESETS = [
  { label: "Electricity bill", payee: "KSEB Electricity", amount: "24", note: "monthly bill", method: "paypal" },
  { label: "“Tax office” call", payee: "Income Tax Officer Verma", amount: "450", note: "penalty, pay immediately to avoid arrest", method: "paypal" },
  { label: "Online friend", payee: "Anna Williams", amount: "800", note: "my love, for your visa fee so you can visit", method: "paypal" },
];

const big = `${inputClass} mt-2 min-h-14 text-[18px]`;

export function GuardianForm() {
  const router = useRouter();
  const [f, setF] = useState({ payee: "", amount: "", note: "", method: "paypal" });
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-5 text-[17px]" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setMsg(null);
      try {
        const r = await api<{ status: string; hold?: { id: string } }>("/api/guardian", { action: "pay", ...f });
        if (r.status === "held" && r.hold) router.push(`/guardian/${r.hold.id}`);
        else { setMsg({ tone: "ok", text: `Sent $${f.amount} to ${f.payee}. Nothing unusual about this payment.` }); setF({ payee: "", amount: "", note: "", method: "paypal" }); router.refresh(); }
      } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); } finally { setBusy(false); }
    }}>
      <div>
        <p className="text-[15px] text-muted">Fill in for me</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => <button type="button" key={p.label} className="press min-h-11 rounded-full border border-border bg-raised px-4 text-[15px] font-semibold hover:border-accent/60" onClick={() => { setF(p); setMsg(null); }}>{p.label}</button>)}
        </div>
      </div>
      <label className="block font-bold">Pay to<input required className={big} value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} placeholder="Name of the person or company" /></label>
      <label className="block font-bold">Amount
        <span className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 mt-1 -translate-y-1/2 text-[18px] text-muted">$</span>
          <input required inputMode="decimal" className={`${big} tabular pl-8`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </span>
      </label>
      <label className="block font-bold">What is it for?<input className={big} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="For example: monthly bill" /></label>
      <label className="block font-bold">Pay with
        <select className={big} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="paypal">PayPal</option><option value="gift_card">Gift card</option><option value="crypto">Crypto</option>
        </select>
      </label>
      <button className={buttonClass("primary", true, "lg")} disabled={busy}>{busy ? <><Spinner /> Checking it first…</> : "Check and send"}</button>
      {msg && (
        <p role="status" className={`arrive flex items-start gap-2 rounded-panel px-4 py-3 font-semibold ${msg.tone === "ok" ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>
          {msg.tone === "ok" && <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0" />}{msg.text}
        </p>
      )}
    </form>
  );
}
