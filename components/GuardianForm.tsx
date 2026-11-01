"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass } from "./client";

const PRESETS = [
  { label: "Electricity bill", payee: "KSEB Electricity", amount: "24", note: "monthly bill", method: "paypal" },
  { label: "\"Tax office\" call", payee: "Income Tax Officer Verma", amount: "450", note: "penalty, pay immediately to avoid arrest", method: "paypal" },
  { label: "Online friend", payee: "Anna Williams", amount: "800", note: "my love, for your visa fee so you can visit", method: "paypal" },
];

export function GuardianForm() {
  const router = useRouter();
  const [f, setF] = useState({ payee: "", amount: "", note: "", method: "paypal" });
  const [msg, setMsg] = useState<{ tone: "ok" | "held" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 text-[17px]">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => <button key={p.label} className="rounded-full border border-ink/15 bg-white px-3 py-1 text-xs" onClick={() => setF(p)}>{p.label}</button>)}
      </div>
      <label className="block font-medium">Pay to<input className={`${inputClass} mt-1 text-base`} value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></label>
      <label className="block font-medium">Amount (USD)<input inputMode="decimal" className={`${inputClass} mt-1 text-base`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
      <label className="block font-medium">What is it for?<input className={`${inputClass} mt-1 text-base`} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <label className="block font-medium">Pay with
        <select className={`${inputClass} mt-1 text-base`} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="paypal">PayPal</option><option value="gift_card">Gift card</option><option value="crypto">Crypto</option>
        </select>
      </label>
      <button className={buttonClass("primary", true)} disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try {
          const r = await api<{ status: string; hold?: { id: string } }>("/api/guardian", { action: "pay", ...f });
          if (r.status === "held" && r.hold) router.push(`/guardian/${r.hold.id}`);
          else { setMsg({ tone: "ok", text: "Sent. Nothing unusual about this payment." }); setF({ payee: "", amount: "", note: "", method: "paypal" }); router.refresh(); }
        } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); } finally { setBusy(false); }
      }}>{busy ? "Checking…" : "Send"}</button>
      {msg && <p role="status" className={msg.tone === "ok" ? "text-safe" : "text-danger"}>{msg.text}</p>}
    </div>
  );
}
