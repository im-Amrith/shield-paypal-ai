import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { screenPayment, attemptPayment, decideHold } from "@/lib/guardian";

describe("Guardian mode", () => {
  beforeEach(() => resetDB());
  const history = () => db().transactions.filter((t) => t.userId === "ravi");

  it("lets a normal payment to a known payee through", () => {
    const s = screenPayment({ payee: "KSEB Electricity", amount: 24, currency: "USD", note: "bill" }, history());
    expect(s.hold).toBe(false);
  });
  it("holds a large payment to a new payee", () => {
    const s = screenPayment({ payee: "Ramesh K", amount: 300, currency: "USD", note: "loan" }, history());
    expect(s.hold).toBe(true);
    expect(s.reasons.join(" ")).toMatch(/First payment/);
  });
  it("holds a tax-office threat even at a modest amount", () => {
    const s = screenPayment({ payee: "IT Dept Officer", amount: 40, currency: "USD", note: "income tax penalty pay immediately or arrest" }, history());
    expect(s.hold).toBe(true);
    expect(s.riskScore).toBeGreaterThanOrEqual(50);
  });
  it("holds gift-card payments", () => {
    expect(screenPayment({ payee: "Apollo Pharmacy", amount: 20, currency: "USD", note: "", method: "gift_card" }, history()).hold).toBe(true);
  });
  it("notifies the guardian and records the hold, then approve sends it", async () => {
    const r = await attemptPayment("ravi", { payee: "Officer Sharma", amount: 500, currency: "USD", note: "customs duty for parcel seized, urgent" });
    expect(r.status).toBe("held");
    expect(db().notifications.some((n) => n.userId === "meera" && n.kind === "guardian")).toBe(true);
    const before = db().transactions.length;
    await decideHold(r.hold!.id, "approved");
    expect(db().transactions.length).toBe(before + 1);
    await expect(decideHold(r.hold!.id, "blocked")).rejects.toThrow(/already/);
  });
  it("blocking moves no money", async () => {
    const r = await attemptPayment("ravi", { payee: "My Darling Anna", amount: 900, currency: "USD", note: "i love you, hospital bills" });
    const before = db().transactions.length;
    await decideHold(r.hold!.id, "blocked");
    expect(db().transactions.length).toBe(before);
    expect(db().holds[0].status).toBe("blocked");
  });
});
