"use client";
import { useState } from "react";
import Link from "next/link";
import { ImagePlus, X } from "lucide-react";
import { api, buttonClass, inputClass } from "@/components/client";
import { Card, Badge, RiskMeter, PageHeader } from "@/components/ui";
import type { ScamResult } from "@/lib/scam";

const SAMPLES = [
  "Hi, is the camera still available? I'll pay now, just send me your PayPal and accept it as friends and family so we both avoid fees. My courier will pick it up today.",
  "This is the Income Tax Department. You have unpaid dues. Pay immediately using Google Play gift cards or a warrant will be issued for your arrest.",
  "Can you send a PayPal invoice? I'll pay with goods and services and collect it Saturday at Lulu Mall.",
];

async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function ScanPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [res, setRes] = useState<ScamResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await api<ScamResult>("/api/scam", { text, image })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const tone = res?.level === "high" ? "danger" : res?.level === "medium" ? "warn" : "safe";

  return (
    <div>
      <PageHeader title="Scam check" subtitle="Paste the chat or listing before you pay. Nothing is sent to the other person." back="/protect" />
      <label htmlFor="msg" className="mb-1 block text-sm font-medium">Message or listing</label>
      <textarea id="msg" rows={6} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste what they sent you…" />
      <div className="mt-2 flex flex-wrap gap-2">
        {SAMPLES.map((s, i) => (
          <button key={i} className="rounded-full border border-ink/15 bg-white px-3 py-1 text-xs" onClick={() => setText(s)}>Try example {i + 1}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <label className={buttonClass("secondary")}>
          <ImagePlus size={18} aria-hidden /> Screenshot
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrink(f)); }} />
        </label>
        {image && (
          <span className="flex items-center gap-1 text-xs text-ink/60">
            Screenshot added <button aria-label="Remove screenshot" onClick={() => setImage(null)}><X size={14} /></button>
          </span>
        )}
      </div>
      <button className={`${buttonClass("primary", true)} mt-4`} disabled={busy || (!text.trim() && !image)} onClick={run}>{busy ? "Checking…" : "Check for scams"}</button>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}

      {res && (
        <div className="mt-5 space-y-3" aria-live="polite">
          <Card tone={tone}>
            <RiskMeter score={res.score} label={res.level === "high" ? "Likely a scam" : res.level === "medium" ? "Be careful" : "Looks okay"} />
            <p className="mt-3 text-sm">{res.advice}</p>
            {res.explanation && <p className="mt-2 text-sm text-ink/70">{res.explanation}</p>}
            <p className="mt-2 text-[11px] text-ink/45">{res.source === "rules+ai" ? "Rules + AI review" : "Rule engine (add an LLM key for AI review and screenshots)"}</p>
          </Card>
          {res.signals.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-2"><Badge tone={s.weight >= 0.4 ? "danger" : "warn"}>Red flag</Badge><span className="font-semibold">{s.label}</span></div>
              {s.excerpt && <p className="mt-1 rounded-lg bg-ink/5 px-2 py-1 text-xs italic">“{s.excerpt}”</p>}
              <p className="mt-1 text-sm text-ink/70">{s.why}</p>
            </Card>
          ))}
          {res.recommendVault && (
            <Card tone="brand">
              <p className="font-semibold">Pay safely with Vault instead</p>
              <p className="text-sm text-ink/70">Your money is held and only released after the item arrives. No Friends & Family, no risk.</p>
              <Link href="/vault" className={`${buttonClass("primary")} mt-3`}>Use Vault</Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
