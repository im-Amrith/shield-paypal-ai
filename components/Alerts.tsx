"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Truck, Lock, AlertTriangle, ShieldAlert, Activity, Headphones, Bell, Info, type LucideIcon } from "lucide-react";
import type { Notification } from "@/lib/types";
import { api } from "./client";

type Look = { Icon: LucideIcon; ink: string };

/** Pick an icon from the alert itself, so "paid" reads as a tick and "shipped" as a van, as in the design. */
function look(n: Notification): Look {
  const t = `${n.title} ${n.body}`.toLowerCase();
  if (n.kind === "freeze") return { Icon: ShieldAlert, ink: "text-danger" };
  if (/blocked|disput/.test(t)) return { Icon: ShieldAlert, ink: "text-danger" };
  if (/paid in full|released|approved|resolved|refund (of|issued)|lifted/.test(t)) return { Icon: CircleCheck, ink: "text-success" };
  if (/ship|deliver|tracking/.test(t)) return { Icon: Truck, ink: "text-fg" };
  if (/reminder|nudge|notice/.test(t)) return { Icon: Bell, ink: "text-accent" };
  switch (n.kind) {
    case "guardian": return { Icon: AlertTriangle, ink: "text-accent" };
    case "risk": return { Icon: Activity, ink: "text-accent" };
    case "vault": return { Icon: Lock, ink: "text-accent" };
    case "invoice": return { Icon: Bell, ink: "text-accent" };
    case "support": return { Icon: Headphones, ink: "text-accent" };
    default: return { Icon: Info, ink: "text-muted" };
  }
}

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function Alerts({ items, limit, title = "Recent Alerts", detail, empty = "Nothing needs you right now. Shield will tell you here, by push and by email, the moment something does." }: {
  items: Notification[]; limit?: number; title?: string | null; detail?: boolean; empty?: string;
}) {
  const router = useRouter();
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section className="rounded-card border border-border bg-card">
      {title && <h2 className="px-4 pb-1 pt-4 text-[17px] font-extrabold sm:px-5 lg:text-[20px]">{title}</h2>}
      {items.length ? (
        <ul className="divide-y divide-border px-4 pb-1 sm:px-5">
          {shown.map((n) => {
            const k = look(n);
            return (
              <li key={n.id}>
                <Link
                  href={n.link || "/app"}
                  onClick={() => { if (!n.read) api("/api/notifications", { id: n.id }).then(() => router.refresh()).catch(() => undefined); }}
                  className="press -mx-2 flex items-start gap-3 rounded-control px-2 py-3 hover:bg-raised"
                >
                  <k.Icon size={21} strokeWidth={2} className={`mt-0.5 shrink-0 ${k.ink}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] leading-snug lg:text-[15px] ${n.read ? "font-medium text-muted" : "font-bold"}`}>
                      {n.title}{!n.read && <span className="sr-only"> (unread)</span>}
                    </span>
                    {detail && n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                    {detail && (
                      <span className="mt-0.5 block text-[12px] text-muted">
                        Sent by {n.channel.map((c) => (c === "in_app" ? "app" : c)).join(" and ")}{n.attempt && n.attempt > 1 ? ` · reminder ${n.attempt - 1}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-[13px] font-semibold text-muted lg:text-[14px]">{ago(n.at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 pb-4 pt-2 text-[14px] text-muted sm:px-5">{empty}</p>}
      {limit && items.length > limit && (
        <Link href="/alerts" className="press block border-t border-border px-5 py-3 text-[14px] font-bold text-accent hover:bg-raised">View all {items.length} alerts</Link>
      )}
    </section>
  );
}
