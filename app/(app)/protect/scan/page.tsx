"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, X, Lock, Flag } from "lucide-react";
import { api, buttonClass, inputClass, Spinner } from "@/components/client";
import { Card, PageHeader, Note, HeroBand, HeroGauge, Hi, AlertBanner, AlertRows } from "@/components/ui";
import type { ScamResult } from "@/lib/scam";

const SAMPLES = [
  { label: "Camera buyer", text: "Hi, is the camera still available? I'll pay now, just send me your PayPal and accept it as friends and family so we both avoid fees. My courier will pick it up today." },
  { label: "“Tax department”", text: "This is the Income Tax Department. You have unpaid dues. Pay immediately using Google Play gift cards or a warrant will be issued for your arrest." },
  { label: "Local pickup", text: "Can you send a PayPal invoice? I'll pay with goods and services and collect it Saturday at Lulu Mall." },
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

const VERDICT = { high: "Likely a scam", medium: "Be careful", low: "Looks okay" } as const;

export default function ScanPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [res, setRes] = useState<ScamResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const run = async (t = text, img = image) => {
    setBusy(true); setErr(null); setRes(null);
    try { setRes(await api<ScamResult>("/api/scam", { text: t, image: img })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  // Arrive from the Protect page's quick box with ?q=… and check straight away.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) { setText(q); run(q, null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verdict = res ? VERDICT[res.level as keyof typeof VERDICT] ?? VERDICT.low : "";

  const input = (
    <Card className="p-5 sm:p-6">
      <label htmlFor="msg" className="block font-bold">Message, listing or email</label>
      <textarea id="msg" rows={res ? 4 : 7} className={`${inputClass} mt-2 resize-y leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste what they sent you…" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">Try:</span>
        {SAMPLES.map((s) => (
          <button key={s.label} className="press h-8 rounded-full border border-border bg-raised px-3 text-[13px] font-semibold hover:border-accent/60" onClick={() => setText(s.text)}>{s.label}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className={`${buttonClass("secondary")} cursor-pointer`}>
          <ImagePlus size={18} aria-hidden /> Add screenshot
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrink(f)); }} />
        </label>
        {image && (
          <span className="flex items-center gap-2 rounded-control bg-raised py-1 pl-1 pr-2 text-[13px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Screenshot to check" className="h-9 w-9 rounded-[6px] object-cover" />
            Screenshot added
            <button className="press rounded p-1 hover:bg-border" aria-label="Remove screenshot" onClick={() => setImage(null)}><X size={14} /></button>
          </span>
        )}
      </div>
      <button className={`${buttonClass("primary", true)} mt-5`} disabled={busy || (!text.trim() && !image)} onClick={() => run()}>
        {busy ? <><Spinner /> Checking…</> : "Check for scams"}
      </button>
      {err && <p role="alert" className="mt-2 text-[14px] text-danger">{err}</p>}
    </Card>
  );

  return (
    <div>
      <PageHeader title="Scam check" subtitle="Paste what they sent before you pay. Nothing is sent to the other person." />

      <div aria-live="polite">
        {res && (
          <div className="arrive">
            <HeroBand
              visual={<HeroGauge value={res.score} label="Scam score" valueText={`${res.score} out of 100: ${verdict}`} />}
              label="Scam score"
              title={<Hi tone={res.level === "low" ? "success" : "accent"}>{verdict}</Hi>}>
              {res.advice}
              {res.explanation && <span className="mt-1 block text-[15px]">{res.explanation}</span>}
            </HeroBand>
          </div>
        )}
      </div>

      <div className={res ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start" : "max-w-3xl"}>
        <div className={res ? "order-2" : ""}>{input}</div>
        {busy && <Card className="mt-4 flex items-center gap-3 p-6 text-muted"><Spinner /> Reading the message for red flags…</Card>}
        {res && (
          <div className="order-1 min-w-0 space-y-4">
            {res.recommendVault && (
              <AlertBanner className="!mb-0" Icon={Lock} title="Pay through Vault instead"
                detail="The money is held by PayPal and released only after the item arrives. If they refuse Vault, that tells you something."
                actions={<Link href="/vault" className={buttonClass("primary")}>Use Vault</Link>} />
            )}
            <AlertRows title={`${res.signals.length} red flag${res.signals.length === 1 ? "" : "s"}`} empty="No red flags found in this message."
              items={res.signals.map((s) => ({
                key: s.id, Icon: Flag, tone: s.weight >= 0.4 ? "danger" as const : "accent" as const,
                text: s.label,
                sub: <>{s.excerpt && <q className="mb-1 block rounded-[8px] bg-raised px-2.5 py-1.5 text-fg">{s.excerpt}</q>}{s.why}</>,
              }))} />
            <Note>{res.source === "rules+ai" ? "Checked by the rule engine and an AI review." : "Checked by the rule engine. Add an LLM key for AI review and screenshot reading."}</Note>
          </div>
        )}
      </div>

      {!res && !busy && (
        <div className="mt-6 max-w-3xl rounded-card border border-dashed border-border px-5 py-5 text-[15px] text-muted">
          <p className="font-bold text-fg">What Shield looks for</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Requests to pay as Friends &amp; Family, which has no purchase protection</li>
            <li>Gift cards, crypto or wire transfers as payment</li>
            <li>Pressure: arrest, penalties, “today only”, keep it secret</li>
            <li>Couriers or “agents” collecting for someone, OTP and password requests</li>
          </ul>
        </div>
      )}
    </div>
  );
}
