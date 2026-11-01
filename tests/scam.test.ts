import { describe, it, expect } from "vitest";
import { scoreRules, checkScam } from "@/lib/scam";

describe("scam check (rules)", () => {
  it("flags a Friends & Family request and recommends Vault", () => {
    const r = scoreRules("Hi, still available? Please send via PayPal friends and family to avoid fees, I'll ship today.");
    expect(r.signals.map((s) => s.id)).toContain("ff_request");
    expect(r.level).not.toBe("low");
    expect(r.recommendVault).toBe(true);
  });
  it("scores a tax-office threat as high", () => {
    const r = scoreRules("This is the Income Tax department. Pay the penalty immediately with Google Play gift cards or a warrant for your arrest will be issued.");
    expect(r.level).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(75);
  });
  it("catches overpayment scams", () => {
    expect(scoreRules("I accidentally overpaid you by $300, please refund the difference to my cousin").signals.map((s) => s.id)).toContain("overpayment");
  });
  it("catches OTP requests", () => {
    expect(scoreRules("Share the OTP you just got so I can release your payment").level).toBe("high");
  });
  it("keeps an ordinary goods-and-services sale low", () => {
    const r = scoreRules("Camera is in good condition, I can send a PayPal invoice and you pay with goods and services. Can meet in Kochi too.");
    expect(r.level).toBe("low");
  });
  it("returns excerpts for every signal", () => {
    const r = scoreRules("URGENT: add me on WhatsApp and pay a deposit first");
    expect(r.signals.length).toBeGreaterThanOrEqual(2);
    for (const s of r.signals) expect(s.excerpt).toBeTruthy();
  });
  it("falls back to rules when no LLM is configured", async () => {
    const r = await checkScam("send as gift please");
    expect(r.source).toBe("rules");
  });
});
