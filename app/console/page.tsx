import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { Card, Badge, PageHeader, Section, Empty, When } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { ConsoleReply } from "@/components/ConsoleReply";

export const dynamic = "force-dynamic";

const decisionTone = { auto: "neutral", ask_customer: "brand", needs_human: "warn", blocked: "danger" } as const;

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const me = await getUser();
  if (me.role !== "support") {
    return (
      <div>
        <PageHeader title="Support console" />
        <Card tone="warn"><p className="text-sm">This is the support specialist's view. Switch to <b>Priya · support</b> in the top bar.</p></Card>
      </div>
    );
  }
  const sp = await searchParams;
  const d = db();
  const order = { waiting_human: 0, open: 1, reopened: 1, waiting_customer: 2, resolved: 3 } as const;
  const cases = [...d.cases].sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  const sel = cases.find((c) => c.id === sp.case) ?? cases[0];
  const disputes = d.vaultDeals.filter((v) => v.status === "disputed");

  return (
    <div>
      <PageHeader title="Support console" subtitle="The AI handles what it safely can. You approve the risky parts, or take over." />
      {disputes.length > 0 && (
        <Section title="Vault disputes">
          {disputes.map((v) => <Link key={v.id} href={`/vault/${v.id}`} className="block"><Card tone="danger"><p className="text-sm font-semibold">{v.title}: {v.disputeReason}</p></Card></Link>)}
        </Section>
      )}
      <Section title={`Queue · ${cases.filter((c) => c.status === "waiting_human").length} waiting`}>
        {cases.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cases.map((c) => (
              <Link key={c.id} href={`/console?case=${c.id}`} className={`shrink-0 rounded-xl border px-3 py-2 text-xs ${c.id === sel?.id ? "border-brand bg-brand-soft" : "border-ink/10 bg-white"}`}>
                <span className="block font-semibold">{d.users.find((u) => u.id === c.customerId)?.name.split(" ")[0]} · {c.category.replace("_", " ")}</span>
                <span className={c.status === "waiting_human" ? "text-warn" : "text-ink/50"}>{c.status.replace("_", " ")}</span>
              </Link>
            ))}
          </div>
        ) : <Empty>No cases yet. Start one from Support as Ravi or Meera.</Empty>}
      </Section>

      {sel && (
        <>
          <Card tone="brand" className="mb-4">
            <p className="text-xs font-semibold uppercase text-brand">AI summary</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{sel.summary}</p>
            <p className="mt-2 text-[11px] text-ink/50">Opened <When iso={sel.createdAt} /> · tier {sel.tier} · {sel.troubleshootAttempts} troubleshooting round(s)</p>
          </Card>

          <Section title="Proposed actions">
            {sel.actions.length ? sel.actions.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{a.summary}</span>
                  <Badge tone={decisionTone[a.decision]}>{a.decision.replace("_", " ")}</Badge>
                </div>
                <p className="text-xs text-ink/60">{a.tool}({Object.entries(a.args).filter(([k]) => k !== "captureId").map(([k, v]) => `${k}: ${v}`).join(", ")}) · {a.reason}</p>
                <p className="mt-1 text-xs">Status: <b>{a.status}</b>{a.result ? ` — ${a.result}` : ""}</p>
                {a.status === "pending" && a.decision === "needs_human" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ActionButton variant="safe" path="/api/support" body={{ action: "decide", caseId: sel.id, actionId: a.id, approve: true }}>Approve & run</ActionButton>
                    <ActionButton variant="secondary" path="/api/support" body={{ action: "decide", caseId: sel.id, actionId: a.id, approve: false, note: "we need more information first" }}>Deny</ActionButton>
                  </div>
                )}
              </Card>
            )) : <p className="text-sm text-ink/50">No actions proposed.</p>}
          </Section>

          <Section title="Conversation" action={sel.tier !== 3 && sel.status !== "resolved" ? <ActionButton variant="secondary" path="/api/support" body={{ action: "takeover", caseId: sel.id }}>Take over</ActionButton> : undefined}>
            <Card>
              <ol className="space-y-2 text-sm">
                {sel.messages.map((m, i) => (
                  <li key={i}><span className="text-xs font-semibold text-ink/50">{m.from}</span> <span className="whitespace-pre-wrap">{m.text}</span></li>
                ))}
              </ol>
            </Card>
            {sel.status !== "resolved" && (
              <>
                <ConsoleReply caseId={sel.id} />
                <ActionButton full variant="secondary" path="/api/support" body={{ action: "resolve", caseId: sel.id }}>Mark resolved</ActionButton>
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
