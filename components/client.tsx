"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, FlaskConical, Sun, Moon, Search } from "lucide-react";
import { Avatar } from "./ui";
import { buttonClass, inputClass, labelClass, type ButtonVariant } from "./styles";

export { buttonClass, inputClass, labelClass };
export type { ButtonVariant };

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || "Request failed");
  return j.data as T;
}

/**
 * Button that POSTs to an API route, shows errors inline, then refreshes server data.
 * `confirm` asks inline (no browser dialog): the first press reveals a confirm row.
 */
export function ActionButton({ path, body, children, variant = "primary", full, confirm, onDone, href, size, done }: {
  path: string; body: unknown; children: ReactNode; variant?: ButtonVariant; full?: boolean; confirm?: string;
  onDone?: (data: unknown) => void; href?: (data: any) => string | undefined; size?: "md" | "lg"; done?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setAsking(false); setBusy(true); setErr(null);
    try {
      const data = await api(path, body);
      onDone?.(data);
      if (done) { setOk(true); setTimeout(() => setOk(false), 1800); }
      const to = href?.(data);
      if (to) router.push(to);
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={full ? "w-full" : ""}>
      {asking ? (
        <div className="arrive rounded-control border border-border bg-raised p-3" role="group" aria-label="Confirm">
          <p className="text-[15px] font-medium">{confirm}</p>
          <div className="mt-2 flex gap-2">
            <button autoFocus className={buttonClass(variant === "secondary" || variant === "quiet" ? "primary" : variant)} onClick={run}>Yes, continue</button>
            <button className={buttonClass("secondary")} onClick={() => setAsking(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <button className={buttonClass(variant, full, size)} disabled={busy} aria-busy={busy} onClick={() => (confirm ? setAsking(true) : run())}>
          {busy ? <><Spinner /> Working…</> : ok ? <><Check size={17} aria-hidden /> {done}</> : children}
        </button>
      )}
      {err && <p role="alert" className="mt-1.5 text-[14px] text-danger">{err}</p>}
    </div>
  );
}

export function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />;
}

/* ---------- Account menu (demo persona switch lives here, out of the main chrome) ---------- */

const PEOPLE = [
  { id: "meera", name: "Meera Nair", role: "Freelance designer, Kochi" },
  { id: "ravi", name: "Ravi Nair", role: "Meera's father · Guardian on" },
  { id: "buyer", name: "Arjun Menon", role: "Buying a camera" },
  { id: "client", name: "Dana Brooks", role: "Client · Northwind Studio" },
  { id: "agent", name: "Priya", role: "Support specialist" },
];

/** Persona pill ("Meera") that opens the demo account switcher. */
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
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        aria-haspopup="menu" aria-expanded={open} aria-label={`Viewing as ${me.name}. Switch person`}
        onClick={() => setOpen(!open)}
        className="press flex h-10 items-center gap-1.5 rounded-control bg-raised px-3.5 text-[14px] font-bold hover:bg-border lg:h-11 lg:px-5 lg:text-[16px]"
      >
        {me.name.split(" ")[0]}
        <ChevronDown size={15} aria-hidden className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="arrive float absolute right-0 top-full z-50 mt-2 w-[290px] rounded-panel border border-border bg-card p-1.5">
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
            <Link href="/demo" onClick={() => setOpen(false)} role="menuitem" className="press flex items-center gap-3 rounded-control px-2 py-2 text-[14px] hover:bg-raised">
              <FlaskConical size={16} className="text-muted" aria-hidden /> Demo controls
            </Link>
            {modes && <p className="px-2 pb-1.5 text-[12px] text-muted">{modes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Dark / light switch. Stores the choice in the "theme" cookie; the layout reads it server-side. */
export function ThemeToggle({ theme }: { theme: "dark" | "light" }) {
  const [t, setT] = useState(theme);
  const next = t === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.dataset.theme = next;
        document.querySelector("meta[name=theme-color]")?.setAttribute("content", next === "dark" ? "#0a0a0a" : "#f7f8fa");
        setT(next);
      }}
      aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      className="press flex h-11 w-11 items-center justify-center rounded-control text-fg hover:bg-raised"
    >
      {t === "dark" ? <Sun size={21} aria-hidden /> : <Moon size={21} aria-hidden />}
    </button>
  );
}

/** Search payments, invoices and cases: searches your alerts (which name every payment, invoice and case event). */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form role="search" className="relative w-full max-w-[640px]" onSubmit={(e) => { e.preventDefault(); router.push(q.trim() ? `/alerts?q=${encodeURIComponent(q.trim())}` : "/alerts"); }}>
      <Search size={19} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <label htmlFor="global-search" className="sr-only">Search payments, invoices, cases</label>
      <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments, invoices, cases"
        className="h-11 w-full rounded-control border border-border bg-raised pl-11 pr-4 text-[15px] text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40" />
    </form>
  );
}

/** Polls a cheap version number and refreshes server data when something changed elsewhere. */
export function LiveRefresh({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  const last = useRef<number | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const s = await api<{ version: number }>("/api/state");
        if (last.current !== null && s.version !== last.current) router.refresh();
        last.current = s.version;
      } catch {
        /* offline */
      }
    }, every);
    return () => clearInterval(t);
  }, [every, router]);
  return null;
}

export function CopyButton({ text, label = "Copy", variant = "secondary" }: { text: string; label?: string; variant?: ButtonVariant }) {
  const [done, setDone] = useState(false);
  return (
    <button className={buttonClass(variant)} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? <><Check size={16} aria-hidden /> Copied</> : label}</button>
  );
}

