"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, ArrowUp, Volume2, VolumeX, BookOpen, ShieldCheck } from "lucide-react";
import type { SupportCase } from "@/lib/types";
import { api, buttonClass, Spinner } from "./client";
import { WHO } from "./caseStatus";

const LANGS = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ml-IN", label: "മലയാളം" },
];

const STARTERS = [
  "I paid for wireless earbuds from GadgetHub 12 days ago and they never arrived",
  "Why is my account limited? My money is frozen",
  "StreamMax keeps charging me every month",
];

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export function SupportChat({ initial, big }: { initial: SupportCase | null; big?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const c = initial;
  const spoken = useRef(c?.messages.length ?? 0);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [c?.messages.length, pending]);
  useEffect(() => { setPending(null); }, [c?.messages.length]);

  // Read new agent replies aloud in the chosen language.
  useEffect(() => {
    if (!c) return;
    const fresh = c.messages.slice(spoken.current).filter((m) => m.from !== "customer" && m.from !== "system");
    spoken.current = c.messages.length;
    if (!speak || !fresh.length || typeof window === "undefined" || !window.speechSynthesis) return;
    for (const m of fresh) {
      const u = new SpeechSynthesisUtterance(m.text.replace(/\n+/g, ". "));
      u.lang = lang;
      window.speechSynthesis.speak(u);
    }
  }, [c, speak, lang]);

  const send = async (msg: string) => {
    if (!msg.trim()) return;
    setBusy(true); setErr(null); setPending(msg);
    try {
      setText("");
      if (!c) {
        const r = await api<SupportCase>("/api/support", { action: "start", text: msg, lang });
        router.push(`/support?case=${r.id}`);
      } else {
        await api("/api/support", { action: "message", caseId: c.id, text: msg, lang });
        router.refresh();
      }
    } catch (e) { setErr((e as Error).message); setPending(null); setText(msg); } finally { setBusy(false); }
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("Voice input needs Chrome on Android or desktop, or Safari."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.onresult = (e: any) => setText(Array.from(e.results).map((r: any) => r[0].transcript).join(" "));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const pendingAsk = c?.actions.find((a) => a.decision === "ask_customer" && a.status === "pending");
  const fs = big ? "text-[17px]" : "text-[15px]";

  return (
    <div className="flex flex-col rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="font-extrabold capitalize">{c ? c.category.replace(/_/g, " ") : "New conversation"}</span>
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="lang">Language</label>
          <select id="lang" className="h-10 rounded-control border border-border bg-raised px-2 text-[14px] text-fg" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button className="press flex h-10 w-10 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-fg" onClick={() => setSpeak(!speak)} aria-pressed={speak} aria-label={speak ? "Stop reading replies aloud" : "Read replies aloud"} title={speak ? "Reading replies aloud" : "Read replies aloud"}>
            {speak ? <Volume2 size={19} aria-hidden className="text-accent" /> : <VolumeX size={19} aria-hidden />}
          </button>
        </div>
      </div>

      <div className={`flex-1 space-y-3 px-4 py-5 sm:px-5 ${fs}`} aria-live="polite">
        {!c && (
          <div>
            <p className={`font-extrabold ${big ? "text-[19px]" : "text-[17px]"}`}>What&apos;s wrong? Type it, or tap the mic and say it.</p>
            <p className="mt-1 flex items-start gap-2 text-muted"><ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-success" />You&apos;ll never be asked for a password or OTP. Every action on your account needs your OK.</p>
            <div className="mt-4 grid gap-2">
              {STARTERS.map((s) => (
                <button key={s} disabled={busy} className="press rounded-panel border border-border bg-raised px-4 py-3 text-left font-semibold hover:border-accent/60 disabled:opacity-50" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {c?.messages.map((m, i) => m.from === "system" ? (
          <p key={i} className="py-1 text-center text-[13px] text-muted">{m.text}</p>
        ) : m.from === "customer" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-accent px-4 py-2.5 font-semibold text-on-accent">
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className="mt-1 text-right text-[12px] font-medium opacity-75">{time(m.at)}</p>
            </div>
          </div>
        ) : (
          <div key={i} className="flex justify-start">
            <div className={`max-w-[88%] rounded-[18px] rounded-bl-[6px] bg-raised px-4 py-2.5 ${m.from === "human" ? "border border-accent/50" : ""}`}>
              <p className="mb-0.5 text-[13px] font-bold">{WHO[m.from]} <span className="font-medium text-muted">· {time(m.at)}</span></p>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.sources && m.sources.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-[13px] text-muted"><BookOpen size={14} aria-hidden className="mt-0.5 shrink-0" />{m.sources.map((s) => s.title).join(" · ")}</p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-end"><div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-accent/80 px-4 py-2.5 font-semibold text-on-accent"><p className="whitespace-pre-wrap">{pending}</p></div></div>
            <div className="flex items-center gap-2 text-[14px] text-muted"><Spinner /> Shield is looking into it…</div>
          </>
        )}
        <div ref={endRef} />
      </div>

      {pendingAsk && !pending && (
        <div className="arrive mx-4 mb-4 rounded-panel border-l-4 border-accent bg-accent-tint p-4 sm:mx-5">
          <p className="font-extrabold">{pendingAsk.summary}?</p>
          <p className="mt-0.5 text-[14px] text-muted">{pendingAsk.reason}</p>
          <div className="mt-3 flex gap-2">
            <button className={buttonClass("primary")} disabled={busy} onClick={() => send("yes")}>Yes, do it</button>
            <button className={buttonClass("secondary")} disabled={busy} onClick={() => send("no")}>No</button>
          </div>
        </div>
      )}

      <form className="sticky bottom-[64px] flex items-end gap-2 rounded-b-card border-t border-border bg-card p-3 lg:bottom-0" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <button type="button" onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak your message"} aria-pressed={listening}
          className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "bg-danger text-white" : "bg-raised text-fg hover:bg-border"}`}>
          {listening ? <Square size={16} aria-hidden fill="currentColor" /> : <Mic size={19} aria-hidden />}
        </button>
        <label htmlFor="msg" className="sr-only">Message</label>
        <textarea id="msg" rows={1} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          placeholder={listening ? "Listening…" : c?.status === "resolved" ? "Reply to reopen this case" : "Type a message"}
          className={`max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-border bg-raised px-4 py-2.5 ${fs} text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40`} />
        <button className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40" disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Spinner /> : <ArrowUp size={20} strokeWidth={2.5} aria-hidden />}
        </button>
      </form>
      {err && <p role="alert" className="px-4 pb-3 text-[14px] text-danger">{err}</p>}
    </div>
  );
}
