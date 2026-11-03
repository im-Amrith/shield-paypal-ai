import Link from "next/link";
import { ChevronLeft, Sparkles, Lock, Wrench } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import type { ProposedAction } from "@/lib/types";
import { Card, Pill, PageHeader, Section, Empty, When, Avatar, Note, HeroBand, HeroFigure, Hi, AlertBanner, type Tone } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { ConsoleReply } from "@/components/ConsoleReply";
import { CASE_STATUS, WHO, TIERS } from "@/components/caseStatus";

export const dynamic = "force-dynamic";

const DECISION: Record<ProposedAction["decision"], { label: string; tone: Tone }> = {
  auto: { label: "Ran automatically", tone: "neutral" },
  ask_customer: { label: "Asked the customer", tone: "accent" },
  needs_human: { label: "Needs your approval", tone: "accent" },
  blocked: { label: "Blocked by policy", tone: "danger" },
};
const ACTION_STATUS: Record<ProposedAction["status"], string> = { pending: "Pending", approved: "Approved", denied: "Denied", executed: "Done", failed: "Failed" };

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const me = await getUser();
  if (me.role !== "support") {
    return (
      <div>
        <PageHeader title="Support console" />
        <AlertBanner title="This is the support specialist's view" detail="Switch to Priya from the person menu." />
      </div>
    );
  }
  const sp = await searchParams;
  const d = db();
  const order = { waiting_human: 0, open: 1, reopened: 1, waiting_customer: 2, resolved: 3 } as const;
  const cases = [...d.cases].sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  const sel = cases.find((c) => c.id === sp.case) ?? cases[0];
  const picked = !!sp.case;
  const disputes = d.vaultDeals.filter((v) => v.status === "disputed");
  const waiting = cases.filter((c) => c.status === "waiting_human").length;
  const name = (id: string) => d.users.find((u) => u.id === id)?.name.split(" ")[0] ?? id;

  return (
    <div>
      <div className={picked ? "hidden lg:block" : ""}>
        <PageHeader title="Case queue" subtitle="The AI handles what it safely can. You approve the risky parts, or take over." />
        <HeroBand visual={<HeroFigure sub="waiting for you">{waiting}</HeroFigure>} label="Support queue"
          title={<>Cases waiting: <Hi>{waiting}</Hi></>}>
          {waiting ? `${cases.length} case${cases.length === 1 ? "" : "s"} in total. The ones waiting need your approval before money moves.` : `${cases.length} case${cases.length === 1 ? "" : "s"} in total. Nothing needs a person right now.`}
        </HeroBand>
        {disputes.map((v) => (
          <AlertBanner key={v.id} tone="danger" Icon={Lock} title={`Vault dispute: ${v.title}`} detail={v.disputeReason}
            actions={<Link href={`/vault/${v.id}`} className="press inline-flex min-h-11 items-center rounded-control border border-fg/70 px-5 font-bold hover:bg-raised">Review</Link>} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Cases" className={`min-w-0 lg:sticky lg:top-6 ${picked ? "hidden lg:block" : ""}`}>
          {cases.length ? (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {cases.map((c) => {
                  const on = c.id === sel?.id;
                  const st = CASE_STATUS[c.status];
                  return (
                    <li key={c.id}>
                      <Link href={`/console?case=${c.id}`} aria-current={on ? "page" : undefined}
                        className={`press flex gap-3 border-l-4 px-4 py-3.5 ${on ? "border-accent bg-accent-tint" : "border-transparent hover:bg-raised"}`}>
                        <Avatar id={c.customerId} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-bold">{name(c.customerId)}</span>
                            <span className="shrink-0 text-[12px] text-muted"><When iso={c.updatedAt} date /></span>
                          </span>
                          <span className="block truncate text-[14px] capitalize text-muted">{c.category.replace(/_/g, " ")}</span>
                          <span className="mt-1.5 block"><Pill tone={st.tone}>{c.status === "waiting_human" ? "Waiting for you" : st.label}</Pill></span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : <Empty>No cases yet. Start one from Support as Ravi or Meera.</Empty>}
        </nav>

        {sel && (
          <section aria-label="Selected case" className={`min-w-0 ${picked ? "" : "hidden lg:block"}`}>
            <Link href="/console" className="press -ml-1 mb-3 inline-flex items-center gap-0.5 rounded-control py-1 pr-2 text-[14px] font-semibold text-muted hover:text-fg lg:hidden">
              <ChevronLeft size={18} aria-hidden /> Queue
            </Link>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar id={sel.customerId} size={44} />
                <div>
                  <h2 className="text-[20px] font-extrabold capitalize">{name(sel.customerId)} · {sel.category.replace(/_/g, " ")}</h2>
                  <p className="text-[14px] text-muted">Opened <When iso={sel.createdAt} /> · with: {TIERS[sel.tier - 1]} · {sel.troubleshootAttempts} troubleshooting round{sel.troubleshootAttempts === 1 ? "" : "s"}</p>
                </div>
              </div>
              {sel.tier !== 3 && sel.status !== "resolved" && (
                <ActionButton variant="secondary" path="/api/support" body={{ action: "takeover", caseId: sel.id }}>Take over from the AI</ActionButton>
              )}
            </div>

            <div className="mb-6 rounded-card border-l-4 border-accent bg-accent-tint p-5">
              <p className="flex items-center gap-2 text-[14px] font-extrabold text-accent"><Sparkles size={16} aria-hidden /> AI summary</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">{sel.summary}</p>
            </div>

            <Section title="Proposed actions">
              {sel.actions.length ? (
                <div className="space-y-3">
                  {sel.actions.map((a) => {
                    const dec = a.decision === "needs_human" && a.status !== "pending"
                      ? (a.status === "denied" ? { label: "Denied by a specialist", tone: "neutral" as Tone } : { label: "Approved by a specialist", tone: "success" as Tone })
                      : DECISION[a.decision];
                    const needs = a.status === "pending" && a.decision === "needs_human";
                    return (
                      <Card key={a.id} as="article" className={`p-5 ${needs ? "border-accent" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="flex items-center gap-2 font-bold"><Wrench size={16} aria-hidden className="text-accent" />{a.summary}</h3>
                          <Pill tone={dec.tone}>{dec.label}</Pill>
                        </div>
                        <p className="mt-1.5 text-[14px] text-muted">{a.reason}</p>
                        <p className="mt-2 rounded-[8px] bg-raised px-3 py-2 text-[13px]">
                          <span className="font-bold">{a.tool}</span>{" "}
                          {Object.entries(a.args).filter(([k]) => k !== "captureId").map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                        <p className="mt-2 text-[14px]">Status: <span className="font-bold">{ACTION_STATUS[a.status]}</span>{a.result ? `. ${a.result}` : ""}</p>
                        {a.via && <p className="mt-1.5"><Pill tone={a.via.startsWith("PayPal Agent Toolkit") ? "accent" : "neutral"}>{a.via}</Pill></p>}
                        {needs && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <ActionButton path="/api/support" body={{ action: "decide", caseId: sel.id, actionId: a.id, approve: true }} confirm={`Approve and run: ${a.summary}?`}>Approve</ActionButton>
                            <ActionButton variant="secondary" path="/api/support" body={{ action: "decide", caseId: sel.id, actionId: a.id, approve: false, note: "we need more information first" }}>Deny</ActionButton>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : <Empty>The AI hasn&apos;t proposed any account actions on this case.</Empty>}
              <Note className="mt-2">Every money-moving tool goes through the policy engine first: small refunds run, larger ones wait here, anything outside policy is blocked.</Note>
            </Section>

            <Section title="Conversation" className="!mb-0">
              <Card className="overflow-hidden">
                <ol className="space-y-3 p-5">
                  {sel.messages.map((m, i) => m.from === "system" ? (
                    <li key={i} className="text-center text-[13px] text-muted">{m.text}</li>
                  ) : (
                    <li key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <span className={`w-32 shrink-0 pt-0.5 text-[13px] font-bold ${m.from === "customer" ? "text-accent" : "text-muted"}`}>{m.from === "customer" ? name(sel.customerId) : WHO[m.from]}</span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap text-[15px]">{m.text}</span>
                    </li>
                  ))}
                </ol>
                {sel.status !== "resolved" && (
                  <div className="space-y-3 border-t border-border p-4">
                    <ConsoleReply caseId={sel.id} />
                    <ActionButton variant="secondary" path="/api/support" body={{ action: "resolve", caseId: sel.id }} done="Resolved">Mark resolved</ActionButton>
                  </div>
                )}
              </Card>
            </Section>
          </section>
        )}
      </div>
    </div>
  );
}
