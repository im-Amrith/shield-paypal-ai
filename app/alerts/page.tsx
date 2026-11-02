import { Bell } from "lucide-react";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { PageHeader, HeroBand, HeroFigure, Hi } from "@/components/ui";
import { Alerts } from "@/components/Alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const me = await getUser();
  const all = db().notifications.filter((n) => n.userId === me.id);
  const needle = q.trim().toLowerCase();
  const items = needle ? all.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(needle)) : all;
  const unread = all.filter((n) => !n.read).length;
  return (
    <div>
      <PageHeader title="Alerts" subtitle={needle ? `${items.length} result${items.length === 1 ? "" : "s"} for “${q}”` : "Every payment, invoice and case event Shield told you about."} />
      <HeroBand
        visual={<HeroFigure sub={<span className="inline-flex items-center gap-1.5"><Bell size={15} aria-hidden /> unread</span>}>{unread}</HeroFigure>}
        label="Alerts"
        title={unread ? <>You have <Hi>{unread} unread</Hi></> : <>You&apos;re <Hi tone="success">up to date</Hi></>}>
        Urgent ones also go out by push and email, and are re-sent at 24 and 72 hours if you haven&apos;t opened them.
      </HeroBand>
      <Alerts items={items} title={needle ? "Matching alerts" : "All alerts"} detail empty={needle ? "No alerts match that search." : undefined} />
    </div>
  );
}
