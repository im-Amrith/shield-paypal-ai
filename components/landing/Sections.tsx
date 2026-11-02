import Link from "next/link";
import { ArrowUpRight, Code2, ShieldCheck } from "lucide-react";
import { HeroGauge } from "@/components/ui";
import { LineArt } from "@/components/LineArt";
import { ALL_TOOLS, toolHref } from "@/components/tools";

/* ------------------------------------------------------------------ shared bits */

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "danger" }) {
  const t = { neutral: "bg-raised text-fg", accent: "bg-accent-tint text-accent", success: "bg-success-tint text-success", danger: "bg-danger-tint text-danger-ink" }[tone];
  return <span className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[12.5px] font-bold ${t}`}>{children}</span>;
}

function Heading({ id, kicker, children, sub }: { id?: string; kicker?: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div data-reveal className="max-w-[760px]">
      {kicker && <p className="mb-4 text-[15px] font-semibold text-accent">{kicker}</p>}
      <h2 id={id} className="section-title font-extrabold">{children}</h2>
      {sub && <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted lg:text-[19px]">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ b) the problem */

const PROBLEM = [
  "Your money frozen, and nobody can tell you why.",
  "Chasing a client for the third time this month.",
  "A call from the ‘tax office’ that sounds real enough.",
];

export function Problem() {
  return (
    <section id="problem" tabIndex={-1} data-problem aria-labelledby="problem-title" className="relative flex min-h-[100svh] items-center outline-none">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-10">
        <h2 id="problem-title" className="sr-only">The problem</h2>
        <div className="space-y-6 lg:space-y-9">
          {PROBLEM.map((line) => (
            <p key={line} data-line className="problem-line font-extrabold">
              <span className="sr-only">{line}</span>
              <span aria-hidden>
                {line.split(" ").map((w, i) => <span key={i} className="wr">{w}{" "}</span>)}
              </span>
            </p>
          ))}
        </div>
        <p className="mt-10 max-w-[52ch] text-[14px] text-muted lg:mt-14 lg:text-[15px]">From what people describe on Reddit, Trustpilot and the PayPal Community.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ c) three pillars (bento) */

function ProtectMock() {
  return (
    <div className="mock-surface flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="w-[88px] shrink-0"><HeroGauge value={82} label="Scam score" compact valueText="82 out of 100" /></div>
        <div className="min-w-0">
          <p className="text-[13px] text-muted">Payment to Income Tax Officer</p>
          <p className="text-[18px] font-extrabold tracking-[-0.02em]">Likely a scam</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2"><Chip tone="danger">Friends &amp; Family request</Chip><Chip tone="danger">Courier agent</Chip></div>
      <div className="flex items-center justify-between rounded-[12px] border border-border bg-page/40 px-3 py-2.5">
        <span className="text-[13px] font-semibold">INR 45,000 · not sent</span>
        <Chip tone="accent">Held for Meera&apos;s OK</Chip>
      </div>
    </div>
  );
}

function GetPaidMock() {
  const rows = [
    { who: "Northwind Studio", what: "Packaging system", amt: "USD 1,200", chip: <Chip tone="accent">Reminder sent</Chip> },
    { who: "Hafen GmbH", what: "Brand refresh", amt: "EUR 1,675", chip: <Chip tone="success">Paid</Chip> },
    { who: "Lumen Labs", what: "App icons", amt: "USD 890", chip: <Chip>Paid half</Chip> },
  ];
  return (
    <div className="mock-surface p-2 sm:p-2.5">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.who} className="flex items-center gap-3 px-2.5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{r.who}</span>
              <span className="block truncate text-[12.5px] text-muted">{r.amt}</span>
            </span>
            {r.chip}
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between px-2.5 pb-1.5 pt-2">
        <span className="text-[12.5px] text-muted">Next nudge: day 14</span>
        <span className="rounded-full border border-border px-3 py-1 text-[12.5px] font-bold"><span className="text-accent">USD 1,200</span> outstanding</span>
      </div>
    </div>
  );
}

function ResolveMock() {
  return (
    <div className="mock-surface flex flex-col gap-3 p-4 sm:p-5">
      <p className="ml-auto max-w-[82%] rounded-[16px] rounded-br-[6px] bg-accent px-3.5 py-2.5 text-[13.5px] font-semibold leading-snug text-on-accent">
        My earbuds never arrived and the seller stopped replying.
      </p>
      <p className="max-w-[86%] rounded-[16px] rounded-bl-[6px] bg-raised px-3.5 py-2.5 text-[13.5px] leading-snug">
        I&apos;ve checked the tracking and opened a claim. A specialist needs to approve the USD 49 refund.
      </p>
      <div className="flex items-center gap-2 pt-1"><Chip tone="success">Refund approved by specialist</Chip><span className="text-[12px] text-muted">4 min</span></div>
    </div>
  );
}

const PILLAR_CARDS = [
  { id: "protect", title: "Protect", href: "/protect", body: "Checks a message before you pay, holds the money until delivery, and lets a relative look at anything unusual.", Mock: ProtectMock },
  { id: "getpaid", title: "Get Paid", href: "/get-paid", body: "Send one invoice. The agent follows up at day 1, 7 and 14, in your tone, so you don't have to.", Mock: GetPaidMock },
  { id: "resolve", title: "Resolve", href: "/support", body: "Support that reads your account and fixes things. Anything risky waits for a person to approve.", Mock: ResolveMock },
];

export function Pillars({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="pillars-title" className="mx-auto max-w-[1200px] px-5 py-28 sm:px-6 lg:px-10 lg:py-40">
      <Heading id="pillars-title" sub="Three jobs, one set of rules underneath. Each card below is the real interface, with the demo's data.">
        What Shield does
      </Heading>
      <ul className="mt-12 grid gap-4 lg:mt-16 lg:grid-cols-3">
        {PILLAR_CARDS.map(({ id, title, href, body, Mock }) => (
          <li key={id} data-reveal className="min-w-0">
            <Link href={toolHref({ href }, signedIn)} data-tilt aria-labelledby={`pc-${id}`} aria-describedby={`pd-${id}`}
              className="lift group flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card p-3">
              <div aria-hidden className="mock-well relative overflow-hidden rounded-[16px] p-3 sm:p-4">
                <div data-tilt-layer>
                  <Mock />
                </div>
              </div>
              <div className="flex flex-1 flex-col px-3 pb-3 pt-6">
                <h3 id={`pc-${id}`} className="flex items-center justify-between text-[24px] font-extrabold tracking-[-0.03em]">
                  {title}
                  <ArrowUpRight size={22} aria-hidden className="text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                </h3>
                <p id={`pd-${id}`} className="mt-2 text-[15.5px] leading-relaxed text-muted">{body}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h3 data-reveal className="mt-20 text-[15px] font-semibold text-muted lg:mt-24">Every tool</h3>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ALL_TOOLS.map((t) => (
          <li key={t.id} data-reveal className="min-w-0">
            <Link href={toolHref(t, signedIn)} className="lift group flex h-full flex-col rounded-[18px] border border-border bg-card p-4 sm:min-h-[200px]">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[15.5px] font-bold tracking-[-0.01em]">{t.title}</span>
                {t.tag && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted">{t.tag}</span>}
              </span>
              <span className="mt-1.5 text-[14px] leading-snug text-muted">{t.desc}</span>
              <LineArt id={t.art} className="mt-auto h-[60px] w-full pt-3 text-fg/40 sm:h-[72px] sm:pt-4 transition-colors group-hover:text-fg/70" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ d) how it works (sticky stack) */

const STORIES = [
  {
    who: "Meera", title: "An invoice that chases itself",
    body: "Meera bills a client in New York. She doesn't send a single follow-up herself.",
    steps: ["Meera sends one invoice", "The agent nudges politely at day 1, 7 and 14", "The client pays half now with Pay Later"],
    mock: <div className="flex flex-wrap gap-2"><Chip>Day 1 · sent</Chip><Chip>Day 7 · friendly</Chip><Chip tone="accent">Day 14 · firm</Chip><Chip tone="success">USD 600 paid</Chip></div>,
  },
  {
    who: "Arjun", title: "A camera, paid through Vault",
    body: "Arjun buys a used camera from a stranger. The seller sees the money is real; Arjun knows it won't move until the parcel does.",
    steps: ["Arjun pays through Vault", "PayPal holds the money", "Tracking says delivered", "The money is released to the seller"],
    mock: <div className="flex flex-wrap gap-2"><Chip>Authorized · USD 320</Chip><Chip>India Post · EZ123456789IN</Chip><Chip tone="success">Released</Chip></div>,
  },
  {
    who: "Ravi", title: "The ‘tax office’ call",
    body: "A caller tells Ravi he'll be arrested unless he pays today. He tries to.",
    steps: ["Ravi tries to pay INR 45,000", "Shield holds it and tells him why", "Meera gets an alert and taps Block"],
    mock: <div className="flex flex-wrap gap-2"><Chip tone="danger">Arrest threat</Chip><Chip tone="danger">New payee</Chip><Chip tone="accent">Held</Chip><Chip>Blocked by Meera</Chip></div>,
  },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[1200px] px-5 pb-16 pt-12 sm:px-6 lg:px-10 lg:pb-24">
      <Heading id="how-title" sub="Three people from the demo, three short stories.">How it works</Heading>
      <ol className="stack mt-12 lg:mt-16">
        {STORIES.map((s, i) => (
          <li key={s.title} data-stack-card className="stack-card" style={{ "--i": i } as React.CSSProperties}>
            <article className="grid gap-8 rounded-[24px] border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-12" aria-labelledby={`story-${i}`}>
              <div>
                <p className="text-[14px] font-semibold text-muted">{s.who}</p>
                <h3 id={`story-${i}`} className="mt-2 text-[clamp(26px,3.4vw,40px)] font-extrabold leading-[1.05] tracking-[-0.04em]">{s.title}</h3>
                <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-muted lg:text-[17px]">{s.body}</p>
                <div aria-hidden className="mt-8 hidden lg:block">{s.mock}</div>
              </div>
              <div className="relative">
                <svg aria-hidden className="absolute left-[11px] top-3 h-[calc(100%-24px)] w-[2px] overflow-visible" preserveAspectRatio="none" viewBox="0 0 2 100">
                  <path d="M1 0V100" pathLength={1} vectorEffect="non-scaling-stroke" className="stroke-border" strokeWidth={2} fill="none" />
                  <path data-step-line d="M1 0V100" pathLength={1} vectorEffect="non-scaling-stroke" className="stroke-accent" strokeWidth={2} fill="none" />
                </svg>
                <ol className="relative space-y-7">
                  {s.steps.map((step, k) => (
                    <li key={step} data-step data-on className="step flex items-start gap-4">
                      <span aria-hidden className="step-dot mt-0.5 h-6 w-6 shrink-0 rounded-full border-2" />
                      <span className="text-[16px] font-semibold leading-snug lg:text-[18px]"><span className="sr-only">Step {k + 1}: </span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div aria-hidden className="mt-8 lg:hidden">{s.mock}</div>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ e) guardrails */

function Node({ x, y, w, h = 52, label, step, strong }: { x: number; y: number; w: number; h?: number; label: string; step: number; strong?: boolean }) {
  return (
    <g className="gnode" data-g={step}>
      <rect x={x} y={y} width={w} height={h} rx={14} className={strong ? "fill-accent-tint stroke-accent" : "fill-card stroke-border"} strokeWidth={1.25} />
      <text x={x + w / 2} y={y + h / 2} dominantBaseline="central" textAnchor="middle" className={`fill-fg text-[15px] ${strong ? "font-extrabold" : "font-semibold"}`}>{label}</text>
    </g>
  );
}
const L = ({ d, step }: { d: string; step: number }) => <path className="gline stroke-accent" data-g={step} d={d} pathLength={1} fill="none" strokeWidth={1.6} />;

const BRANCHES = ["Runs automatically (read-only)", "Asks you first", "Waits for a specialist"];

export function Guardrails() {
  return (
    <section id="guardrails" tabIndex={-1} aria-labelledby="guardrails-title" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 py-28 outline-none sm:px-6 lg:px-10 lg:py-40">
      <Heading id="guardrails-title" kicker="How decisions are made" sub="The AI can suggest anything. Only the policy engine decides what actually happens.">
        One set of guardrails
      </Heading>
      <figure data-guardrails className="mt-14 lg:mt-20">
        {/* Wide layout */}
        <svg aria-hidden viewBox="0 0 1150 380" className="hidden w-full lg:block">
          <Node x={0} y={164} w={220} label="AI proposes an action" step={0} />
          <L d="M220 190H320" step={0} />
          <Node x={320} y={164} w={180} label="Policy engine" step={1} strong />
          <L d="M500 190C560 190 560 60 620 60" step={1} /><L d="M500 190H620" step={1} /><L d="M500 190C560 190 560 320 620 320" step={1} />
          {BRANCHES.map((b, i) => <Node key={b} x={620} y={34 + i * 130} w={290} label={b} step={2} />)}
          <L d="M910 60C960 60 960 190 990 190" step={3} /><L d="M910 190H990" step={3} /><L d="M910 320C960 320 960 190 990 190" step={3} />
          <Node x={990} y={164} w={160} label="PayPal executes" step={4} strong />
        </svg>
        {/* Phone layout */}
        <svg aria-hidden viewBox="0 0 340 640" className="w-full lg:hidden">
          <Node x={40} y={0} w={260} label="AI proposes an action" step={0} />
          <L d="M170 52V100" step={0} />
          <Node x={80} y={100} w={180} label="Policy engine" step={1} strong />
          <L d="M170 152C170 190 20 180 20 232V490C20 530 150 520 170 556" step={1} />
          <L d="M20 232C20 250 30 254 46 254" step={1} /><L d="M20 330C20 348 30 352 46 352" step={1} /><L d="M20 428C20 446 30 450 46 450" step={1} />
          {BRANCHES.map((b, i) => <Node key={b} x={46} y={228 + i * 98} w={294} label={b} step={2} />)}
          <Node x={80} y={556} w={180} label="PayPal executes" step={4} strong />
        </svg>
        <figcaption>
          <ol className="sr-only">
            <li>The AI proposes an action.</li>
            <li>The policy engine checks it.</li>
            <li>It then runs automatically if it is read-only, asks you first, or waits for a specialist.</li>
            <li>Only then does PayPal execute it.</li>
          </ol>
          <p data-reveal className="mx-auto mt-12 max-w-[62ch] text-center text-[17px] leading-relaxed lg:text-[20px]">
            Every action that moves money goes through the same rules, whether it&apos;s Guardian, Vault, collections or support.
          </p>
        </figcaption>
      </figure>
    </section>
  );
}

/* ------------------------------------------------------------------ f) built on PayPal */

const PAYPAL = ["Orders API", "Authorize & Capture", "Refunds", "Invoicing v2", "Disputes", "Webhooks", "JavaScript SDK", "Pay Later"];
const AI = ["Scam detection", "Multilingual voice", "Case summaries", "Hold explainer", "Collections tone", "Policy engine"];

function Marquee({ items: list, reverse, accent }: { items: string[]; reverse?: boolean; accent?: boolean }) {
  // Each half of the track must be wider than the screen, so short lists repeat.
  const items = list.length >= 8 ? list : [...list, ...list];
  const chips = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="marquee-group flex shrink-0 gap-3 pr-3">
      {items.map((t, i) => (
        <li key={t + i} aria-hidden={i >= list.length || undefined} className={`whitespace-nowrap rounded-full border px-5 py-2.5 text-[15px] font-semibold lg:text-[17px] ${accent ? "border-accent/35 text-fg" : "border-border text-fg/90"}`}>{t}</li>
      ))}
    </ul>
  );
  return (
    <div className={`marquee ${reverse ? "marquee-rev" : ""}`}>
      <div className="marquee-track flex w-max">{chips()}{chips(true)}</div>
    </div>
  );
}

export function BuiltOn() {
  return (
    <section aria-labelledby="built-title" className="py-24 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-10">
        <Heading id="built-title" sub="Payments run on PayPal's own APIs, in the sandbox for this demo. The AI layer sits on top and never moves money by itself.">
          Built on PayPal
        </Heading>
      </div>
      <div data-reveal className="mt-12 space-y-3 lg:mt-16">
        <Marquee items={PAYPAL} />
        <Marquee items={AI} reverse accent />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ g) final CTA + footer */

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div aria-hidden className="cta-glow pointer-events-none absolute inset-0" />
      <div data-reveal className="relative mx-auto flex max-w-[1200px] flex-col items-center px-5 py-32 text-center sm:px-6 lg:px-10 lg:py-48">
        <h2 id="cta-title" className="section-title max-w-[14ch] font-extrabold">Try it with the demo accounts</h2>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-muted lg:text-[19px]">Five people, one story. Nothing you do here moves real money.</p>
        <Link href={signedIn ? "/app" : "/signin"} className="press mt-9 inline-flex h-14 items-center rounded-full bg-accent px-9 text-[17px] font-bold text-on-accent hover:bg-accent-2">Open Shield</Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center gap-2 text-[18px] font-extrabold tracking-[-0.03em]"><ShieldCheck size={22} aria-hidden className="text-accent" /> Shield</div>
        <ul className="flex flex-col gap-3 text-[14px] text-muted lg:flex-row lg:items-center lg:gap-8">
          <li>Built for the PayPal AI Hackathon 2026</li>
          <li>Demo only — sandbox, no real money</li>
          <li>
            <a href="https://github.com/im-Amrith/shield-paypal-ai" className="press inline-flex min-h-11 items-center gap-2 rounded-control font-semibold text-fg hover:text-accent">
              <Code2 size={17} aria-hidden /> Source on GitHub
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
