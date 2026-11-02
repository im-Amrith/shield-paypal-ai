"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, Check, ChevronDown, FlaskConical, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { PILLARS, toolHref, type Pillar, type PillarId } from "./tools";
import { LineArt } from "./LineArt";
import { Avatar } from "./ui";
import { api, Spinner, ThemeToggle } from "./client";

export interface NavProps { signedIn: boolean; persona?: string; alerts?: number; theme: "dark" | "light"; modes?: string }

const PEOPLE = [
  { id: "meera", name: "Meera Nair", role: "Freelance designer, Kochi" },
  { id: "ravi", name: "Ravi Nair", role: "Meera's father · Guardian on" },
  { id: "buyer", name: "Arjun Menon", role: "Buying a camera" },
  { id: "client", name: "Dana Brooks", role: "Client · Northwind Studio" },
  { id: "agent", name: "Priya", role: "Support specialist" },
];

const SECTION_OF: Record<string, PillarId> = {
  protect: "protect", vault: "protect", guardian: "protect", subscriptions: "protect",
  "get-paid": "getpaid", support: "resolve", console: "resolve",
};

export function Brand({ signedIn, onClick }: { signedIn: boolean; onClick?: () => void }) {
  return (
    <Link href={signedIn ? "/app" : "/"} onClick={onClick} aria-label={signedIn ? "Shield home" : "Shield"} className="press flex h-11 items-center gap-2 rounded-control px-1 text-[20px] font-extrabold tracking-[-0.03em]">
      <ShieldCheck size={26} strokeWidth={2.3} aria-hidden className="text-accent" />
      Shield
    </Link>
  );
}

function BellLink({ count }: { count: number }) {
  return (
    <Link href="/alerts" aria-label={count ? `Alerts, ${count} unread` : "Alerts"} className="press relative flex h-11 w-11 items-center justify-center rounded-control hover:bg-raised">
      <Bell size={21} strokeWidth={2} aria-hidden />
      {count > 0 && <span className="tabular absolute right-0.5 top-0.5 inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-on-accent">{count}</span>}
    </Link>
  );
}

/* ------------------------------------------------------------------ desktop mega-menu */

function MegaPanel({ pillar, id, open, signedIn, onKey, onPick }: {
  pillar: Pillar; id: string; open: boolean; signedIn: boolean;
  onKey: (e: React.KeyboardEvent<HTMLDivElement>) => void; onPick: () => void;
}) {
  return (
    <div id={id} data-open={open} inert={!open} onKeyDown={onKey}
      className="mega-panel glass glass-strong absolute inset-x-0 top-full mt-2 rounded-[20px] border border-border p-2">
      <ul className={`grid gap-2 ${pillar.tools.length === 4 ? "grid-cols-4" : "grid-cols-3"}`} aria-label={`${pillar.label} tools`}>
        {pillar.tools.map((t, i) => (
          <li key={t.id} style={{ "--i": i } as React.CSSProperties}>
            <Link href={toolHref(t, signedIn)} onClick={onPick} data-mega-card
              className="mega-card group flex h-full min-h-[208px] flex-col overflow-hidden rounded-[14px] border border-transparent bg-raised/50 p-4 hover:border-accent/40 hover:bg-card focus-visible:border-accent/60">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-bold tracking-[-0.01em]">{t.title}</span>
                {t.tag && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted">{t.tag}</span>}
              </span>
              <span className="mt-1.5 text-[14px] leading-snug text-muted">{t.desc}</span>
              <LineArt id={t.art} className="mt-auto h-[96px] w-full pt-4 text-fg/45 transition-colors group-hover:text-fg/70" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DesktopMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState<PillarId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const how = useRef<"hover" | "click" | "key" | null>(null);
  const root = useRef<HTMLUListElement>(null);
  const uid = useId();
  const path = usePathname();
  const section = SECTION_OF[path.split("/")[1] ?? ""];

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = useCallback(() => { clear(); setOpen(null); how.current = null; }, []);
  const trigger = (p: PillarId) => root.current?.querySelector<HTMLButtonElement>(`[data-trigger="${p}"]`);
  const cards = (p: PillarId) => [...(root.current?.querySelectorAll<HTMLAnchorElement>(`#${CSS.escape(uid + p)} [data-mega-card]`) ?? [])];
  const focusCard = (p: PillarId, i: number) => requestAnimationFrame(() => cards(p).at(i)?.focus());

  useEffect(() => close(), [path, close]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.closest("[data-nav-shell]")?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { const p = open; close(); trigger(p)?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  useEffect(() => clear, []);

  const hoverOpen = (p: PillarId, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    if (open) { setOpen(p); how.current = "hover"; return; }
    timer.current = setTimeout(() => { setOpen(p); how.current = "hover"; }, 120); // intent delay
  };
  const hoverLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    timer.current = setTimeout(close, 180);
  };

  const onPanelKey = (p: PillarId) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = cards(p);
    const i = list.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (n: number) => { e.preventDefault(); list.at(n % list.length)?.focus(); };
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(i <= 0 ? list.length - 1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
  };

  return (
    <ul ref={root} className="hidden items-center gap-1 lg:flex" onPointerLeave={hoverLeave} onPointerEnter={clear}>
      {PILLARS.map((p) => {
        const isOpen = open === p.id;
        const panelId = uid + p.id;
        return (
          <li key={p.id} onPointerEnter={(e) => hoverOpen(p.id, e)}
            onBlur={(e) => { if (isOpen && !e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
            <button type="button" data-trigger={p.id} aria-expanded={isOpen} aria-controls={panelId}
              onFocus={(e) => { if (e.currentTarget.matches(":focus-visible") && !isOpen) { setOpen(p.id); how.current = "key"; } }}
              onClick={() => {
                if (isOpen && how.current !== "hover") { close(); return; }
                const wasHover = isOpen && how.current === "hover";
                setOpen(p.id); how.current = "click";
                if (!wasHover) focusCard(p.id, 0);
              }}
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(p.id); how.current = "key"; focusCard(p.id, 0); } }}
              className={`press flex h-10 items-center gap-1 rounded-full px-4 text-[15px] font-semibold transition-colors ${isOpen ? "bg-raised text-fg" : section === p.id ? "text-fg" : "text-fg/80 hover:text-fg"}`}>
              {p.label}
              <ChevronDown size={15} aria-hidden className={`text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              {section === p.id && <span className="sr-only">(current section)</span>}
            </button>
            <MegaPanel pillar={p} id={panelId} open={isOpen} signedIn={signedIn} onKey={onPanelKey(p.id)} onPick={close} />
          </li>
        );
      })}
      <li>
        <Link href={signedIn ? "/demo" : "/signin?next=%2Fdemo"} aria-current={path === "/demo" ? "page" : undefined}
          className={`press flex h-10 items-center rounded-full px-4 text-[15px] font-semibold ${path === "/demo" ? "text-fg" : "text-fg/80 hover:text-fg"}`}>Demo</Link>
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ account menu */

export function AccountMenu({ current, modes }: { current: string; modes?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const me = PEOPLE.find((p) => p.id === current) ?? PEOPLE[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const pick = async (id: string) => {
    setBusy(id);
    await api("/api/session", { persona: id });
    setOpen(false); setBusy(null);
    router.push("/app");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button aria-haspopup="menu" aria-expanded={open} aria-label={`Signed in as ${me.name}. Account menu`} onClick={() => setOpen(!open)}
        className="press flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-raised">
        <Avatar id={me.id} size={32} />
        <span className="text-[14px] font-bold">{me.name.split(" ")[0]}</span>
        <ChevronDown size={15} aria-hidden className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="arrive glass absolute right-0 top-full z-50 mt-2 w-[300px] rounded-[16px] border border-border p-1.5">
          <p className="px-3 pb-1 pt-2 text-[13px] text-muted">Switch demo person</p>
          {PEOPLE.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={p.id === current} onClick={() => pick(p.id)}
              className="press flex w-full items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-raised">
              <Avatar id={p.id} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{p.name}</span>
                <span className="block truncate text-[12px] text-muted">{p.role}</span>
              </span>
              {busy === p.id ? <Spinner /> : p.id === current && <Check size={16} className="text-accent" aria-hidden />}
            </button>
          ))}
          <div className="mt-1 border-t border-border px-1 pt-1">
            <Link href="/demo" onClick={() => setOpen(false)} role="menuitem" className="press flex min-h-11 items-center gap-3 rounded-control px-2 text-[14px] hover:bg-raised">
              <FlaskConical size={16} className="text-muted" aria-hidden /> Demo controls
            </Link>
            <form action="/api/session" method="post">
              <input type="hidden" name="action" value="signout" />
              <button role="menuitem" className="press flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-[14px] hover:bg-raised">
                <LogOut size={16} className="text-muted" aria-hidden /> Sign out
              </button>
            </form>
            {modes && <p className="px-2 pb-1.5 text-[12px] text-muted">{modes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ mobile sheet */

function MobileSheet({ signedIn, persona, theme, onClose }: { signedIn: boolean; persona?: string; theme: "dark" | "light"; onClose: () => void }) {
  const [group, setGroup] = useState<PillarId | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const me = PEOPLE.find((p) => p.id === persona);

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !ref.current) return; // keep focus inside the sheet
      const f = [...ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1)!.focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { html.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [onClose]);

  return (
    <div ref={ref} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" data-lenis-prevent
      className="sheet-in fixed inset-0 z-[60] flex flex-col bg-page lg:hidden">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <Brand signedIn={signedIn} onClick={onClose} />
        <button data-autofocus onClick={onClose} aria-label="Close menu" className="press flex h-11 w-11 items-center justify-center rounded-control hover:bg-raised"><X size={22} aria-hidden /></button>
      </div>
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <ul className="divide-y divide-border border-y border-border">
          {PILLARS.map((p) => {
            const on = group === p.id;
            return (
              <li key={p.id}>
                <button aria-expanded={on} aria-controls={`m-${p.id}`} onClick={() => setGroup(on ? null : p.id)}
                  className="flex min-h-14 w-full items-center justify-between text-left text-[19px] font-bold tracking-[-0.01em]">
                  {p.label}
                  <ChevronDown size={20} aria-hidden className={`text-muted transition-transform duration-200 ${on ? "rotate-180" : ""}`} />
                </button>
                <ul id={`m-${p.id}`} hidden={!on} className="grid gap-2 pb-4">
                  {p.tools.map((t) => (
                    <li key={t.id}>
                      <Link href={toolHref(t, signedIn)} onClick={onClose} className="press flex min-h-[64px] items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-2.5 active:bg-raised">
                        <LineArt id={t.art} className="h-10 w-[72px] shrink-0 text-fg/50" />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[15px] font-bold">{t.title}</span>
                            {t.tag && <span className="rounded-full border border-border px-1.5 text-[11px] font-semibold text-muted">{t.tag}</span>}
                          </span>
                          <span className="block text-[13px] leading-snug text-muted">{t.desc}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          <li>
            <Link href={signedIn ? "/demo" : "/signin?next=%2Fdemo"} onClick={onClose} className="flex min-h-14 items-center text-[19px] font-bold tracking-[-0.01em]">Demo</Link>
          </li>
        </ul>
        <div className="mt-4 flex items-center justify-between rounded-[14px] border border-border px-3 py-1">
          <span className="text-[15px] font-semibold">Theme</span>
          <ThemeToggle theme={theme} />
        </div>
      </nav>
      {/* Primary actions sit at the bottom, within thumb reach. */}
      <div className="shrink-0 border-t border-border px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {signedIn && me ? (
          <div className="flex items-center gap-3">
            <Avatar id={me.id} size={40} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-bold">{me.name}</span>
              <Link href="/signin" onClick={onClose} className="text-[13px] font-semibold text-accent underline-offset-2 hover:underline">Switch person</Link>
            </span>
            <form action="/api/session" method="post">
              <input type="hidden" name="action" value="signout" />
              <button className="press flex min-h-11 items-center gap-2 rounded-control border border-border px-4 text-[14px] font-bold"><LogOut size={16} aria-hidden /> Sign out</button>
            </form>
          </div>
        ) : (
          <Link href="/signin" onClick={onClose} className="press flex min-h-12 w-full items-center justify-center rounded-control bg-accent text-[16px] font-bold text-on-accent">Open Shield</Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the bar */

export function SiteNav({ signedIn, persona, alerts = 0, theme, modes }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const path = usePathname();
  const closeSheet = useCallback(() => setSheet(false), []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setSheet(false), [path]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-2 pt-2 sm:px-3 sm:pt-3">
      <div data-nav-shell data-scrolled={scrolled} className="nav-shell relative mx-auto flex h-14 max-w-[1200px] items-center gap-2 rounded-[18px] border px-2 sm:px-3">
        <Brand signedIn={signedIn} />
        <nav aria-label="Main" className="mx-auto hidden lg:block"><DesktopMenu signedIn={signedIn} /></nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <span className="hidden lg:block"><ThemeToggle theme={theme} /></span>
          {signedIn && <BellLink count={alerts} />}
          {signedIn && persona ? (
            <span className="hidden lg:block"><AccountMenu current={persona} modes={modes} /></span>
          ) : (
            <Link href="/signin" className="press hidden h-10 items-center rounded-full bg-accent px-5 text-[14px] font-bold text-on-accent hover:bg-accent-2 sm:flex">Open Shield</Link>
          )}
          <button onClick={() => setSheet(true)} aria-expanded={sheet} aria-controls="mobile-menu" aria-label="Open menu"
            className="press flex h-11 w-11 items-center justify-center rounded-control hover:bg-raised lg:hidden">
            <Menu size={22} aria-hidden />
          </button>
        </div>
      </div>
      {sheet && <MobileSheet signedIn={signedIn} persona={persona} theme={theme} onClose={closeSheet} />}
    </header>
  );
}
