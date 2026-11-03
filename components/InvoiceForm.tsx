"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { api, buttonClass, inputClass, labelClass, Spinner } from "./client";

interface Option { billCurrency: string; invoiceAmount: number; clientPays: number; clientExtraPercent: number; paypalFee: number; conversionCost: number; netHome: number; notes: string[] }
interface Compare { options: Option[]; recommended: string; reason: string; live: boolean }

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** New invoice: the form and the FX copilot as two cards, side by side on desktop. */
export function InvoiceForm({ defaultClientEmail = "dana@northwind.demo" }: { defaultClientEmail?: string }) {
  const router = useRouter();
  const [f, setF] = useState({
    clientName: "Dana Brooks (Northwind Studio)", clientEmail: defaultClientEmail, relationship: "regular",
    item: "Brand identity, final files", price: "800", clientCurrency: "USD", dueInDays: "14", lateFeePercent: "2", offerPayLater: true,
  });
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [bill, setBill] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!Number(f.price)) { setCmp(null); return; }
      try {
        const r = await api<Compare>("/api/fx", { price: Number(f.price), clientCurrency: f.clientCurrency, homeCurrency: "INR" });
        setCmp(r);
        setBill(r.recommended);
      } catch { setCmp(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [f.price, f.clientCurrency]);

  const chosen = cmp?.options.find((o) => o.billCurrency === bill);
  const best = cmp ? Math.max(...cmp.options.map((o) => o.netHome)) : 0;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="grid gap-4 lg:grid-cols-2 lg:items-start" onSubmit={async (e) => {
      e.preventDefault();
      if (!chosen) return;
      setBusy(true); setErr(null); setSent(false);
      try {
        await api("/api/invoices", {
          action: "create", clientName: f.clientName, clientEmail: f.clientEmail, relationship: f.relationship,
          items: [{ name: f.item, amount: chosen.invoiceAmount }], currency: chosen.billCurrency,
          dueInDays: Number(f.dueInDays), lateFeePercent: Number(f.lateFeePercent), offerPayLater: f.offerPayLater,
        });
        setSent(true);
        router.refresh();
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }}>
      <section className="space-y-4 rounded-card border border-border bg-card p-5 sm:p-6">
        <h3 className="text-[18px] font-extrabold">New invoice</h3>
        <label className={labelClass}>Client<input required className={`${inputClass} mt-1.5`} value={f.clientName} onChange={set("clientName")} /></label>
        <label className={labelClass}>Client email<input required type="email" className={`${inputClass} mt-1.5`} value={f.clientEmail} onChange={set("clientEmail")} /></label>
        <label className={labelClass}>Work<input required className={`${inputClass} mt-1.5`} value={f.item} onChange={set("item")} /></label>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <label className={labelClass}>Agreed price<input required inputMode="decimal" className={`${inputClass} tabular mt-1.5`} value={f.price} onChange={set("price")} /></label>
          <label className={labelClass}>Currency
            <select className={`${inputClass} mt-1.5`} value={f.clientCurrency} onChange={set("clientCurrency")}>
              {["USD", "GBP", "EUR", "AUD", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className={`${labelClass} col-span-3 sm:col-span-1`}>Client
            <select className={`${inputClass} mt-1.5`} value={f.relationship} onChange={set("relationship")}>
              <option value="new">New</option><option value="regular">Regular</option><option value="key_account">Key account</option>
            </select>
          </label>
          <label className={`${labelClass} col-span-3 sm:col-span-1`}>Due in<span className="relative mt-1.5 block"><input inputMode="numeric" className={`${inputClass} tabular pr-12`} value={f.dueInDays} onChange={set("dueInDays")} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted">days</span></span></label>
          <label className={`${labelClass} col-span-3 sm:col-span-1`}>Late fee<span className="relative mt-1.5 block"><input inputMode="decimal" aria-describedby="fee-help" className={`${inputClass} tabular pr-8`} value={f.lateFeePercent} onChange={set("lateFeePercent")} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted">%</span></span></label>
        </div>
        <p id="fee-help" className="text-[13px] text-muted">The late fee goes into the invoice terms now, so it&apos;s agreed before any reminder mentions it.</p>
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={f.offerPayLater} onChange={(e) => setF({ ...f, offerPayLater: e.target.checked })} />
          Offer Pay Later to the client
        </label>
      </section>

      <section id="fx" className="scroll-mt-28 rounded-card border border-border bg-card p-5 sm:p-6">
        <h3 className="text-[18px] font-extrabold">FX copilot</h3>
        <p className="mt-1 text-[14px] text-muted">What you&apos;ll actually keep in rupees, for each currency you could bill in.</p>
        {cmp ? (
          <fieldset className="mt-4">
            <legend className="sr-only">Which currency to bill in</legend>
            <div className="space-y-2">
              {cmp.options.map((o) => {
                const on = bill === o.billCurrency;
                return (
                  <label key={o.billCurrency} className={`press flex cursor-pointer items-start gap-3 rounded-panel border-2 bg-raised p-3 ${on ? "border-accent" : "border-transparent hover:border-border"}`}>
                    <input type="radio" name="bill" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={on} onChange={() => setBill(o.billCurrency)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-bold">Bill in {o.billCurrency}{o.billCurrency === cmp.recommended && <span className="ml-2 text-[13px] font-bold text-accent">Recommended</span>}</span>
                        <span className="tabular text-[18px] font-extrabold">{inr(o.netHome)}</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        Invoice {o.billCurrency} {o.invoiceAmount.toLocaleString()} · PayPal fee {o.paypalFee} · conversion {inr(o.conversionCost)}
                        {o.netHome < best && <> · <span className="text-fg">{inr(best - o.netHome)} less</span></>}
                        {o.clientExtraPercent > 0.5 ? ` · client pays ${o.clientExtraPercent}% more` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[14px]">{cmp.reason}</p>
            <p className="mt-1 text-[12px] text-muted">Estimated from PayPal&apos;s published fees and {cmp.live ? "live" : "offline"} mid-market rates. PayPal has no fee-quote API.</p>
          </fieldset>
        ) : <p className="mt-4 text-[14px] text-muted">Enter a price to compare currencies.</p>}
        <button className={`${buttonClass("primary", true)} mt-5`} disabled={busy || !chosen}>{busy ? <><Spinner /> Sending…</> : chosen ? `Send invoice for ${chosen.billCurrency} ${chosen.invoiceAmount.toLocaleString()}` : "Send invoice"}</button>
        {sent && <p role="status" className="arrive mt-2 flex items-center gap-2 text-[14px] font-semibold text-success"><CircleCheck size={17} aria-hidden /> Sent. The agent will send a heads-up 2 days before it&apos;s due.</p>}
        {err && <p role="alert" className="mt-2 text-[14px] text-danger">{err}</p>}
      </section>
    </form>
  );
}
