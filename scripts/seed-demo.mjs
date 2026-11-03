// Puts the running app into the state shown in the design references.
const BASE = process.env.BASE || "http://localhost:3000";
const call = async (persona, path, body) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie: `persona=${persona}` }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw new Error(`${path}: ${j.error}`); return j.data;
};
await call("meera", "/api/demo", { action: "reset" });
const inv1 = await call("meera", "/api/invoices", { action: "create", clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.demo", relationship: "regular", items: [{ name: "Brand identity, final files", amount: 800 }], currency: "USD", dueInDays: 14, lateFeePercent: 2, offerPayLater: true });
await call("client", "/api/invoices", { action: "pay", id: inv1.id, amount: 800 });
await call("meera", "/api/invoices", { action: "create", clientName: "Dana Brooks (Northwind Studio)", clientEmail: "dana@northwind.demo", relationship: "regular", items: [{ name: "Packaging system, phase 2", amount: 1200 }], currency: "USD", dueInDays: 10, lateFeePercent: 2, offerPayLater: true });
const v = await call("meera", "/api/vault", { action: "create", title: "Canon 200D camera with 18-55 lens", amount: 320, currency: "USD" });
await call("buyer", "/api/vault", { action: "authorize", id: v.deal.id });
await call("meera", "/api/vault", { action: "ship", id: v.deal.id, trackingNumber: "EZ123456789IN", carrier: "India Post" });
// Shopping agent: one cart bought automatically, one waiting for approval, one blocked by a cap.
await call("meera", "/api/shop", { action: "plan", need: "a 55 inch TV" });
await call("meera", "/api/shop", { action: "plan", need: "toilet paper, paper towels, laundry detergent, coffee, olive oil" });
await call("meera", "/api/shop", { action: "plan", need: "Monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40" });
const c = await call("ravi", "/api/support", { action: "start", text: "My GadgetHub earbuds never arrived" });
await call("ravi", "/api/support", { action: "message", caseId: c.id, text: "that didn't work" });
const h = await call("ravi", "/api/guardian", { action: "pay", payee: "Income Tax Officer", amount: 450, note: "penalty, pay immediately to avoid arrest", method: "paypal" });
console.log(JSON.stringify({ vault: v.deal.id, hold: h.hold.id, invoice: inv1.id, case: c.id }));
