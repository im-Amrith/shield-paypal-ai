import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db, mutate } from "@/lib/store";
import { startCase, customerMessage, humanDecision, humanTakeover, humanMessage, classifyRules } from "@/lib/support";
import { simulateLimitation } from "@/lib/risk";

describe("Resolve: tiered support", () => {
  beforeEach(() => resetDB());

  it("Tier 1 troubleshoots with cited KB steps", async () => {
    const c = await startCase("ravi", "I paid for wireless earbuds from GadgetHub 12 days ago and they never arrived");
    expect(c.category).toBe("refund");
    expect(c.tier).toBe(1);
    const reply = c.messages.at(-1)!;
    expect(reply.from).toBe("tier1");
    expect(reply.sources?.[0].id).toBe("kb-not-received");
  });

  it("escalates to Tier 2, which needs a human for a 79 USD refund, then refunds after approval", async () => {
    let c = await startCase("ravi", "My GadgetHub earbuds order never arrived, I want a refund");
    c = await customerMessage(c.id, "I already messaged the seller, no reply. That didn't work");
    expect(c.tier).toBe(2);
    expect(c.status).toBe("waiting_human");
    const refund = c.actions.find((a) => a.tool === "issue_refund")!;
    expect(refund.decision).toBe("needs_human");
    expect(refund.args.amount).toBe(79);
    // The agent can't do it on its own, even if the customer says yes.
    c = await customerMessage(c.id, "yes go ahead");
    expect(db().cases[0].actions.find((a) => a.id === refund.id)!.status).toBe("pending");
    c = await humanDecision(c.id, refund.id, true);
    expect(c.status).toBe("resolved");
    expect(db().transactions.find((t) => t.memo?.includes("GH-2231"))!.refunded).toBe(true);
  });

  it("asks the customer before a small refund and acts on 'yes'", async () => {
    mutate((d) => {
      d.policies.find((p) => p.userId === "ravi")!.refundHumanAbove = 100;
    });
    let c = await startCase("ravi", "GadgetHub earbuds never arrived");
    c = await customerMessage(c.id, "no, still not resolved");
    const refund = c.actions.find((a) => a.tool === "issue_refund")!;
    expect(refund.decision).toBe("ask_customer");
    expect(c.status).toBe("waiting_customer");
    c = await customerMessage(c.id, "yes please");
    expect(c.status).toBe("resolved");
    expect(c.messages.at(-1)!.text).toMatch(/Refund/);
  });

  it("customer 'no' declines the proposed action", async () => {
    mutate((d) => {
      d.policies.find((p) => p.userId === "ravi")!.refundHumanAbove = 100;
    });
    let c = await startCase("ravi", "GadgetHub earbuds never arrived");
    c = await customerMessage(c.id, "didn't work");
    c = await customerMessage(c.id, "no wait");
    expect(c.actions.find((a) => a.tool === "issue_refund")!.status).toBe("denied");
  });

  it("goes straight to a human when asked, with a summary", async () => {
    const c = await startCase("ravi", "I want to talk to a real person please");
    expect(c.status).toBe("waiting_human");
    expect(c.summary.length).toBeGreaterThan(10);
    expect(db().notifications.some((n) => n.userId === "agent")).toBe(true);
  });

  it("human takeover silences the AI", async () => {
    let c = await startCase("ravi", "GadgetHub earbuds never arrived");
    humanTakeover(c.id);
    c = await customerMessage(c.id, "hello?");
    expect(c.messages.at(-1)!.from).toBe("customer");
    c = humanMessage(c.id, "Hi Ravi, Priya here. I'm on it.");
    expect(c.messages.at(-1)!.from).toBe("human");
  });

  it("limitation cases explain the reason and route the lift to a human", async () => {
    await simulateLimitation("meera");
    const c = await startCase("meera", "Why is my account limited? My money is frozen");
    expect(c.category).toBe("limitation");
    expect(c.actions.find((a) => a.tool === "lift_limitation")!.decision).toBe("needs_human");
    expect(c.messages.some((m) => /Unusual increase|dispute|Friends/.test(m.text))).toBe(true);
  });

  it("resolved cases can be reopened without losing history", async () => {
    let c = await startCase("ravi", "How do I stop an automatic payment?");
    c = await customerMessage(c.id, "thanks that worked");
    expect(c.status).toBe("resolved");
    const n = c.messages.length;
    c = await customerMessage(c.id, "They charged me again!");
    expect(db().cases[0].status).not.toBe("resolved");
    expect(db().cases[0].messages.length).toBeGreaterThan(n);
  });

  it("classifies common phrasings", () => {
    expect(classifyRules("someone hacked my account and sent money")).toBe("unauthorized");
    expect(classifyRules("StreamMax keeps charging me every month")).toBe("subscription");
    expect(classifyRules("my withdrawal to bank hasn't arrived")).toBe("withdrawal");
  });
});
