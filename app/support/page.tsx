import Link from "next/link";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { PageHeader } from "@/components/ui";
import { SupportChat } from "@/components/SupportChat";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ case?: string; new?: string }> }) {
  const sp = await searchParams;
  const me = await getUser();
  const mine = db().cases.filter((c) => c.customerId === me.id);
  const current = sp.new ? null : (sp.case ? mine.find((c) => c.id === sp.case) : mine[0]) ?? null;
  return (
    <div>
      <PageHeader title="Resolve" subtitle="AI support that understands, troubleshoots, and can act on your account with your OK." />
      {me.role === "support" && <p className="mb-3 text-sm"><Link className="text-brand underline" href="/console">Open the support console →</Link></p>}
      <div className="mb-3 flex gap-3 text-sm">
        <Link href="/support?new=1" className="text-brand underline">New conversation</Link>
        {mine.length > 1 && <span className="text-ink/50">{mine.length} cases</span>}
      </div>
      <SupportChat key={current?.id ?? "new"} initial={current} />
    </div>
  );
}
