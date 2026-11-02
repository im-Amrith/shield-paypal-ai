import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Check, AlertTriangle, type LucideIcon } from "lucide-react";

/* ---------- Tones ---------- */

export type Tone = "neutral" | "success" | "danger" | "accent";
const TONES: Record<Tone, { bg: string; ink: string; dot: string; edge: string }> = {
  neutral: { bg: "bg-raised", ink: "text-muted", dot: "bg-muted", edge: "border-border" },
  success: { bg: "bg-success-tint", ink: "text-success", dot: "bg-success", edge: "border-success" },
  danger: { bg: "bg-danger-tint", ink: "text-danger", dot: "bg-danger", edge: "border-danger" },
  accent: { bg: "bg-accent-tint", ink: "text-accent", dot: "bg-accent", edge: "border-accent" },
};

/** The key word of a hero title, in the accent colour. */
export function Hi({ children, tone = "accent" }: { children: ReactNode; tone?: Tone }) {
  return <span className={TONES[tone].ink}>{children}</span>;
}

/* ---------- Surfaces ---------- */

export function Card({ children, className = "", as: Tag = "div", id, ...rest }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "nav"; id?: string; "aria-label"?: string }) {
  return <Tag id={id} aria-label={rest["aria-label"]} className={`rounded-card border border-border bg-card ${className}`}>{children}</Tag>;
}

/** A tinted status panel. */
export function Callout({ tone = "neutral", title, children, action, className = "" }: {
  tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`rounded-card border-l-4 px-5 py-4 ${t.bg} ${t.edge} ${className}`}>
      {title && <p className="font-bold text-fg">{title}</p>}
      {children && <div className={`${title ? "mt-1" : ""} text-[15px] leading-relaxed text-muted`}>{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return <span className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ${t.bg} ${t.ink}`}>{children}</span>;
}
export const Badge = Pill;

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONES[tone].dot}`} />;
}

/* ---------- Headings ---------- */

export function PageHeader({ title, subtitle, back, backLabel = "Back", action }: { title: ReactNode; subtitle?: ReactNode; back?: string; backLabel?: string; action?: ReactNode }) {
  return (
    <header className="mb-2 lg:mb-6">
      {back && (
        <Link href={back} className="press -ml-1 mb-2 inline-flex items-center gap-0.5 rounded-control py-1 pr-2 text-[14px] font-semibold text-muted hover:text-fg">
          <ChevronLeft size={18} aria-hidden /> {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[23px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[14px] text-muted lg:mt-1 lg:text-[17px]">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Section({ title, children, action, className = "", id }: { title: ReactNode; children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`mb-8 ${className}`}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border px-5 py-6 text-[15px] text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Note({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] leading-relaxed text-muted ${className}`}>{children}</p>;
}

/* ---------- Hero ---------- */

/**
 * Ring gauge: thick accent arc on a dark track, big number, small suffix, soft glow.
 * `value` drives the arc (0-100); `display` is what's printed in the middle.
 */
export function HeroGauge({ value, display, suffix = "/100", label, valueText, compact }: {
  value: number; display?: ReactNode; suffix?: string; label: string; valueText?: string; compact?: boolean;
}) {
  // Drawn in a 200-unit box and scaled by CSS: 150px on phones, 200px from 1024px, 88px compact.
  const s = 200;
  const stroke = 18;
  const r = (s - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const box = compact ? "h-[88px] w-[88px]" : "hero-glow h-[150px] w-[150px] lg:h-[200px] lg:w-[200px]";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-valuetext={valueText}
      className={`relative shrink-0 [container-type:inline-size] ${box}`}>
      <svg viewBox={`0 0 ${s} ${s}`} aria-hidden className="h-full w-full -rotate-90">
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="gauge-arc" style={{ ["--gauge-len" as string]: `${c}` }} />
      </svg>
      <span aria-hidden className="gauge-num absolute inset-0 flex items-center justify-center">
        <span className="tabular inline-flex items-baseline font-extrabold leading-none tracking-[-0.03em] [font-size:30cqw]">
          {display ?? Math.round(v)}
          {suffix && <span className="ml-[1cqw] font-bold tracking-normal text-fg/90 [font-size:max(11px,9.5cqw)]">{suffix}</span>}
        </span>
      </span>
    </div>
  );
}

/** A big figure used as a hero visual in place of the gauge. */
export function HeroFigure({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="hero-glow flex min-w-[200px] shrink-0 flex-col items-center justify-center py-2 text-center lg:py-4">
      <p className="tabular text-[40px] font-extrabold leading-none tracking-[-0.03em] lg:text-[56px]">{children}</p>
      {sub && <p className="mt-1.5 text-[13px] font-semibold text-muted lg:mt-2 lg:text-[14px]">{sub}</p>}
    </div>
  );
}

/** A large icon used as a hero visual. */
export function HeroIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <div className="hero-glow flex h-[130px] w-[130px] shrink-0 items-center justify-center lg:h-[180px] lg:w-[180px]">
      <span className="flex h-full w-full items-center justify-center rounded-full border-[10px] border-accent text-accent">
        <Icon size={64} strokeWidth={2} aria-hidden />
      </span>
    </div>
  );
}

/**
 * The page's hero band: visual on the left, label + big title + explanation on the right.
 * Stacks and centres below 1024px, as in the phone design.
 */
export function HeroBand({ visual, label, title, children, aside, className = "" }: {
  visual: ReactNode; label?: ReactNode; title: ReactNode; children?: ReactNode; aside?: ReactNode; className?: string;
}) {
  return (
    <section className={`hero-wash -mx-4 mb-4 flex flex-col items-center gap-3 px-4 py-2 text-center sm:-mx-6 sm:px-6 lg:mx-0 lg:mb-6 lg:flex-row lg:items-center lg:gap-10 lg:rounded-card lg:px-6 lg:py-6 lg:text-left ${className}`}>
      {visual}
      <span aria-hidden className="hidden h-40 w-px shrink-0 bg-border lg:block" />
      <div className="min-w-0 flex-1">
        {label && <p className="text-[14px] font-bold text-fg lg:text-[18px]">{label}</p>}
        <h2 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] lg:mt-0.5 lg:text-[38px]">{title}</h2>
        {children && <div className="mx-auto mt-1 max-w-xl text-[14px] leading-snug text-muted lg:mx-0 lg:mt-2 lg:text-[18px]">{children}</div>}
      </div>
      {aside}
    </section>
  );
}

/** Urgent banner: accent tint, 4px accent left border, warning icon, actions right on desktop. */
export function AlertBanner({ title, detail, actions, tone = "accent", Icon = AlertTriangle, className = "" }: {
  title: ReactNode; detail?: ReactNode; actions?: ReactNode; tone?: "accent" | "danger" | "success"; Icon?: LucideIcon; className?: string;
}) {
  const t = TONES[tone];
  return (
    <section aria-label={typeof title === "string" ? title : "Needs your attention"} className={`mb-5 flex flex-col gap-3 rounded-card border border-l-4 ${t.edge} ${t.bg} p-3.5 sm:px-5 lg:p-4 lg:flex-row lg:items-center lg:gap-6 ${className}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon size={28} strokeWidth={2} aria-hidden className={`mt-0.5 h-6 w-6 shrink-0 lg:h-7 lg:w-7 ${t.ink}`} />
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-snug lg:text-[19px]">{title}</p>
          {detail && <div className="mt-0.5 text-[13px] text-muted lg:mt-1 lg:text-[16px]">{detail}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 pl-9 lg:shrink-0 lg:pl-0">{actions}</div>}
    </section>
  );
}

/** Feature tile: accent icon, bold title, 2-line muted description. Compact 3-up on phones. */
export function FeatureTile({ href, Icon, title, desc }: { href: string; Icon: LucideIcon; title: string; desc: ReactNode }) {
  return (
    <Link href={href} className="press flex min-w-0 flex-col items-center gap-1.5 rounded-card border border-border bg-card px-2 py-3 text-center hover:border-accent/60 hover:bg-raised sm:items-start sm:px-4 sm:py-4 sm:text-left lg:gap-2 lg:p-5">
      <Icon size={30} strokeWidth={1.9} aria-hidden className="h-6 w-6 text-accent lg:h-9 lg:w-9" />
      <span className="text-[14px] font-extrabold leading-tight sm:text-[16px] lg:text-[20px]">{title}</span>
      <span className="line-clamp-3 text-[11.5px] leading-snug text-muted sm:text-[13px] lg:line-clamp-4 lg:text-[15px]">{desc}</span>
    </Link>
  );
}

export function FeatureRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 ${className}`}>{children}</div>;
}

export interface AlertRowItem { key: string; Icon: LucideIcon; tone?: Tone; text: ReactNode; sub?: ReactNode; time?: string; href?: string; unread?: boolean }

/** Compact list of status rows inside a titled card. */
export function AlertRows({ title = "Recent Alerts", items, empty = "Nothing to show yet.", footer, className = "" }: {
  title?: ReactNode; items: AlertRowItem[]; empty?: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-card border border-border bg-card ${className}`}>
      {title && <h2 className="px-4 pb-1 pt-4 text-[17px] font-extrabold sm:px-5 lg:text-[20px]">{title}</h2>}
      {items.length ? (
        <ul className="divide-y divide-border px-4 pb-2 sm:px-5">
          {items.map((it) => {
            const body = (
              <>
                <it.Icon size={20} strokeWidth={2} aria-hidden className={`mt-0.5 shrink-0 ${TONES[it.tone ?? "accent"].ink}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] leading-snug lg:text-[15px] ${it.unread ? "font-bold" : "font-medium"}`}>{it.text}</span>
                  {it.sub && <span className="mt-0.5 block text-[13px] text-muted">{it.sub}</span>}
                </span>
                {it.time && <span className="tabular shrink-0 text-[13px] font-semibold text-muted lg:text-[14px]">{it.time}</span>}
              </>
            );
            return (
              <li key={it.key}>
                {it.href
                  ? <Link href={it.href} className="press -mx-2 flex items-start gap-3 rounded-control px-2 py-3 hover:bg-raised">{body}</Link>
                  : <div className="flex items-start gap-3 py-3">{body}</div>}
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 pb-4 pt-2 text-[14px] text-muted sm:px-5">{empty}</p>}
      {footer}
    </section>
  );
}

/** "2h", "5h", "1d" — the compact time used in alert rows. */
export function shortAgo(iso: string, at: Date = new Date()) {
  const m = Math.max(0, Math.round((at.getTime() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------- Money and time ---------- */

const SYMBOL: Record<string, string> = { USD: "$", INR: "₹", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$", SGD: "S$" };

export function fmtMoney(amount: number, currency: string, decimals = 2) {
  const sym = SYMBOL[currency] ?? `${currency} `;
  const sign = amount < 0 ? "−" : "";
  const n = Math.abs(amount).toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${sign}${sym}${n}`;
}

export function Money({ amount, currency, size = "body", sign, whole }: { amount: number; currency: string; size?: "body" | "lg" | "xl" | "hero"; sign?: "in" | "out"; whole?: boolean }) {
  const full = fmtMoney(amount, currency, whole ? 0 : 2);
  const [major, minor] = whole ? [full, ""] : [full.slice(0, -3), full.slice(-3)];
  const sizes = { body: "", lg: "text-[20px] font-extrabold", xl: "text-[28px] font-extrabold tracking-[-0.02em]", hero: "text-[36px] font-extrabold tracking-[-0.03em]" };
  return (
    <span className={`tabular whitespace-nowrap ${sizes[size]} ${sign === "in" ? "text-success" : ""}`}>
      {sign === "in" && "+"}{major}
      {minor && <span className={size === "body" ? "" : "text-[0.6em] font-bold text-muted"}>{minor}</span>}
    </span>
  );
}

export function When({ iso, date }: { iso: string; date?: boolean }) {
  const d = new Date(iso);
  const s = date
    ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return <time className="tabular" dateTime={iso}>{s}</time>;
}

export function relDays(iso: string, at: Date) {
  const days = Math.round((new Date(iso).getTime() - at.getTime()) / 86400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/* ---------- People and marks ---------- */

const INITIAL: Record<string, string> = { meera: "M", ravi: "R", buyer: "A", client: "D", agent: "P" };

export function Avatar({ id, size = 36, label }: { id: string; size?: number; label?: string }) {
  const initial = INITIAL[id] ?? (label ?? id).slice(0, 1).toUpperCase();
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-raised font-extrabold text-fg">
      {initial}
    </span>
  );
}

export function Mark({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-bold text-muted">
      {name.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "·"}
    </span>
  );
}

/* ---------- Rows ---------- */

export function Row({ href, lead, title, sub, trail, trailSub }: { href?: string; lead?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; trailSub?: ReactNode }) {
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-[14px] text-muted">{sub}</span>}
      </span>
      {(trail || trailSub) && (
        <span className="shrink-0 text-right">
          {trail && <span className="block font-semibold">{trail}</span>}
          {trailSub && <span className="block text-[13px] text-muted">{trailSub}</span>}
        </span>
      )}
      {href && <ChevronRight size={18} className="-mr-1 shrink-0 text-muted" aria-hidden />}
    </>
  );
  const cls = "flex min-h-[64px] items-center gap-3 px-4 py-3 sm:px-5";
  return href ? <li><Link href={href} className={`press ${cls} hover:bg-raised`}>{body}</Link></li> : <li className={cls}>{body}</li>;
}

export function RowList({ children }: { children: ReactNode }) {
  return <Card className="overflow-hidden"><ul className="divide-y divide-border">{children}</ul></Card>;
}

/* ---------- Data marks ---------- */

/** Compact score: a small HeroGauge with its label and caption beside it. */
export function RiskMeter({ score, label, caption }: { score: number; label?: string; caption?: ReactNode }) {
  const level = score >= 60 ? "High" : score >= 30 ? "Elevated" : "Low";
  return (
    <div className="flex items-center gap-4">
      <HeroGauge compact value={score} label={label ?? "Risk"} valueText={`${score} out of 100, ${level.toLowerCase()}`} />
      <div className="min-w-0">
        <p className="font-bold">{label ?? "Risk"}: <Hi tone={score >= 60 ? "accent" : score >= 30 ? "accent" : "success"}>{level}</Hi></p>
        {caption && <div className="mt-0.5 text-[14px] text-muted">{caption}</div>}
      </div>
    </div>
  );
}

/** Horizontal stage track: filled accent up to the current stage. */
export function Track({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}: ${steps[Math.min(current, steps.length - 1)]}`}>
      {steps.map((s, i) => {
        const done = i < current || (i === current && i === steps.length - 1 && !failed);
        const now = i === current && !done;
        return (
          <li key={s} className="min-w-0" aria-current={now ? "step" : undefined}>
            <span className={`block h-1.5 rounded-full ${done ? "bg-accent" : now ? (failed ? "bg-danger" : "bg-accent/45") : "bg-track"}`} />
            <span className={`mt-2 flex items-center gap-1 text-[12px] leading-tight sm:text-[13px] ${done || now ? "font-bold text-fg" : "text-muted"}`}>
              {done && <Check size={13} aria-hidden className="shrink-0 text-accent" />}
              <span className="truncate">{s}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ items }: { items: { at: string; label: string; detail?: string }[] }) {
  return (
    <ol>
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          <span aria-hidden className="relative flex w-3 flex-col items-center">
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === items.length - 1 ? "bg-accent" : "bg-muted/50"}`} />
            {i < items.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{it.label}</span>
              <span className="text-[13px] text-muted"><When iso={it.at} /></span>
            </span>
            {it.detail && <span className="block text-[14px] text-muted">{it.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Stats({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-border sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {items.map((s) => (
        <div key={s.label} className="bg-card px-4 py-3">
          <dt className="text-[13px] text-muted">{s.label}</dt>
          <dd className="mt-0.5 text-[20px] font-extrabold">{s.value}</dd>
          {s.sub && <dd className="text-[13px] text-muted">{s.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function KeyValues({ items }: { items: { k: ReactNode; v: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="divide-y divide-border">
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{it.k}</dt>
          <dd className={`tabular text-right ${it.strong ? "font-extrabold" : "font-semibold"}`}>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
