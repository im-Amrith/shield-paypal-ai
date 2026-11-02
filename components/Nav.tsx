"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, ShieldCheck, Database, Headphones, SquarePlay, Bell, HeartHandshake, ScanSearch, Lock, Activity, Inbox, Send, FileText, User,
  type LucideIcon,
} from "lucide-react";
import { AccountMenu, ThemeToggle, SearchBox } from "./client";

type Role = "freelancer" | "senior" | "client" | "buyer" | "support";
interface Item { href: string; label: string; short?: string; Icon: LucideIcon; count?: number; also?: string[] }

export interface NavCounts { alerts: number; dadHolds: number; myHolds: number; waiting: number; invoicesDue: number; disputes: number }

const DEMO: Item = { href: "/demo", label: "Demo", Icon: SquarePlay };

function navFor(role: Role, c: NavCounts): { main: Item[]; more: Item[] } {
  switch (role) {
    case "senior":
      return {
        main: [
          { href: "/", label: "Home", Icon: Home },
          { href: "/guardian", label: "Send money", short: "Send", Icon: Send, count: c.myHolds },
          { href: "/protect/scan", label: "Scam check", short: "Scam check", Icon: ScanSearch },
          { href: "/support", label: "Get help", short: "Help", Icon: Headphones },
          DEMO,
        ],
        more: [{ href: "/subscriptions", label: "My subscriptions", Icon: Database }],
      };
    case "buyer":
      return {
        main: [
          { href: "/", label: "Home", Icon: Home },
          { href: "/vault", label: "Vault", Icon: Lock },
          { href: "/protect/scan", label: "Scam check", Icon: ScanSearch },
          { href: "/support", label: "Support", Icon: Headphones },
          DEMO,
        ],
        more: [],
      };
    case "client":
      return {
        main: [
          { href: "/", label: "Invoices", Icon: FileText, count: c.invoicesDue, also: ["/get-paid/pay"] },
          { href: "/support", label: "Support", Icon: Headphones },
          DEMO,
        ],
        more: [],
      };
    case "support":
      return {
        main: [
          { href: "/console", label: "Case queue", short: "Queue", Icon: Inbox, count: c.waiting },
          { href: "/vault", label: "Disputes", Icon: Lock, count: c.disputes },
          { href: "/", label: "Overview", Icon: Home },
          DEMO,
        ],
        more: [],
      };
    default:
      return {
        main: [
          { href: "/", label: "Home", Icon: Home },
          { href: "/protect", label: "Protect", Icon: ShieldCheck, also: ["/vault", "/protect/scan", "/subscriptions"] },
          { href: "/get-paid", label: "Get Paid", Icon: Database },
          { href: "/support", label: "Support", Icon: Headphones },
          DEMO,
        ],
        more: [
          { href: "/guardian", label: "Dad's payments", Icon: HeartHandshake, count: c.dadHolds },
          { href: "/get-paid/account", label: "Account health", Icon: Activity },
        ],
      };
  }
}

const ROLE_LABEL: Record<Role, string> = { freelancer: "Freelancer", senior: "Guardian mode", buyer: "Buyer", client: "Client", support: "Support" };

function useActive(all: Item[]) {
  const path = usePathname();
  let best: string | null = null;
  let len = -1;
  for (const it of all) {
    for (const h of [it.href, ...(it.also ?? [])]) {
      const hit = h === "/" ? path === "/" : path === h || path.startsWith(h + "/");
      if (hit && h.length > len) { best = it.href; len = h.length; }
    }
  }
  return best;
}

export function Brand({ big }: { big?: boolean }) {
  return (
    <Link href="/" aria-label="Shield home" className={`press flex items-center gap-2 rounded-control font-extrabold tracking-[-0.02em] ${big ? "text-[30px]" : "text-[22px]"}`}>
      <ShieldCheck size={big ? 40 : 28} strokeWidth={2.4} aria-hidden className="text-accent" />
      Shield
    </Link>
  );
}

function Count({ n, alert }: { n?: number; alert?: boolean }) {
  if (!n) return null;
  return (
    <span className={`tabular ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold ${alert ? "bg-accent text-on-accent" : "bg-raised text-fg"}`}>{n}</span>
  );
}

function BellLink({ count }: { count: number }) {
  return (
    <Link href="/alerts" aria-label={count ? `Alerts, ${count} unread` : "Alerts"} className="press relative flex h-11 w-11 items-center justify-center rounded-control hover:bg-raised">
      <Bell size={24} strokeWidth={2} aria-hidden />
      {count > 0 && <span className="tabular absolute right-0.5 top-0.5 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[12px] font-extrabold text-on-accent">{count}</span>}
    </Link>
  );
}

export function Sidebar({ role, name, counts }: { role: Role; name: string; counts: NavCounts }) {
  const { main, more } = navFor(role, counts);
  const active = useActive([...main, ...more]);
  const link = ({ href, label, Icon, count }: Item, small?: boolean) => {
    const on = active === href;
    return (
      <li key={href + label}>
        <Link href={href} aria-current={on ? "page" : undefined}
          className={`press flex items-center gap-3.5 whitespace-nowrap rounded-panel px-4 ${small ? "h-10 text-[15px]" : "h-12 text-[17px]"} ${on ? "bg-accent-tint font-extrabold text-accent" : "font-semibold text-fg hover:bg-raised"}`}>
          <Icon size={22} strokeWidth={2} aria-hidden className={on ? "text-accent" : "text-fg"} />
          {label}
          <Count n={count} alert />
        </Link>
      </li>
    );
  };
  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-border bg-card px-3 pb-4 pt-6 lg:flex">
      <div className="px-3 pb-8"><Brand big /></div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="space-y-1.5">{main.map((it) => link(it))}</ul>
        {more.length > 0 && (
          <>
            <p className="mt-7 px-4 pb-1.5 text-[13px] font-semibold text-muted">More</p>
            <ul className="space-y-1">{more.map((it) => link(it, true))}</ul>
          </>
        )}
      </nav>
      <div className="mt-3 flex items-center gap-3 border-t border-border px-3 pt-4">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-muted"><User size={22} /></span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-extrabold">{name} ·</span>
          <span className="block truncate text-[14px] text-muted">{ROLE_LABEL[role]}</span>
        </span>
      </div>
    </aside>
  );
}

/** Phone and tablet top bar (below 1024px). */
export function TopBar({ persona, alerts, theme, modes }: { persona: string; alerts: number; theme: "dark" | "light"; modes: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-page px-4 lg:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <AccountMenu current={persona} modes={modes} />
        <ThemeToggle theme={theme} />
        <BellLink count={alerts} />
      </div>
    </header>
  );
}

/** Desktop top bar (1024px and up): search, bell, theme, persona switcher. */
export function DeskBar({ persona, alerts, theme, modes }: { persona: string; alerts: number; theme: "dark" | "light"; modes: string }) {
  return (
    <div className="hidden items-center gap-4 pb-6 lg:flex">
      <SearchBox />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle theme={theme} />
        <BellLink count={alerts} />
        <AccountMenu current={persona} modes={modes} />
      </div>
    </div>
  );
}

export function TabBar({ role, counts }: { role: Role; counts: NavCounts }) {
  const { main } = navFor(role, counts);
  const active = useActive(main);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card lg:hidden">
      <ul className="mx-auto flex max-w-xl px-1 pb-[env(safe-area-inset-bottom)]">
        {main.map(({ href, label, short, Icon, count }) => {
          const on = active === href;
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`press relative flex min-h-[62px] flex-col items-center justify-center gap-1 text-[12px] ${on ? "font-extrabold text-accent" : "font-semibold text-fg"}`}>
                <Icon size={23} strokeWidth={on ? 2.4 : 2} aria-hidden />
                {short ?? label}
                {!!count && <span className="tabular absolute left-1/2 top-1.5 ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-on-accent">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
