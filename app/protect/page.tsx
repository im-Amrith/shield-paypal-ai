import Link from "next/link";
import { ScanSearch, Lock, HeartHandshake, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui";

const items = [
  { href: "/protect/scan", title: "Scam check", body: "Paste a chat, listing or screenshot before you pay. Get a risk score and the exact red flags.", Icon: ScanSearch },
  { href: "/vault", title: "Vault", body: "Escrow for informal sales: the buyer's money is held and released only after delivery.", Icon: Lock },
  { href: "/guardian", title: "Guardian mode", body: "Unusual payments from a parent are held until a trusted relative approves.", Icon: HeartHandshake },
  { href: "/subscriptions", title: "Subscription finder", body: "Find forgotten repeat charges and draft the cancellation.", Icon: Repeat },
];

export default function Protect() {
  return (
    <div>
      <PageHeader title="Protect" subtitle="Stop bad payments before they happen." />
      <div className="space-y-3">
        {items.map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className="flex gap-3 rounded-2xl border border-ink/10 bg-white p-4 hover:border-brand/40">
            <span className="h-fit rounded-xl bg-brand-soft p-2 text-brand"><Icon size={22} aria-hidden /></span>
            <span><span className="block font-semibold">{title}</span><span className="block text-sm text-ink/60">{body}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
