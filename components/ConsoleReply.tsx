"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass, Spinner } from "./client";

export function ConsoleReply({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try { await api("/api/support", { action: "human_message", caseId, text }); setText(""); router.refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }}>
      <div className="flex gap-2">
        <label htmlFor="reply" className="sr-only">Reply to the customer</label>
        <input id="reply" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as Priya…" />
        <button className={buttonClass("primary")} disabled={busy || !text.trim()}>{busy ? <Spinner /> : "Send"}</button>
      </div>
      {err && <p role="alert" className="mt-1.5 text-[14px] text-danger">{err}</p>}
    </form>
  );
}
