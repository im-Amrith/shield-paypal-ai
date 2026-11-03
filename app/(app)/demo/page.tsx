import { Mail } from "lucide-react";
import { db } from "@/lib/store";
import { now } from "@/lib/clock";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";
import { Card, PageHeader, Section, Avatar, Dot, HeroBand, HeroFigure, Hi, AlertRows, shortAgo } from "@/components/ui";
import { DemoControls } from "@/components/DemoControls";

export const dynamic = "force-dynamic";

const WALK = [
  { who: "meera", title: "Collections agent", steps: "Get Paid → send an invoice. Jump +1 week twice and watch the agent chase. Switch to Dana and pay half." },
  { who: "meera", title: "Freeze explainer", steps: "Account health → simulate a limitation. Read the reason, the payments behind it, and the drafted appeal." },
  { who: "buyer", title: "Vault escrow", steps: "As Meera, create a Vault link. As Arjun, pay, then confirm delivery or report a problem." },
  { who: "ravi", title: "Guardian mode", steps: "As Ravi, Send money → “tax office” example. As Meera, block it from Home." },
  { who: "agent", title: "Resolve", steps: "As Ravi, Support → “earbuds never arrived”, then reply “that didn't work”. As Priya, approve the refund in the queue." },
];

export default async function DemoPage() {
  const d = db();
  const at = now();
  const offsetH = Math.round((d.clockOffsetMs || 0) / 3600_000);
  const pp = paypalMode();
  const ai = llmProvider();
  const mail = process.env.RESEND_API_KEY ? "Resend" : "outbox only";
  const clock = at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <PageHeader title="Demo controls" subtitle="Fast-forward time to watch week-long flows (reminders, auto-release, re-alerts) happen in seconds." />
      <HeroBand visual={<HeroFigure sub="demo clock">{at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</HeroFigure>}
        label="Demo clock" title={<>{clock.split(",")[0]}: <Hi>{offsetH ? `+${offsetH >= 48 ? `${Math.round(offsetH / 24)} days` : `${offsetH} h`}` : "real time"}</Hi></>}>
        Every jump also runs the background jobs: Vault auto-release and expiry, invoice reminders, freeze re-alerts and early warnings.
      </HeroBand>

      <DemoControls />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <AlertRows title={`Email outbox · ${d.outbox.length}`} empty="No emails sent yet."
            items={d.outbox.slice(0, 15).map((o, i) => ({ key: String(i), Icon: Mail, tone: "accent" as const, text: o.subject, sub: <details><summary className="cursor-pointer">To {o.to} · {o.provider} · read</summary><pre className="mt-2 whitespace-pre-wrap rounded-[8px] bg-raised p-3 font-sans text-[13px] text-fg">{o.body}</pre></details>, time: shortAgo(o.at, at) }))} />
          <Section title="Suggested walkthrough" className="!mb-0">
            <Card className="overflow-hidden">
              <ol className="divide-y divide-border">
                {WALK.map((w) => (
                  <li key={w.title} className="flex gap-3 px-5 py-4">
                    <Avatar id={w.who} size={32} />
                    <span><span className="block font-bold">{w.title}</span><span className="block text-[14px] text-muted">{w.steps}</span></span>
                  </li>
                ))}
              </ol>
            </Card>
          </Section>
        </div>
        <Card as="section" className="p-5">
          <h2 className="font-extrabold">Integrations</h2>
          <ul className="mt-3 space-y-2.5 text-[15px]">
            <li className="flex items-center justify-between gap-3"><span>PayPal</span><span className="flex items-center gap-2 text-muted"><Dot tone={pp === "mock" ? "accent" : "success"} />{pp === "mock" ? "Mock (no keys)" : pp}</span></li>
            <li className="flex items-center justify-between gap-3"><span>AI</span><span className="flex items-center gap-2 text-muted"><Dot tone={ai === "none" ? "accent" : "success"} />{ai === "none" ? "Rules only" : ai}</span></li>
            <li className="flex items-center justify-between gap-3"><span>Email</span><span className="flex items-center gap-2 text-muted"><Dot tone={mail === "Resend" ? "success" : "accent"} />{mail}</span></li>
          </ul>
          <p className="mt-4 text-[14px] font-bold">Simulated on purpose</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-muted">
            <li>Account limitation events (the sandbox can&apos;t freeze accounts)</li>
            <li>Carrier delivery scans</li>
            <li>FX fees are estimates; PayPal has no fee-quote API</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
