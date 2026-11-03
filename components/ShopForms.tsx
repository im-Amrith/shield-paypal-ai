"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass, labelClass, Spinner } from "./client";

const EXAMPLES = [
  "Monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40",
  "Toilet paper, paper towels and trash bags under $35",
  "A 55 inch TV",
];

/** The need box: the agent searches, picks and prices a cart, then the policy engine decides. */
export function NeedForm({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [need, setNeed] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        await api("/api/shop", { action: "plan", need });
        router.refresh();
      } catch (e) { setErr((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <label className={labelClass}>What do you need?
        <textarea required rows={3} maxLength={500} className={`${inputClass} mt-1.5 min-h-[96px] resize-y py-3`} value={need} onChange={(e) => setNeed(e.target.value)} disabled={disabled} />
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" disabled={disabled} onClick={() => setNeed(x)}
            className="press rounded-full border border-border px-3 py-1.5 text-left text-[13px] text-muted hover:bg-raised hover:text-fg">{x}</button>
        ))}
      </div>
      <button className={buttonClass("primary", true)} disabled={busy || disabled}>{busy ? <><Spinner /> Searching and comparing…</> : "Build my cart"}</button>
      {disabled && <p className="text-[14px] text-muted">The agent is revoked. Switch it back on to shop.</p>}
      {err && <p role="alert" className="text-[14px] text-danger">{err}</p>}
    </form>
  );
}

/** The big kill switch. Revoking blocks every purchase in decideSpend, including carts mid-checkout. */
export function RevokeSwitch({ revoked }: { revoked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const on = !revoked;
  return (
    <div>
      <button type="button" role="switch" aria-checked={on} disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          try { await api("/api/shop", { action: "revoke", revoked: on }); router.refresh(); }
          catch (e) { setErr((e as Error).message); }
          finally { setBusy(false); }
        }}
        className={`press flex w-full items-center justify-between gap-4 rounded-card border p-4 text-left transition-colors ${on ? "border-border bg-card hover:bg-raised" : "border-danger bg-danger-tint"}`}>
        <span>
          <span className="block text-[17px] font-extrabold">{on ? "Agent can shop" : "Agent revoked"}</span>
          <span className="block text-[14px] text-muted">{on ? "Tap to revoke. Every purchase stops at once." : "Nothing can be bought, even carts already at checkout. Tap to switch back on."}</span>
        </span>
        <span aria-hidden className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-track"}`}>
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-page shadow transition-[left] ${on ? "left-7" : "left-1"}`} />
        </span>
      </button>
      {err && <p role="alert" className="mt-1.5 text-[14px] text-danger">{err}</p>}
    </div>
  );
}

/** Editable caps. The server enforces auto-approve ≤ per-order ≤ monthly. */
export function CapsForm({ perOrderCap, monthlyCap, autoApproveBelow }: { perOrderCap: number; monthlyCap: number; autoApproveBelow: number }) {
  const router = useRouter();
  const [v, setV] = useState({ perOrderCap: String(perOrderCap), monthlyCap: String(monthlyCap), autoApproveBelow: String(autoApproveBelow) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (k: keyof typeof v, label: string, hint: string) => (
    <label className={labelClass}>{label}
      <span className="relative mt-1.5 block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input inputMode="decimal" required className={`${inputClass} tabular pl-7`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      </span>
      <span className="mt-1 block text-[13px] font-normal text-muted">{hint}</span>
    </label>
  );
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      try {
        await api("/api/shop", { action: "caps", perOrderCap: Number(v.perOrderCap), monthlyCap: Number(v.monthlyCap), autoApproveBelow: Number(v.autoApproveBelow) });
        setMsg({ ok: true, text: "Caps saved" });
        router.refresh();
      } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
      finally { setBusy(false); }
    }}>
      {field("autoApproveBelow", "Auto-approve up to", "Carts at or below this are bought without asking")}
      {field("perOrderCap", "Per-order cap", "Above this, a cart is blocked")}
      {field("monthlyCap", "Monthly cap", "Total the agent may spend each month")}
      <button className={buttonClass("secondary", true)} disabled={busy}>{busy ? <><Spinner /> Saving…</> : "Save caps"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[14px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
