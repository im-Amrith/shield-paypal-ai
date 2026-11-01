"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

const btn = {
  primary: "bg-brand text-white hover:bg-brand/90",
  secondary: "border border-ink/15 bg-white text-ink hover:bg-ink/5",
  danger: "bg-danger text-white hover:bg-danger/90",
  safe: "bg-safe text-white hover:bg-safe/90",
};

export function buttonClass(variant: keyof typeof btn = "primary", full = false) {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 ${btn[variant]} ${full ? "w-full" : ""}`;
}

/** Button that POSTs to an API route, shows errors, then refreshes the page data. */
export function ActionButton({ path, body, children, variant = "primary", full, confirm, onDone, href }: {
  path: string; body: unknown; children: ReactNode; variant?: keyof typeof btn; full?: boolean; confirm?: string;
  onDone?: (data: unknown) => void; href?: (data: any) => string | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className={full ? "w-full" : ""}>
      <button
        className={buttonClass(variant, full)}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setErr(null);
          try {
            const data = await api(path, body);
            onDone?.(data);
            const to = href?.(data);
            if (to) router.push(to);
            else router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

const PEOPLE = [
  { id: "meera", label: "Meera · freelancer" },
  { id: "ravi", label: "Ravi · her father" },
  { id: "buyer", label: "Arjun · buyer" },
  { id: "client", label: "Dana · client" },
  { id: "agent", label: "Priya · support" },
];

export function PersonaSwitcher({ current }: { current: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs text-ink/60">
      <span className="sr-only">Viewing as</span>
      <select
        className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs font-medium text-ink"
        value={current}
        onChange={async (e) => {
          await api("/api/session", { persona: e.target.value });
          router.refresh();
        }}
      >
        {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
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

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className={buttonClass("secondary")} onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? "Copied" : label}</button>
  );
}

export const inputClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm placeholder:text-ink/35";
