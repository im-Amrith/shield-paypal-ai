import Link from "next/link";
import { Plus, Inbox, Check } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { PageHeader, Pill, When, Card, Hi } from "@/components/ui";
import { CASE_STATUS, TIERS } from "@/components/caseStatus";
import { SupportChat } from "@/components/SupportChat";
import { buttonClass } from "@/components/styles";

export const dynamic = "force-dynamic";

/** Compact hero: who is handling the case, as a 3-step strip. */
function TierStrip({ tier, resolved }: { tier: number; resolved: boolean }) {
  return (
    <ol aria-label={`Case is with: ${TIERS[tier - 1]}${resolved ? ", resolved" : ""}`} className="grid grid-cols-3 gap-2">
      {TIERS.map((t, i) => {
        const done = i < tier - 1;
        const now = i === tier - 1;
        return (
          <li key={t} aria-current={now ? "step" : undefined}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-panel px-2 text-center text-[13px] font-bold sm:text-[15px] ${now ? "bg-accent text-on-accent" : done ? "bg-accent-tint text-accent" : "bg-raised text-muted"}`}>
            {done && <Check size={15} aria-hidden />}{t}
          </li>
        );
      })}
    </ol>
  );
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ case?: string; new?: string }> }) {
  const sp = await searchParams;
  const me = await getUser();
  const mine = db().cases.filter((c) => c.customerId === me.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const current = sp.new ? null : (sp.case ? mine.find((c) => c.id === sp.case) : mine[0]) ?? null;
  const senior = me.role === "senior";
  const st = current ? CASE_STATUS[current.status] : null;

  return (
    <div className={senior ? "text-[17px]" : ""}>
      <PageHeader title={senior ? "Get help" : "Support"}
        subtitle="Support that understands, troubleshoots and can act on your account, with your OK."
        action={
          <div className="flex gap-2">
            {me.role === "support" && <Link href="/console" className={buttonClass("secondary")}><Inbox size={17} aria-hidden /> Console</Link>}
            {current && <Link href="/support?new=1" className={buttonClass("secondary")}><Plus size={17} aria-hidden /> New conversation</Link>}
          </div>
        } />

      <section className="hero-wash -mx-4 mb-5 px-4 py-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-card lg:px-6 lg:py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[18px] font-extrabold lg:text-[22px]">
            {current ? <>Your case is with: <Hi>{TIERS[current.tier - 1]}</Hi></> : <>Start with <Hi>Tier 1</Hi>, a person is one step away</>}
          </h2>
          {st && <Pill tone={st.tone}>{st.label}</Pill>}
        </div>
        <TierStrip tier={current?.tier ?? 1} resolved={current?.status === "resolved"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0"><SupportChat key={current?.id ?? "new"} initial={current} big={senior} /></div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
          {current && current.timeline.length > 0 && (
            <Card as="section" className="p-5">
              <h2 className="font-extrabold">Case timeline</h2>
              <ol className="mt-3 space-y-2 text-[14px]">
                {current.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i === current.timeline.length - 1 ? "bg-accent" : "bg-muted/50"}`} aria-hidden />
                    <span className="min-w-0"><span className="block">{t.label}</span><span className="block text-[12px] text-muted"><When iso={t.at} /></span></span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {mine.length > 0 && (
            <Card as="nav" aria-label="Your conversations" className="p-2">
              <h2 className="px-3 pb-1 pt-2 text-[14px] font-bold text-muted">Conversations</h2>
              <ul>
                {mine.map((c) => {
                  const on = c.id === current?.id;
                  const s = CASE_STATUS[c.status];
                  return (
                    <li key={c.id}>
                      <Link href={`/support?case=${c.id}`} aria-current={on ? "page" : undefined}
                        className={`press block rounded-panel px-3 py-2.5 ${on ? "bg-accent-tint" : "hover:bg-raised"}`}>
                        <span className="block truncate text-[14px] font-semibold">{c.messages.find((m) => m.from === "customer")?.text ?? c.category}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-[12px] text-muted"><When iso={c.updatedAt} date /><Pill tone={s.tone}>{s.label}</Pill></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {!current && (
            <Card as="section" className="p-5">
              <h2 className="font-extrabold">How it works</h2>
              <ul className="mt-2 space-y-2 text-[14px] text-muted">
                <li><b className="text-fg">Tier 1</b> answers from PayPal&apos;s help articles, with the source shown.</li>
                <li><b className="text-fg">The resolution agent</b> can look up a payment, open a dispute, cancel automatic payments or issue a refund. It asks first.</li>
                <li><b className="text-fg">A specialist</b> checks refunds above your limit. You can ask for one any time.</li>
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
