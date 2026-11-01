"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, buttonClass, inputClass } from "./client";

export function ConsoleReply({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      try { await api("/api/support", { action: "human_message", caseId, text }); setText(""); router.refresh(); } catch (e) { setErr((e as Error).message); }
    }}>
      <input aria-label="Reply to customer" className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as Priya…" />
      <button className={buttonClass("primary")} disabled={!text.trim()}>Send</button>
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </form>
  );
}
