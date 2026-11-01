import { describe, it, expect } from "vitest";
import { compareBilling, convert, estimateFees, FALLBACK_RATES } from "@/lib/fx";

describe("FX copilot", () => {
  it("converts through USD", () => {
    expect(convert(100, "USD", "INR", FALLBACK_RATES)).toBeCloseTo(8820, 0);
    expect(convert(100, "INR", "INR", FALLBACK_RATES)).toBe(100);
  });
  it("estimates fees as percent + fixed", () => {
    const f = estimateFees(100, "USD", "cross_border");
    expect(f.fee).toBeCloseTo(4.7, 2);
    expect(f.net).toBeCloseTo(95.3, 2);
  });
  it("recommends the client's currency when another option would raise their cost", () => {
    const r = compareBilling(1000, "GBP", "INR", FALLBACK_RATES);
    expect(r.recommended).toBe("GBP");
    const inr = r.options.find((o) => o.billCurrency === "INR")!;
    expect(inr.clientExtraPercent).toBeGreaterThan(0);
    expect(inr.netHome).toBeGreaterThan(r.options.find((o) => o.billCurrency === "GBP")!.netHome);
    expect(r.reason).toMatch(/absorbs the conversion/);
  });
  it("never shows a net larger than the invoice value", () => {
    const r = compareBilling(500, "USD", "INR", FALLBACK_RATES);
    for (const o of r.options) expect(o.netHome).toBeLessThan(convert(500, "USD", "INR", FALLBACK_RATES));
  });
});
