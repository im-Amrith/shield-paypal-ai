import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "", tone }: { children: ReactNode; className?: string; tone?: "safe" | "warn" | "danger" | "brand" }) {
  const tones = {
    safe: "border-safe/30 bg-safe-soft",
    warn: "border-warn/30 bg-warn-soft",
    danger: "border-danger/30 bg-danger-soft",
    brand: "border-brand/30 bg-brand-soft",
  };
  return <div className={`rounded-2xl border p-4 ${tone ? tones[tone] : "border-ink/10 bg-white"} ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "safe" | "warn" | "danger" | "brand" }) {
  const tones = {
    neutral: "bg-ink/5 text-ink/70",
    safe: "bg-safe-soft text-safe",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    brand: "bg-brand-soft text-brand",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  return (
    <div className="mb-4">
      {back && <Link href={back} className="mb-2 inline-block text-sm text-brand">← Back</Link>}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-ink/15 p-4 text-center text-sm text-ink/50">{children}</p>;
}

export function Money({ amount, currency }: { amount: number; currency: string }) {
  return <span className="tabular">{currency} {amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

export function When({ iso }: { iso: string }) {
  return <time className="tabular" dateTime={iso}>{new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>;
}

export function Timeline({ items }: { items: { at: string; label: string; detail?: string }[] }) {
  return (
    <ol className="relative ml-2 border-l border-ink/15">
      {items.map((it, i) => (
        <li key={i} className="mb-3 ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand" />
          <p className="text-sm font-medium">{it.label}</p>
          {it.detail && <p className="text-xs text-ink/60">{it.detail}</p>}
          <p className="text-xs text-ink/40"><When iso={it.at} /></p>
        </li>
      ))}
    </ol>
  );
}

export function RiskMeter({ score, label }: { score: number; label?: string }) {
  const tone = score >= 60 ? "bg-danger" : score >= 30 ? "bg-warn" : "bg-safe";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label ?? "Risk"}</span>
        <span className="tabular font-semibold">{score}/100</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-ink/10" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
    </div>
  );
}
