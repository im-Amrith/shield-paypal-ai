"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/types";
import { api } from "./client";

const tone: Record<string, string> = {
  freeze: "border-l-danger", guardian: "border-l-warn", risk: "border-l-warn", vault: "border-l-brand",
  invoice: "border-l-safe", support: "border-l-brand", info: "border-l-ink/30",
};

export function Alerts({ items }: { items: Notification[] }) {
  const router = useRouter();
  if (!items.length) return <p className="rounded-2xl border border-dashed border-ink/15 p-4 text-center text-sm text-ink/50">No alerts. You're all set.</p>;
  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={n.link || "/"}
            onClick={() => { api("/api/notifications", { id: n.id }).then(() => router.refresh()).catch(() => undefined); }}
            className={`block rounded-xl border border-l-4 border-ink/10 bg-white p-3 ${tone[n.kind] || ""} ${n.read ? "opacity-60" : ""}`}
          >
            <p className="text-sm font-semibold">{n.title}</p>
            {n.body && <p className="mt-0.5 line-clamp-3 text-xs text-ink/70">{n.body}</p>}
            <p className="mt-1 text-[11px] text-ink/40">
              {new Date(n.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {" · "}{n.channel.join(" + ").replace("in_app", "app")}{n.attempt && n.attempt > 1 ? ` · reminder ${n.attempt - 1}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
