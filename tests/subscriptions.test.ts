import { describe, it, expect } from "vitest";
import { findRecurring, cancellationEmail } from "@/lib/subscriptions";
import { seedDB } from "@/lib/seed";

describe("subscription finder", () => {
  const d = seedDB(Date.parse("2026-11-01T00:00:00Z"));
  const at = new Date("2026-11-01T00:00:00Z");
  it("finds the monthly StreamMax charge for Ravi", () => {
    const r = findRecurring(d.transactions.filter((t) => t.userId === "ravi"), at);
    const s = r.find((x) => x.merchant === "StreamMax Premium");
    expect(s).toBeTruthy();
    expect(s!.cadenceDays).toBe(30);
    expect(s!.yearlyCost).toBeCloseTo(158.04, 1);
  });
  it("ignores one-off and irregular payments", () => {
    const r = findRecurring(d.transactions.filter((t) => t.userId === "ravi"), at);
    expect(r.find((x) => x.merchant === "GadgetHub Online")).toBeUndefined();
  });
  it("drafts a cancellation email with the facts", () => {
    const r = findRecurring(d.transactions.filter((t) => t.userId === "ravi"), at)[0];
    const e = cancellationEmail(r, "Ravi Nair", "ravi@example.com");
    expect(e.body).toContain("ravi@example.com");
    expect(e.body).toContain(r.amount.toFixed(2));
  });
});
