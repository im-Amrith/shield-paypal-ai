"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass } from "./client";

interface Option { billCurrency: string; invoiceAmount: number; clientPays: number; clientExtraPercent: number; paypalFee: number; conversionCost: number; netHome: number; notes: string[] }
interface Compare { options: Option[]; recommended: string; reason: string; live: boolean }

export function InvoiceForm() {
  const router = useRouter();
  const [f, setF] = useState({
    clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.example", relationship: "regular",
    item: "Brand identity — final files", price: "800", clientCurrency: "USD", dueInDays: "14", lateFeePercent: "2", offerPayLater: true,
  });
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [bill, setBill] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await api<Compare>("/api/fx", { price: Number(f.price), clientCurrency: f.clientCurrency, homeCurrency: "INR" });
        setCmp(r);
        setBill(r.recommended);
      } catch { setCmp(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [f.price, f.clientCurrency]);

  const chosen = cmp?.options.find((o) => o.billCurrency === bill);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!chosen) return;
      setBusy(true); setErr(null);
      try {
        await api("/api/invoices", {
          action: "create", clientName: f.clientName, clientEmail: f.clientEmail, relationship: f.relationship,
          items: [{ name: f.item, amount: chosen.invoiceAmount }], currency: chosen.billCurrency,
          dueInDays: Number(f.dueInDays), lateFeePercent: Number(f.lateFeePercent), offerPayLater: f.offerPayLater,
        });
        router.refresh();
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block text-sm font-medium">Client<input className={`${inputClass} mt-1`} value={f.clientName} onChange={set("clientName")} /></label>
        <label className="col-span-2 block text-sm font-medium">Client email<input type="email" className={`${inputClass} mt-1`} value={f.clientEmail} onChange={set("clientEmail")} /></label>
        <label className="col-span-2 block text-sm font-medium">Work<input className={`${inputClass} mt-1`} value={f.item} onChange={set("item")} /></label>
        <label className="block text-sm font-medium">Agreed price<input inputMode="decimal" className={`${inputClass} mt-1`} value={f.price} onChange={set("price")} /></label>
        <label className="block text-sm font-medium">in
          <select className={`${inputClass} mt-1`} value={f.clientCurrency} onChange={set("clientCurrency")}>
            {["USD", "GBP", "EUR", "AUD", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Relationship
          <select className={`${inputClass} mt-1`} value={f.relationship} onChange={set("relationship")}>
            <option value="new">New client</option><option value="regular">Regular</option><option value="key_account">Key account</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Due in (days)<input inputMode="numeric" className={`${inputClass} mt-1`} value={f.dueInDays} onChange={set("dueInDays")} /></label>
        <label className="block text-sm font-medium">Late fee %<input inputMode="decimal" className={`${inputClass} mt-1`} value={f.lateFeePercent} onChange={set("lateFeePercent")} /></label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.offerPayLater} onChange={(e) => setF({ ...f, offerPayLater: e.target.checked })} /> Offer Pay Later</label>
      </div>
      <p className="text-xs text-ink/50">The late fee is written into the invoice terms now, so it's agreed before any reminder mentions it.</p>

      {cmp && (
        <div className="rounded-xl border border-brand/30 bg-brand-soft p-3">
          <p className="text-sm font-semibold">FX copilot: what you actually keep</p>
          <div className="mt-2 space-y-2">
            {cmp.options.map((o) => (
              <label key={o.billCurrency} className={`flex cursor-pointer items-start gap-2 rounded-lg bg-white p-2 text-sm ${bill === o.billCurrency ? "ring-2 ring-brand" : ""}`}>
                <input type="radio" name="bill" className="mt-1" checked={bill === o.billCurrency} onChange={() => setBill(o.billCurrency)} />
                <span className="flex-1">
                  <span className="flex justify-between font-semibold"><span>Bill in {o.billCurrency}{o.billCurrency === cmp.recommended ? " · recommended" : ""}</span><span className="tabular">₹{o.netHome.toLocaleString("en-IN")}</span></span>
                  <span className="block text-xs text-ink/60">Invoice {o.billCurrency} {o.invoiceAmount} · PayPal fee {o.paypalFee} · conversion ₹{o.conversionCost.toLocaleString("en-IN")}{o.clientExtraPercent > 0.5 ? ` · client pays ${o.clientExtraPercent}% more` : ""}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/70">{cmp.reason}</p>
          <p className="mt-1 text-[11px] text-ink/45">Estimates from PayPal's published fees; {cmp.live ? "live" : "offline"} mid-market rates.</p>
        </div>
      )}
      <button className={buttonClass("primary", true)} disabled={busy || !chosen}>{busy ? "Sending…" : "Send invoice via PayPal"}</button>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    </form>
  );
}
