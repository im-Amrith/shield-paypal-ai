"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shield, Wallet, MessageCircle, FlaskConical } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/protect", label: "Protect", Icon: Shield },
  { href: "/get-paid", label: "Get Paid", Icon: Wallet },
  { href: "/support", label: "Support", Icon: MessageCircle },
  { href: "/demo", label: "Demo", Icon: FlaskConical },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href) || (href === "/protect" && (path.startsWith("/vault") || path.startsWith("/guardian") || path.startsWith("/subscriptions")));
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-brand" : "text-ink/55"}`}>
                <Icon size={20} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
