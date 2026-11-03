// The shared guardrails engine. Guardian, Vault, the shopping agent and the
// Tier 2 support agent all ask this one place: proceed, ask, escalate, or block?
import type { Policy } from "./types";

export type Decision = "auto" | "ask_customer" | "needs_human" | "blocked";

export interface ToolSpec {
  name: string;
  description: string;
  risk: "read" | "low" | "money" | "account" | "forbidden";
  irreversible: boolean;
}

export const TOOLS: Record<string, ToolSpec> = {
  lookup_transactions: { name: "lookup_transactions", description: "Look up the customer's recent transactions", risk: "read", irreversible: false },
  get_order: { name: "get_order", description: "Fetch a PayPal order's status", risk: "read", irreversible: false },
  list_disputes: { name: "list_disputes", description: "List open disputes", risk: "read", irreversible: false },
  resend_receipt: { name: "resend_receipt", description: "Email the receipt again", risk: "low", irreversible: false },
  reopen_case: { name: "reopen_case", description: "Reopen a closed case and attach new evidence", risk: "low", irreversible: false },
  cancel_invoice: { name: "cancel_invoice", description: "Cancel an unpaid invoice", risk: "low", irreversible: true },
  cancel_subscription: { name: "cancel_subscription", description: "Cancel an automatic payment to a merchant", risk: "low", irreversible: true },
  open_dispute: { name: "open_dispute", description: "Open a dispute on a transaction for the customer", risk: "low", irreversible: false },
  issue_refund: { name: "issue_refund", description: "Refund a captured payment", risk: "money", irreversible: true },
  release_vault: { name: "release_vault", description: "Release Vault funds to the seller", risk: "money", irreversible: true },
  lift_limitation: { name: "lift_limitation", description: "Lift an account limitation or hold", risk: "account", irreversible: false },
  change_account_email: { name: "change_account_email", description: "Change login email", risk: "forbidden", irreversible: true },
};

/** Decide what an agent may do with a tool call. */
export function decideTool(tool: string, args: { amount?: number }, policy: Policy): { decision: Decision; reason: string } {
  const spec = TOOLS[tool];
  if (!spec) return { decision: "blocked", reason: `Unknown tool "${tool}"` };
  if (policy.revoked && spec.risk !== "read") return { decision: "blocked", reason: "The customer revoked agent permissions" };
  switch (spec.risk) {
    case "read":
      return { decision: "auto", reason: "Read-only lookup" };
    case "low":
      return spec.irreversible
        ? { decision: "ask_customer", reason: "Can't be undone, so the customer confirms first" }
        : { decision: "auto", reason: "Low-risk and reversible" };
    case "money": {
      const amt = args.amount ?? Infinity;
      if (amt > policy.refundHumanAbove)
        return { decision: "needs_human", reason: `Moves ${amt.toFixed(2)}, above the ${policy.refundHumanAbove} limit for AI-only approval` };
      return { decision: "ask_customer", reason: "Moves money; the customer confirms first" };
    }
    case "account":
      return { decision: "needs_human", reason: "Account-level changes need a human reviewer" };
    case "forbidden":
      return { decision: "blocked", reason: "Security-sensitive; the customer must do this themselves" };
  }
}

/** Spending guardrail for agents that buy things (shopping agent). */
export function decideSpend(amount: number, spentThisMonth: number, policy: Policy): { decision: Decision; reason: string } {
  if (policy.revoked) return { decision: "blocked", reason: "Agent permissions are revoked" };
  if (!Number.isFinite(amount) || amount <= 0) return { decision: "blocked", reason: "Invalid amount" };
  if (spentThisMonth + amount > policy.monthlyCap)
    return { decision: "blocked", reason: `Would exceed the monthly cap of ${policy.monthlyCap} (spent ${spentThisMonth.toFixed(2)})` };
  if (amount > policy.perOrderCap) return { decision: "blocked", reason: `Above the per-order cap of ${policy.perOrderCap}` };
  if (amount > policy.autoApproveBelow) return { decision: "ask_customer", reason: `Above ${policy.autoApproveBelow}, needs one-tap approval` };
  return { decision: "auto", reason: "Within caps" };
}
