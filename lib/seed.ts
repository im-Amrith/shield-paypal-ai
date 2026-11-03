// Seed data for the demo story: Meera (freelance designer in Kochi) and her
// father Ravi (retired, uses Guardian mode).
import type { DB, Transaction } from "./types";

/**
 * Dana's email. Set SANDBOX_BUYER_EMAIL to your PayPal sandbox *personal* account so invoices land
 * in its sandbox inbox and can be paid there; otherwise an undelegated .demo address, which no
 * mail service can ever deliver to a real person.
 */
export function clientEmail(): string {
  return process.env.SANDBOX_BUYER_EMAIL?.trim() || "dana@northwind.demo";
}

const DAY = 86400_000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function seedDB(base = Date.now()): DB {
  const r = rng(42);
  const iso = (daysAgo: number) => new Date(base - daysAgo * DAY).toISOString();
  const tx: Transaction[] = [];
  let n = 0;
  const id = () => `tx_${(++n).toString().padStart(4, "0")}`;

  // Meera: steady income from 3 clients over 90 days (~2 payments/week).
  const clients = [
    { name: "Northwind Studio", country: "US" },
    { name: "Bluebird Apps", country: "GB" },
    { name: "Lumen Labs", country: "US" },
  ];
  for (let d = 90; d > 7; d -= 3 + Math.floor(r() * 2)) {
    const c = clients[Math.floor(r() * clients.length)];
    tx.push({
      id: id(), userId: "meera", at: iso(d), amount: Math.round(180 + r() * 220),
      currency: "USD", direction: "in", counterparty: c.name, country: c.country, type: "invoice",
    });
  }
  // Last 7 days: a launch-week spike from new countries (triggers risk signals).
  const spike = [
    { name: "Kaito Design KK", country: "JP", amt: 1450 },
    { name: "Studio Vargas", country: "BR", amt: 980 },
    { name: "Northwind Studio", country: "US", amt: 1200 },
    { name: "Hafen GmbH", country: "DE", amt: 1675 },
    { name: "Lumen Labs", country: "US", amt: 890 },
  ];
  spike.forEach((s, i) =>
    tx.push({
      id: id(), userId: "meera", at: iso(6 - i), amount: s.amt, currency: "USD",
      direction: "in", counterparty: s.name, country: s.country, type: "invoice",
    }),
  );
  // Two template sales paid as Friends & Family (a policy red flag) and one dispute.
  tx.push({ id: id(), userId: "meera", at: iso(4), amount: 45, currency: "USD", direction: "in",
    counterparty: "anon_buyer_77", country: "US", type: "friends_family", memo: "for the logo template" });
  tx.push({ id: id(), userId: "meera", at: iso(3), amount: 60, currency: "USD", direction: "in",
    counterparty: "pixelfan", country: "PH", type: "friends_family", memo: "figma kit pls send" });
  tx.push({ id: id(), userId: "meera", at: iso(2), amount: 980, currency: "USD", direction: "in",
    counterparty: "Studio Vargas", country: "BR", type: "invoice", disputed: true, memo: "dispute: work not as described" });

  // Ravi: small, regular, known payees.
  const raviPayees = [
    { name: "KSEB Electricity", amt: 22 },
    { name: "Apollo Pharmacy", amt: 15 },
    { name: "Meera (daughter)", amt: 50 },
    { name: "Mathrubhumi Subscription", amt: 6 },
  ];
  for (let d = 85; d > 1; d -= 6) {
    const p = raviPayees[Math.floor(r() * raviPayees.length)];
    tx.push({ id: id(), userId: "ravi", at: iso(d), amount: p.amt + Math.round(r() * 8), currency: "USD",
      direction: "out", counterparty: p.name, country: "IN", type: "goods_services" });
  }

  // Ravi's order that never arrived (the support demo) and a forgotten subscription.
  tx.push({ id: id(), userId: "ravi", at: iso(12), amount: 79, currency: "USD", direction: "out",
    counterparty: "GadgetHub Online", country: "IN", type: "goods_services", memo: "Order GH-2231 wireless earbuds", captureId: "MOCKCAP_GH2231" });
  for (const d of [62, 32, 2]) {
    tx.push({ id: id(), userId: "ravi", at: iso(d), amount: 12.99, currency: "USD", direction: "out",
      counterparty: "StreamMax Premium", country: "US", type: "goods_services", memo: "Monthly subscription", recurring: true });
  }

  return {
    version: 1,
    clockOffsetMs: 0,
    users: [
      { id: "meera", name: "Meera Nair", email: "meera.nair@shield.demo", role: "freelancer", currency: "INR", guardianOf: "ravi" },
      { id: "ravi", name: "Ravi Nair", email: "ravi.nair@shield.demo", role: "senior", currency: "INR", guardedBy: "meera" },
      { id: "client", name: "Dana Brooks (Northwind Studio)", email: clientEmail(), role: "client", currency: "USD" },
      { id: "buyer", name: "Arjun Menon", email: "arjun.menon@shield.demo", role: "buyer", currency: "INR" },
      { id: "agent", name: "Priya (Support)", email: "priya@shield.demo", role: "support", currency: "USD" },
    ],
    transactions: tx,
    notifications: [],
    vaultDeals: [],
    invoices: [],
    holds: [],
    cases: [],
    policies: [
      { userId: "meera", perOrderCap: 150, monthlyCap: 400, autoApproveBelow: 40, refundHumanAbove: 100, revoked: false },
      { userId: "ravi", perOrderCap: 100, monthlyCap: 250, autoApproveBelow: 25, refundHumanAbove: 50, revoked: false },
      { userId: "buyer", perOrderCap: 200, monthlyCap: 500, autoApproveBelow: 50, refundHumanAbove: 100, revoked: false },
    ],
    outbox: [],
    accountState: {},
  };
}
