// Resolve: tiered AI support.
//  Tier 1 (triage) understands the problem and troubleshoots from the KB.
//  Tier 2 (resolution) can use PayPal tools, but every call goes through the
//  policy engine: read-only runs, small actions ask the customer, risky ones
//  wait for a human in the support console. A human can also take over.
import type { Persona, ProposedAction, SupportCase, SupportMessage, Transaction } from "./types";
import { db, mutate, uid } from "./store";
import { nowIso } from "./clock";
import { retrieve, KB, type Article } from "./kb";
import { complete, completeJSON, llmProvider } from "./llm";
import { decideTool, TOOLS } from "./policy";
import * as paypal from "./paypal";
import { explainLimitation, liftLimitation } from "./risk";
import { notify } from "./notify";

export const CATEGORIES = ["refund", "unauthorized", "limitation", "subscription", "payment_pending", "withdrawal", "fees", "scam", "dispute", "login", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

const WANTS_HUMAN = /\b(human|real person|agent|representative|someone real|talk to (a )?person|call me|supervisor|manager)\b/i;
const NEGATIVE = /\b(no|nope|didn'?t (work|help)|not (working|resolved|fixed|helpful)|still|same problem|doesn'?t help|tried (that|it|already)|useless|already did)\b/i;
const POSITIVE = /\b(yes|yeah|yep|worked|fixed|solved|thanks|thank you|great|perfect|resolved)\b/i;
const CONFIRM = /^\s*(yes|yeah|yep|ok|okay|sure|go ahead|confirm|please do|do it|approve|haan|ha|athe|sari)\b/i;
const DECLINE = /^\s*(no|nope|don'?t|do not|cancel|stop|wait)\b/i;

/** Rule-based classifier (the eval baseline); the LLM refines it when present. */
export function classifyRules(text: string): Category {
  const t = text.toLowerCase();
  if (/didn'?t (make|authori[sz]e)|not me|hacked|unauthori[sz]ed|someone (used|logged)|don'?t recogni[sz]e|unknown (charge|payment)/.test(t)) return "unauthorized";
  if (/scam|scammed|tricked|gift card|fake (seller|buyer|website)|phishing|tax office|otp/.test(t)) return "scam";
  if (/limit(ed|ation)|frozen|freeze|locked my (account|money|funds)|restricted|suspended|180 days|account (is )?on hold/.test(t)) return "limitation";
  if (/subscription|automatic payment|recurring|auto[- ]?pay|renew(al|ed)|keeps charging|charged (me )?(again|every month)|cancel(led)? .*(still|again)/.test(t)) return "subscription";
  if (/withdraw|transfer to (my )?bank|bank (transfer|hasn'?t)|payout/.test(t)) return "withdrawal";
  if (/dispute|claim|chargeback|buyer (opened|filed)|seller protection/.test(t)) return "dispute";
  if (/never (arrived|received|came|got)|not (arrived|received|delivered)|didn'?t (arrive|receive|get)|refund|money back|wrong item|damaged|not as described/.test(t)) return "refund";
  if (/pending|on hold|unclaimed|when will .* (available|clear)/.test(t)) return "payment_pending";
  if (/\bfees?\b|conversion|exchange rate|charged more|deducted|how much does paypal (take|charge|keep)/.test(t)) return "fees";
  if (/log ?in|password|locked out|can'?t sign in|verification code|2fa/.test(t)) return "login";
  const top = retrieve(text, 1)[0];
  return (top?.article.category as Category) || "other";
}

export async function classify(text: string): Promise<Category> {
  const rules = classifyRules(text);
  if (llmProvider() === "none") return rules;
  const ai = await completeJSON<{ category: string }>(
    `Classify a PayPal customer's support message into exactly one category: ${CATEGORIES.join(", ")}.
"refund" = paid for something not received / wrong. "unauthorized" = payment they didn't make. "limitation" = account limited or funds held by PayPal. "subscription" = recurring charges. "scam" = they were tricked into paying.
The message may be in Hindi, Malayalam or English. Return {"category": "..."}.`,
    text,
    { maxTokens: 50 },
  );
  return ai && (CATEGORIES as readonly string[]).includes(ai.category) ? (ai.category as Category) : rules;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function push(caseId: string, msg: Omit<SupportMessage, "at">, patch?: (c: SupportCase) => void): SupportCase {
  return mutate((d) => {
    const c = d.cases.find((x) => x.id === caseId)!;
    c.messages.push({ at: nowIso(), ...msg });
    c.updatedAt = nowIso();
    patch?.(c);
    return structuredClone(c);
  });
}

function timeline(c: SupportCase, label: string) {
  c.timeline.push({ at: nowIso(), label });
}

const LANG_NAME: Record<string, string> = { "en-IN": "English", "hi-IN": "Hindi", "ml-IN": "Malayalam", en: "English" };

async function tier1Reply(text: string, category: Category, lang: string, history: SupportMessage[]): Promise<{ text: string; sources: Article[] }> {
  const ranked = retrieve(text, 2);
  // Keep a second article only if it is nearly as relevant as the first.
  const hits = ranked.filter((h, i) => i === 0 || h.score >= ranked[0].score * 0.6).map((h) => h.article);
  const fromCategory = KB.find((a) => a.category === category);
  const sources = hits.length ? hits : fromCategory ? [fromCategory] : [];
  const fallback = sources.length
    ? `Here's what usually fixes this (from "${sources[0].title}"):\n${sources[0].steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nDid that solve it? If not, tell me what happened and I'll bring in our resolution agent, who can act on your account.`
    : "I want to make sure I understand. Could you tell me what happened, which payment it's about, and when?";
  if (llmProvider() === "none") return { text: fallback, sources };
  const ai = await complete(
    `You are Shield's Tier 1 PayPal support agent. Be warm, brief and concrete. Reply in ${LANG_NAME[lang] || "the customer's language"}.
Use ONLY these help articles for troubleshooting steps; don't invent policies or numbers:
${sources.map((a) => `[${a.id}] ${a.title}\n- ${a.steps.join("\n- ")}`).join("\n\n")}
Give at most 4 numbered steps, then ask whether it solved the problem. Never ask for passwords, OTPs or card numbers.`,
    [...history.slice(-6).map((m) => ({ role: (m.from === "customer" ? "user" : "assistant") as "user" | "assistant", content: m.text })), { role: "user", content: text }],
    { maxTokens: 400 },
  );
  return { text: ai?.trim() || fallback, sources };
}

export async function startCase(customerId: Persona, text: string, lang = "en-IN"): Promise<SupportCase> {
  if (!text.trim()) throw new Error("Tell us what's wrong");
  const category = await classify(text);
  const c: SupportCase = {
    id: uid("case"), customerId, createdAt: nowIso(), updatedAt: nowIso(), tier: 1, status: "open", category,
    summary: text.slice(0, 140), messages: [{ at: nowIso(), from: "customer", text }], actions: [], troubleshootAttempts: 0,
    timeline: [{ at: nowIso(), label: `Case opened · ${category.replace("_", " ")}` }],
  };
  mutate((d) => {
    d.cases.unshift(c);
  });
  if (WANTS_HUMAN.test(text)) return requestHuman(c.id, "Customer asked for a person");
  // Account-level and money problems that troubleshooting can't fix go straight to Tier 2.
  if (category === "limitation" || category === "unauthorized") {
    const r = await tier1Reply(text, category, lang, []);
    push(c.id, { from: "tier1", text: r.text, sources: r.sources.map((a) => ({ id: a.id, title: a.title })) }, (x) => {
      x.troubleshootAttempts = 1;
    });
    return escalateTier2(c.id, lang);
  }
  const r = await tier1Reply(text, category, lang, []);
  return push(c.id, { from: "tier1", text: r.text, sources: r.sources.map((a) => ({ id: a.id, title: a.title })) }, (x) => {
    x.troubleshootAttempts = 1;
    x.status = "waiting_customer";
  });
}

export async function customerMessage(caseId: string, text: string, lang = "en-IN"): Promise<SupportCase> {
  const c0 = db().cases.find((x) => x.id === caseId);
  if (!c0) throw new Error("Case not found");
  if (c0.status === "resolved") {
    push(caseId, { from: "customer", text }, (c) => {
      c.status = "reopened";
      timeline(c, "Reopened by customer");
    });
  } else push(caseId, { from: "customer", text });
  const c = db().cases.find((x) => x.id === caseId)!;

  if (c.tier === 3) return c; // a human is handling it; the console sees the message.
  if (WANTS_HUMAN.test(text)) return requestHuman(caseId, "Customer asked for a person");

  // Is the customer answering a confirmation request?
  const pendingAsk = c.actions.find((a) => a.decision === "ask_customer" && a.status === "pending");
  if (pendingAsk) {
    if (CONFIRM.test(text)) return executeAction(caseId, pendingAsk.id, "customer");
    if (DECLINE.test(text)) {
      return push(caseId, { from: "tier2", text: "Okay, I won't do that. Is there something else you'd like me to try, or shall I connect you with a person?" }, (x) => {
        x.actions.find((a) => a.id === pendingAsk.id)!.status = "denied";
      });
    }
  }

  if (POSITIVE.test(text) && !NEGATIVE.test(text) && c.tier === 1) {
    return push(caseId, { from: "tier1", text: "Glad that sorted it! I'll close this case. You can reopen it from here any time; nothing you've told us will be lost." }, (x) => {
      x.status = "resolved";
      timeline(x, "Resolved by Tier 1");
    });
  }

  if (c.tier === 1 && (NEGATIVE.test(text) || c.troubleshootAttempts >= 2)) return escalateTier2(caseId, lang);

  if (c.tier === 1) {
    const r = await tier1Reply(`${c.messages[0].text}\n${text}`, c.category as Category, lang, c.messages);
    return push(caseId, { from: "tier1", text: r.text, sources: r.sources.map((a) => ({ id: a.id, title: a.title })) }, (x) => {
      x.troubleshootAttempts += 1;
      x.status = "waiting_customer";
    });
  }
  return push(caseId, { from: "tier2", text: "Thanks, I've added that to your case. A specialist can see everything you've said, so you won't need to repeat yourself." });
}

function findTransaction(c: SupportCase, txs: Transaction[]): Transaction | undefined {
  const text = c.messages.filter((m) => m.from === "customer").map((m) => m.text).join(" ").toLowerCase();
  const mine = txs.filter((t) => t.userId === c.customerId && t.direction === "out" && !t.refunded).sort((a, b) => b.at.localeCompare(a.at));
  const named = mine.find((t) => {
    const words = `${t.counterparty} ${t.memo || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    return words.some((w) => text.includes(w));
  });
  if (named) return named;
  if (c.category === "subscription") return mine.find((t) => t.recurring);
  return mine.find((t) => t.amount >= 40);
}

function propose(caseId: string, tool: string, args: Record<string, unknown>, summary: string): ProposedAction {
  const customer = db().cases.find((x) => x.id === caseId)!.customerId;
  const policy = db().policies.find((p) => p.userId === customer) ?? { userId: customer, perOrderCap: 0, monthlyCap: 0, autoApproveBelow: 0, refundHumanAbove: 0, revoked: false };
  const { decision, reason } = decideTool(tool, args as { amount?: number }, policy);
  const action: ProposedAction = { id: uid("act"), tool, args, summary, decision, reason, status: decision === "blocked" ? "denied" : "pending" };
  mutate((d) => {
    d.cases.find((x) => x.id === caseId)!.actions.push(action);
  });
  return action;
}

export async function escalateTier2(caseId: string, lang = "en-IN"): Promise<SupportCase> {
  push(caseId, { from: "system", text: "Resolution agent joined. It can see your account and take actions, with your OK." }, (c) => {
    c.tier = 2;
    timeline(c, "Escalated to Tier 2 resolution agent");
  });
  const c = db().cases.find((x) => x.id === caseId)!;
  const tx = findTransaction(c, db().transactions);
  const lookups = propose(caseId, "lookup_transactions", { customer: c.customerId }, "Look up your recent payments");
  await executeAction(caseId, lookups.id, "policy", true);

  let plan: ProposedAction | null = null;
  let intro = "";
  switch (c.category) {
    case "refund":
    case "scam":
      if (tx) {
        intro = `I found your payment of ${tx.currency} ${tx.amount} to ${tx.counterparty} on ${new Date(tx.at).toDateString()}${tx.memo ? ` (${tx.memo})` : ""}.`;
        plan = propose(caseId, "issue_refund", { txId: tx.id, amount: tx.amount, currency: tx.currency, captureId: tx.captureId }, `Refund ${tx.currency} ${tx.amount} for ${tx.counterparty}`);
      }
      break;
    case "unauthorized":
      if (tx) {
        intro = `Your most likely unrecognized payment is ${tx.currency} ${tx.amount} to ${tx.counterparty}. Please also change your password now.`;
        plan = propose(caseId, "open_dispute", { txId: tx.id, reason: "unauthorized" }, `Report ${tx.currency} ${tx.amount} to ${tx.counterparty} as unauthorized`);
      }
      break;
    case "subscription":
      if (tx) {
        intro = `${tx.counterparty} has charged you ${tx.currency} ${tx.amount} repeatedly.`;
        plan = propose(caseId, "cancel_subscription", { merchant: tx.counterparty }, `Cancel automatic payments to ${tx.counterparty}`);
      }
      break;
    case "limitation": {
      const exp = await explainLimitation(c.customerId);
      intro = exp.limited
        ? `Your account was limited for "${exp.reason.title}". ${exp.reason.plain}`
        : "Your account isn't limited right now, but I can see what a reviewer would look at.";
      if (exp.limited) plan = propose(caseId, "lift_limitation", { customer: c.customerId, reason: exp.code }, "Review documents and lift the limitation");
      break;
    }
    case "dispute":
      plan = propose(caseId, "list_disputes", {}, "Check your open disputes");
      break;
  }

  if (!plan) return requestHuman(caseId, "No safe automated fix; needs a specialist");

  if (plan.decision === "auto") return executeAction(caseId, plan.id, "policy");
  if (plan.decision === "ask_customer") {
    return push(caseId, { from: "tier2", text: `${intro}\n\nI can ${lowerFirst(plan.summary)} now. ${plan.reason}. Shall I go ahead? (yes / no)` }, (x) => {
      x.status = "waiting_customer";
    });
  }
  if (plan.decision === "needs_human") {
    push(caseId, { from: "tier2", text: `${intro}\n\nThe fix is to ${lowerFirst(plan.summary)}. ${plan.reason}, so I've sent a summary to a support specialist for approval. You don't need to repeat anything. I'll update you here.` });
    return requestHuman(caseId, `Approval needed: ${plan.summary}`, true);
  }
  return push(caseId, { from: "tier2", text: `${intro}\n\nFor your security I can't ${lowerFirst(plan.summary)} for you: ${plan.reason}.` });
}

export async function requestHuman(caseId: string, why: string, quiet = false): Promise<SupportCase> {
  const summary = await summarize(caseId);
  const c = push(caseId, quiet ? { from: "system", text: "Waiting for a specialist." } : { from: "system", text: "I'm connecting you with a specialist. They'll see this whole conversation, so you won't have to repeat yourself." }, (x) => {
    x.status = "waiting_human";
    x.summary = summary;
    timeline(x, why);
  });
  await notify("agent", { kind: "support", title: `Case ${caseId}: ${why}`, body: summary, link: `/console?case=${caseId}` });
  return c;
}

export async function summarize(caseId: string): Promise<string> {
  const c = db().cases.find((x) => x.id === caseId)!;
  const customer = db().users.find((u) => u.id === c.customerId)!;
  const pending = c.actions.filter((a) => a.status === "pending");
  const template = `${customer.name} · ${c.category.replace("_", " ")} · ${c.messages.filter((m) => m.from === "customer").length} messages. Issue: "${c.messages[0].text.slice(0, 160)}". Tried: ${c.troubleshootAttempts} troubleshooting round(s).${pending.length ? ` Proposed: ${pending.map((a) => `${a.summary} (${a.reason})`).join("; ")}.` : ""}`;
  const ai = await complete(
    "Summarize this PayPal support case for a human specialist in 3 short lines: issue, what was tried, what decision is needed. No preamble.",
    [{ role: "user", content: `${template}\n\nTranscript:\n${c.messages.map((m) => `${m.from}: ${m.text}`).join("\n").slice(-4000)}` }],
    { maxTokens: 200 },
  );
  return ai?.trim() || template;
}

export async function executeAction(caseId: string, actionId: string, by: "customer" | "human" | "policy", silent = false): Promise<SupportCase> {
  const c = db().cases.find((x) => x.id === caseId)!;
  const action = c.actions.find((a) => a.id === actionId);
  if (!action) throw new Error("Action not found");
  if (action.status !== "pending" && action.status !== "approved") throw new Error(`Action already ${action.status}`);
  if (action.decision === "blocked") throw new Error("Blocked by policy");
  if (action.decision === "needs_human" && by !== "human") throw new Error("This action needs a human specialist's approval");
  if (action.decision === "ask_customer" && by === "policy") throw new Error("This action needs the customer's confirmation");
  if (!TOOLS[action.tool]) throw new Error("Unknown tool");

  let result = "";
  try {
    const a = action.args as Record<string, string & number>;
    switch (action.tool) {
      case "lookup_transactions": {
        const n = db().transactions.filter((t) => t.userId === c.customerId).length;
        result = `Read ${n} transactions`;
        break;
      }
      case "issue_refund": {
        const r = await paypal.refundCapture(a.captureId || "MOCKCAP", Number(a.amount), a.currency || "USD", `Refund for case ${caseId}`);
        mutate((d) => {
          const t = d.transactions.find((x) => x.id === a.txId);
          if (t) t.refunded = true;
          d.transactions.push({ id: uid("tx"), userId: c.customerId, at: nowIso(), amount: Number(a.amount), currency: a.currency || "USD", direction: "in",
            counterparty: t?.counterparty || "Refund", country: "IN", type: "refund", memo: `Refund ${r.refundId} (case ${caseId})` });
        });
        result = `Refund of ${a.currency || "USD"} ${Number(a.amount).toFixed(2)} issued to the original payment method (PayPal ref ${r.refundId})`;
        break;
      }
      case "open_dispute":
        mutate((d) => {
          const t = d.transactions.find((x) => x.id === a.txId);
          if (t) t.disputed = true;
        });
        result = "Reported as unauthorized; the payment is under investigation";
        break;
      case "cancel_subscription":
        result = `Automatic payments to ${a.merchant} cancelled. Also cancel your account on their site so they can't bill another way`;
        break;
      case "lift_limitation":
        liftLimitation(c.customerId);
        result = "Limitation lifted after document review";
        break;
      case "list_disputes": {
        const r = await paypal.listDisputes();
        result = `Checked disputes (${Array.isArray((r as { items?: unknown[] }).items) ? (r as { items: unknown[] }).items.length : 0} open)`;
        break;
      }
      default:
        result = "Done";
    }
  } catch (e) {
    mutate((d) => {
      const x = d.cases.find((y) => y.id === caseId)!.actions.find((y) => y.id === actionId)!;
      x.status = "failed";
      x.result = (e as Error).message;
    });
    return push(caseId, { from: "system", text: `That didn't go through (${(e as Error).message}). A specialist has been notified.` });
  }

  const resolves = action.tool !== "lookup_transactions" && action.tool !== "list_disputes";
  const updated = mutate((d) => {
    const cc = d.cases.find((y) => y.id === caseId)!;
    const x = cc.actions.find((y) => y.id === actionId)!;
    x.status = "executed";
    x.result = result;
    timeline(cc, `${action.summary} — ${by === "human" ? "approved by specialist" : by === "customer" ? "confirmed by customer" : "automatic"}`);
    return structuredClone(cc);
  });
  if (silent) return updated;
  return push(caseId, { from: by === "human" ? "human" : "tier2", text: `Done: ${result}.${resolves ? " Is there anything else I can help with?" : ""}` }, (x) => {
    if (resolves) {
      x.status = "resolved";
      timeline(x, "Resolved");
    }
  });
}

// ---------- Human console ----------

export async function humanDecision(caseId: string, actionId: string, approve: boolean, note?: string): Promise<SupportCase> {
  if (approve) {
    mutate((d) => {
      d.cases.find((x) => x.id === caseId)!.actions.find((a) => a.id === actionId)!.status = "approved";
    });
    return executeAction(caseId, actionId, "human");
  }
  return push(caseId, { from: "human", text: `A specialist reviewed this and couldn't approve it${note ? `: ${note}` : "."} They'll message you here with next steps.` }, (x) => {
    x.actions.find((a) => a.id === actionId)!.status = "denied";
    timeline(x, "Specialist declined the proposed action");
  });
}

export function humanTakeover(caseId: string, agentName = "Priya"): SupportCase {
  return push(caseId, { from: "system", text: `${agentName} from support has joined and the AI has stepped back. ${agentName} has the full summary.` }, (x) => {
    x.tier = 3;
    x.status = "open";
    timeline(x, `Taken over by ${agentName}`);
  });
}

export function humanMessage(caseId: string, text: string): SupportCase {
  if (!text.trim()) throw new Error("Empty message");
  return push(caseId, { from: "human", text });
}

export function resolveCase(caseId: string): SupportCase {
  return push(caseId, { from: "system", text: "Case resolved. You can reopen it any time." }, (x) => {
    x.status = "resolved";
    timeline(x, "Resolved");
  });
}
