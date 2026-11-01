import { describe, it, expect } from "vitest";
import { decideTool, decideSpend } from "@/lib/policy";
import type { Policy } from "@/lib/types";

const p: Policy = { userId: "ravi", perOrderCap: 100, monthlyCap: 250, autoApproveBelow: 25, refundHumanAbove: 50, revoked: false };

describe("policy engine", () => {
  it("auto-runs read-only tools", () => expect(decideTool("lookup_transactions", {}, p).decision).toBe("auto"));
  it("asks the customer before small refunds", () => expect(decideTool("issue_refund", { amount: 30 }, p).decision).toBe("ask_customer"));
  it("needs a human for refunds above the limit", () => expect(decideTool("issue_refund", { amount: 79 }, p).decision).toBe("needs_human"));
  it("treats a refund without an amount as large", () => expect(decideTool("issue_refund", {}, p).decision).toBe("needs_human"));
  it("always needs a human to lift a limitation", () => expect(decideTool("lift_limitation", {}, p).decision).toBe("needs_human"));
  it("blocks security-sensitive tools", () => expect(decideTool("change_account_email", {}, p).decision).toBe("blocked"));
  it("blocks unknown tools", () => expect(decideTool("drop_database", {}, p).decision).toBe("blocked"));
  it("blocks everything but reads when revoked", () => {
    const r = { ...p, revoked: true };
    expect(decideTool("resend_receipt", {}, r).decision).toBe("blocked");
    expect(decideTool("lookup_transactions", {}, r).decision).toBe("auto");
  });
  it("enforces spending caps", () => {
    expect(decideSpend(20, 0, p).decision).toBe("auto");
    expect(decideSpend(60, 0, p).decision).toBe("ask_customer");
    expect(decideSpend(120, 0, p).decision).toBe("blocked");
    expect(decideSpend(60, 220, p).decision).toBe("blocked");
    expect(decideSpend(-5, 0, p).decision).toBe("blocked");
  });
});
