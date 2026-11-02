"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Sun, Moon, Search } from "lucide-react";
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

