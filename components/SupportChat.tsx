"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import type { SupportCase } from "@/lib/types";
import { api, buttonClass, inputClass } from "./client";

const LANGS = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ml-IN", label: "മലയാളം" },
];

const WHO: Record<string, string> = { customer: "You", tier1: "Shield · Tier 1", tier2: "Shield · Resolution agent", human: "Priya · Support", system: "" };

const STARTERS = [
  "I paid for wireless earbuds from GadgetHub 12 days ago and they never arrived",
  "Why is my account limited? My money is frozen",
  "StreamMax keeps charging me every month",
];

export function SupportChat({ initial }: { initial: SupportCase | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = initial;
  const spoken = useRef(c?.messages.length ?? 0);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [c?.messages.length]);

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
    setBusy(true); setErr(null);
    try {
      setText("");
      if (!c) {
        const r = await api<SupportCase>("/api/support", { action: "start", text: msg, lang });
        router.push(`/support?case=${r.id}`);
      } else {
        await api("/api/support", { action: "message", caseId: c.id, text: msg, lang });
        router.refresh();
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported in this browser. Try Chrome."); return; }
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <select aria-label="Language" className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button className="flex items-center gap-1 text-sm text-ink/70" onClick={() => setSpeak(!speak)} aria-pressed={speak}>
          {speak ? <Volume2 size={18} /> : <VolumeX size={18} />} {speak ? "Reading replies aloud" : "Read replies aloud"}
        </button>
      </div>

      {c && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand">Case {c.id.slice(-6)}</span>
          <span className="rounded-full bg-ink/5 px-2 py-0.5">{c.category.replace("_", " ")}</span>
          <span className="rounded-full bg-ink/5 px-2 py-0.5">{c.tier === 3 ? "With a person" : `Tier ${c.tier}`}</span>
          <span className={`rounded-full px-2 py-0.5 ${c.status === "resolved" ? "bg-safe-soft text-safe" : c.status === "waiting_human" ? "bg-warn-soft text-warn" : "bg-ink/5"}`}>{c.status.replace("_", " ")}</span>
        </div>
      )}

      <div className="space-y-2" aria-live="polite">
        {!c && (
          <div className="rounded-2xl border border-ink/10 bg-white p-4 text-sm">
            <p className="font-semibold">Tell us what's wrong — type or tap the mic.</p>
            <p className="mt-1 text-ink/60">You'll never be asked for a password or OTP. Every action on your account needs your OK, and big ones are checked by a person.</p>
            <div className="mt-3 flex flex-col gap-2">
              {STARTERS.map((s) => <button key={s} className="rounded-xl border border-ink/15 px-3 py-2 text-left text-xs" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {c?.messages.map((m, i) => m.from === "system" ? (
          <p key={i} className="py-1 text-center text-xs text-ink/50">{m.text}</p>
        ) : (
          <div key={i} className={`flex ${m.from === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "customer" ? "bg-brand text-white" : m.from === "human" ? "border border-safe/30 bg-safe-soft" : "border border-ink/10 bg-white"}`}>
              {m.from !== "customer" && <p className="mb-0.5 text-[11px] font-semibold text-ink/50">{WHO[m.from]}</p>}
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.sources && m.sources.length > 0 && <p className="mt-1 text-[11px] text-ink/50">Source: {m.sources.map((s) => s.title).join("; ")}</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {pendingAsk && (
        <div className="mt-3 rounded-2xl border border-brand/30 bg-brand-soft p-3">
          <p className="text-sm font-semibold">{pendingAsk.summary}?</p>
          <p className="text-xs text-ink/60">{pendingAsk.reason}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={buttonClass("primary")} disabled={busy} onClick={() => send("yes")}>Yes, do it</button>
            <button className={buttonClass("secondary")} disabled={busy} onClick={() => send("no")}>No</button>
          </div>
        </div>
      )}

      <form className="sticky bottom-20 mt-4 flex gap-2 bg-paper py-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <button type="button" onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak"} className={`${buttonClass(listening ? "danger" : "secondary")} px-3`}>
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input aria-label="Message" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : c?.status === "resolved" ? "Reopen this case…" : "Type a message"} />
        <button className={`${buttonClass("primary")} px-3`} disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}

      {c && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Case timeline</summary>
          <ol className="mt-2 space-y-1 text-xs text-ink/70">
            {c.timeline.map((t, i) => <li key={i}>{new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — {t.label}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
