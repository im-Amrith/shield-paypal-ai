"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { crumbsFor } from "./tools";

/** "Protect › Vault" above each app page, back to its pillar. */
export function Breadcrumbs() {
  const trail = crumbsFor(usePathname());
  if (trail.length < 2 && !trail[0]?.href) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-2 lg:mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-[14px] font-semibold text-muted">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {c.href && !last ? (
                <Link href={c.href} className="press -mx-1 rounded-[6px] px-1 py-0.5 hover:text-fg">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-fg/80" : ""}>{c.label}</span>
              )}
              {!last && <ChevronRight size={14} aria-hidden className="opacity-60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
