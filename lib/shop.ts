// Bounded shopping agent (Protect → /shop).
//
// The user writes a need ("monthly reorder: dish soap, rice 5kg, AA batteries, budget USD 40").
// The agent searches Channel3 for each item (or a built-in sample list without a key), picks
// one option per item with the LLM (rules without one), and builds a cart with reasons.
// Paying is never the agent's call alone: every cart goes through decideSpend() in
// lib/policy.ts against the user's caps, once when it's proposed and again right before
// the PayPal capture, so a revoke or a lowered cap takes effect even mid-checkout.
import type { Persona, Policy, Reorder, ShopCart, ShopItem } from "./types";
import { db, mutate, uid } from "./store";
import { now, nowIso, DAY } from "./clock";
import { decideSpend } from "./policy";
import { completeJSON, llmProvider } from "./llm";
import * as paypal from "./paypal";
import { notify } from "./notify";
import { savedPayPalFor } from "./savedPaypal";

export const CURRENCY = "USD";
export const REORDER_DAYS = 30;

// ---------- Products: Channel3, or a small labeled sample list ----------

type Candidate = Omit<ShopItem, "query" | "reason">;

/** Built-in "sample products" used when CHANNEL3_API_KEY isn't set. Prices are illustrative. */
export const SAMPLE_PRODUCTS: (Candidate & { keywords: string[] })[] = [
  { productId: "s-soap-1", title: "Dawn Ultra Dish Soap, Original, 28 fl oz", brand: "Dawn", price: 4.97, currency: "USD", retailer: "walmart.com", rating: 4.8, source: "sample", keywords: ["dish soap", "dishwashing liquid", "dish liquid", "washing up liquid"] },
  { productId: "s-soap-2", title: "Seventh Generation Free & Clear Dish Liquid, 19 fl oz", brand: "Seventh Generation", price: 4.29, currency: "USD", retailer: "target.com", rating: 4.6, source: "sample", keywords: ["dish soap", "dishwashing liquid", "dish liquid"] },
  { productId: "s-soap-3", title: "Mrs. Meyer's Clean Day Dish Soap, Lavender, 16 fl oz", brand: "Mrs. Meyer's", price: 5.49, currency: "USD", retailer: "amazon.com", rating: 4.7, source: "sample", keywords: ["dish soap", "dish liquid"] },
  { productId: "s-rice-1", title: "Royal Basmati Rice, 5 kg (11 lb)", brand: "Royal", price: 15.98, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["rice", "basmati", "rice 5kg"] },
  { productId: "s-rice-2", title: "Daawat Traditional Basmati Rice, 5 kg", brand: "Daawat", price: 18.49, currency: "USD", retailer: "amazon.com", rating: 4.5, source: "sample", keywords: ["rice", "basmati", "rice 5kg"] },
  { productId: "s-rice-3", title: "Mahatma Long Grain White Rice, 10 lb", brand: "Mahatma", price: 9.48, currency: "USD", retailer: "target.com", rating: 4.4, source: "sample", keywords: ["rice", "white rice"] },
  { productId: "s-aa-1", title: "Amazon Basics AA Alkaline Batteries, 20-pack", brand: "Amazon Basics", price: 9.99, currency: "USD", retailer: "amazon.com", rating: 4.6, source: "sample", keywords: ["aa batteries", "aa battery", "batteries"] },
  { productId: "s-aa-2", title: "Duracell Coppertop AA Batteries, 16-pack", brand: "Duracell", price: 14.97, currency: "USD", retailer: "walmart.com", rating: 4.8, source: "sample", keywords: ["aa batteries", "aa battery", "batteries"] },
  { productId: "s-aa-3", title: "Energizer MAX AA Batteries, 8-pack", brand: "Energizer", price: 7.79, currency: "USD", retailer: "target.com", rating: 4.7, source: "sample", keywords: ["aa batteries", "batteries"] },
  { productId: "s-paste-1", title: "Colgate Total Toothpaste, 4.8 oz, 2-pack", brand: "Colgate", price: 6.47, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["toothpaste"] },
  { productId: "s-paste-2", title: "Sensodyne Pronamel Toothpaste, 4 oz", brand: "Sensodyne", price: 6.99, currency: "USD", retailer: "target.com", rating: 4.8, source: "sample", keywords: ["toothpaste"] },
  { productId: "s-det-1", title: "Tide Original Liquid Laundry Detergent, 92 fl oz", brand: "Tide", price: 13.97, currency: "USD", retailer: "walmart.com", rating: 4.8, source: "sample", keywords: ["laundry detergent", "detergent", "washing powder"] },
  { productId: "s-det-2", title: "Arm & Hammer Clean Burst Laundry Detergent, 100 fl oz", brand: "Arm & Hammer", price: 8.97, currency: "USD", retailer: "target.com", rating: 4.6, source: "sample", keywords: ["laundry detergent", "detergent"] },
  { productId: "s-tp-1", title: "Charmin Ultra Soft Toilet Paper, 12 Mega Rolls", brand: "Charmin", price: 16.99, currency: "USD", retailer: "target.com", rating: 4.8, source: "sample", keywords: ["toilet paper", "toilet roll", "tissue"] },
  { productId: "s-tp-2", title: "Angel Soft Toilet Paper, 12 Mega Rolls", brand: "Angel Soft", price: 9.97, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["toilet paper", "toilet roll"] },
  { productId: "s-towel-1", title: "Bounty Select-A-Size Paper Towels, 6 Double Rolls", brand: "Bounty", price: 12.49, currency: "USD", retailer: "amazon.com", rating: 4.8, source: "sample", keywords: ["paper towels", "kitchen roll", "paper towel"] },
  { productId: "s-coffee-1", title: "Folgers Classic Roast Ground Coffee, 25.9 oz", brand: "Folgers", price: 11.98, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["coffee", "ground coffee"] },
  { productId: "s-coffee-2", title: "Lavazza Qualità Rossa Ground Coffee, 8.8 oz", brand: "Lavazza", price: 6.99, currency: "USD", retailer: "amazon.com", rating: 4.6, source: "sample", keywords: ["coffee", "ground coffee"] },
  { productId: "s-tea-1", title: "Tetley Original Black Tea, 100 bags", brand: "Tetley", price: 5.49, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["tea", "tea bags"] },
  { productId: "s-oil-1", title: "Pompeian Extra Virgin Olive Oil, 24 fl oz", brand: "Pompeian", price: 9.98, currency: "USD", retailer: "walmart.com", rating: 4.7, source: "sample", keywords: ["olive oil", "cooking oil", "oil"] },
  { productId: "s-shampoo-1", title: "Head & Shoulders Classic Clean Shampoo, 13.5 fl oz", brand: "Head & Shoulders", price: 7.47, currency: "USD", retailer: "target.com", rating: 4.7, source: "sample", keywords: ["shampoo"] },
  { productId: "s-bags-1", title: "Glad ForceFlex Tall Kitchen Trash Bags, 13 gal, 40 ct", brand: "Glad", price: 10.49, currency: "USD", retailer: "target.com", rating: 4.7, source: "sample", keywords: ["trash bags", "garbage bags", "bin bags"] },
  { productId: "s-wipes-1", title: "Clorox Disinfecting Wipes, 3-pack (225 ct)", brand: "Clorox", price: 12.99, currency: "USD", retailer: "amazon.com", rating: 4.8, source: "sample", keywords: ["wipes", "disinfecting wipes", "cleaning wipes"] },
  { productId: "s-aaa-1", title: "Amazon Basics AAA Alkaline Batteries, 20-pack", brand: "Amazon Basics", price: 9.49, currency: "USD", retailer: "amazon.com", rating: 4.6, source: "sample", keywords: ["aaa batteries", "aaa battery"] },
  { productId: "s-tv-1", title: "TCL 55\" 4K UHD Smart TV", brand: "TCL", price: 279.99, currency: "USD", retailer: "bestbuy.com", rating: 4.5, source: "sample", keywords: ["tv", "television", "smart tv"] },
  { productId: "s-head-1", title: "Sony WH-1000XM5 Noise Canceling Headphones", brand: "Sony", price: 329.99, currency: "USD", retailer: "bestbuy.com", rating: 4.7, source: "sample", keywords: ["headphones", "noise cancelling headphones"] },
  { productId: "s-kettle-1", title: "Amazon Basics Electric Kettle, 1.7 L", brand: "Amazon Basics", price: 24.99, currency: "USD", retailer: "amazon.com", rating: 4.5, source: "sample", keywords: ["kettle", "electric kettle"] },
];

export function productSource(): "channel3" | "sample" {
  return process.env.CHANNEL3_API_KEY && process.env.SHIELD_FORCE_MOCK !== "1" ? "channel3" : "sample";
}

function searchSample(query: string): Candidate[] {
  const q = query.toLowerCase().replace(/\b\d+\s*(kg|g|lb|oz|pack|ct)\b/g, " ").replace(/\s+/g, " ").trim();
  const words = q.split(" ").filter((w) => w.length > 2);
  const scored = SAMPLE_PRODUCTS.map((p) => {
    const exact = p.keywords.some((k) => q.includes(k) || k.includes(q));
    const hits = words.filter((w) => p.keywords.some((k) => k.split(" ").includes(w.replace(/s$/, "")) || k.split(" ").includes(w))).length;
    return { p, score: (exact ? 10 : 0) + hits };
  }).filter((x) => x.score >= 1);
  const best = Math.max(0, ...scored.map((x) => x.score));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return scored.filter((x) => x.score === best).map(({ p: { keywords, ...c } }) => c);
}

interface Channel3Product {
  id: string;
  title: string;
  brands?: { name: string }[];
  images?: { url: string; is_main_image?: boolean }[];
  offers?: { url: string; domain: string; price: { price: number; currency: string }; availability?: string }[];
  rating?: number;
}

/** Channel3 product search (https://api.trychannel3.com/v1/search). USD, in-stock offers only. */
export async function searchChannel3(query: string, maxPrice?: number): Promise<Candidate[]> {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ query, limit: 8, filters: { availability: ["InStock"], ...(maxPrice ? { price: { max_price: maxPrice } } : {}) } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Channel3 search failed (${res.status})`);
  const j = (await res.json()) as { products?: Channel3Product[] };
  const out: Candidate[] = [];
  for (const p of j.products ?? []) {
    const offer = (p.offers ?? []).filter((o) => o.price?.currency === CURRENCY && o.price.price > 0 && (!o.availability || o.availability === "InStock"))
      .sort((a, b) => a.price.price - b.price.price)[0];
    if (!offer) continue;
    out.push({
      productId: p.id, title: p.title, brand: p.brands?.[0]?.name, price: Math.round(offer.price.price * 100) / 100, currency: CURRENCY,
      retailer: offer.domain, url: offer.url, image: (p.images?.find((i) => i.is_main_image) ?? p.images?.[0])?.url,
      rating: typeof p.rating === "number" ? p.rating : undefined, source: "channel3",
    });
  }
  return out;
}

export async function searchProducts(query: string, maxPrice?: number): Promise<{ items: Candidate[]; source: "channel3" | "sample" }> {
  if (productSource() === "channel3") {
    try {
      return { items: await searchChannel3(query, maxPrice), source: "channel3" };
    } catch (e) {
      console.error("[shop] Channel3 failed, using sample products:", (e as Error).message);
    }
  }
  return { items: searchSample(query), source: "sample" };
}

// ---------- Understanding the need ----------

export interface Need { items: string[]; budget?: number; monthly: boolean }

/** Rule-based parser (also the fallback when the LLM is off or fails). */
export function parseNeedRules(text: string): Need {
  let t = text.trim();
  const monthly = /\b(monthly|every month|each month|reorder|re-order|recurring)\b/i.test(t);
  let budget: number | undefined;
  const b = t.match(/\b(?:budget|under|max(?:imum)?|up to|within|no more than|spend)\b[^\d$]{0,12}(?:usd|us\$|\$)?\s*(\d+(?:\.\d+)?)/i) || t.match(/(?:usd|us\$|\$)\s*(\d+(?:\.\d+)?)/i);
  if (b) {
    budget = Number(b[1]);
    t = t.replace(b[0], " ");
  }
  // Drop a lead-in like "monthly reorder:" or "I need".
  t = t.replace(/^[^:]{0,40}:/, (m) => (/(reorder|monthly|buy|need|get|order|shopping|list)/i.test(m) ? " " : m));
  t = t.replace(/\b(please|i need|i want|buy me|buy|get me|order|monthly|reorder|re-order|some|a pack of|a bottle of|a bag of)\b/gi, " ");
  const items = t.split(/,|;|\n|\+|\band\b|&/i).map((s) => s.replace(/[.!?]/g, " ").replace(/\b(usd|budget)\b/gi, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 1 && /[a-z]/i.test(s));
  return { items: [...new Set(items)].slice(0, 8), budget, monthly };
}

export async function parseNeed(text: string): Promise<Need> {
  const rules = parseNeedRules(text);
  if (llmProvider() === "none") return rules;
  const ai = await completeJSON<{ items?: string[]; budget?: number | null; monthly?: boolean }>(
    "Extract a shopping list. Return {\"items\": short product search phrases (keep sizes like '5kg'), \"budget\": total budget in USD or null, \"monthly\": true if it repeats monthly}. Max 8 items.",
    text, { maxTokens: 300 },
  );
  if (!ai?.items?.length) return rules;
  const budget = typeof ai.budget === "number" && ai.budget > 0 ? ai.budget : rules.budget;
  return { items: ai.items.map(String).filter(Boolean).slice(0, 8), budget, monthly: Boolean(ai.monthly) || rules.monthly };
}

// ---------- Choosing ----------

/** Rules pick: same product as last time if offered, else the cheapest well-rated option. */
export function pickRules(query: string, options: Candidate[], prefer?: string): ShopItem | null {
  if (!options.length) return null;
  const same = prefer && options.find((o) => o.productId === prefer);
  if (same) return { ...same, query, reason: "Same as your last order" };
  const rated = options.filter((o) => (o.rating ?? 4.5) >= 4.5);
  const pool = rated.length ? rated : options;
  const best = [...pool].sort((a, b) => a.price - b.price)[0];
  const cheaper = options.filter((o) => o.price < best.price);
  const reason = cheaper.length
    ? "Best value: skipped a cheaper option rated lower"
    : `Lowest price of ${options.length} option${options.length > 1 ? "s" : ""}`;
  return { ...best, query, reason };
}

async function pickAll(lists: { query: string; options: Candidate[]; prefer?: string }[], budget?: number): Promise<(ShopItem | null)[]> {
  const rules = lists.map((l) => pickRules(l.query, l.options, l.prefer));
  if (llmProvider() === "none") return rules;
  const prompt = lists.map((l, i) => `Item ${i}: "${l.query}"${l.prefer ? ` (last time: ${l.prefer})` : ""}\n${l.options.map((o, j) => `  ${j}. ${o.title} | ${o.currency} ${o.price} | ${o.retailer}${o.rating ? ` | ${o.rating}★` : ""} | id ${o.productId}`).join("\n")}`).join("\n\n");
  const ai = await completeJSON<{ picks?: { item: number; option: number; reason: string }[] }>(
    `You are a careful shopping agent. For each item pick ONE option (balance price, rating, retailer trust; prefer last time's product if it's still good value).${budget ? ` The whole cart should fit USD ${budget}.` : ""} Return {"picks":[{"item":0,"option":2,"reason":"under 15 words"}]}.`,
    prompt, { maxTokens: 600 },
  );
  if (!ai?.picks) return rules;
  return lists.map((l, i) => {
    const p = ai.picks!.find((x) => x.item === i);
    const o = p && l.options[p.option];
    return o ? { ...o, query: l.query, reason: String(p.reason || "Picked by the agent").slice(0, 140) } : rules[i];
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (items: ShopItem[]) => round(items.reduce((s, i) => s + i.price, 0));

/** Fit the cart to the user's own budget: swap to cheaper options, then drop the priciest items. */
export function fitBudget(items: ShopItem[], options: Map<string, Candidate[]>, budget?: number): { items: ShopItem[]; skipped: { query: string; why: string }[] } {
  if (!budget || sum(items) <= budget) return { items, skipped: [] };
  let out = items.map((it) => {
    const cheapest = [...(options.get(it.query) ?? [])].sort((a, b) => a.price - b.price)[0];
    return cheapest && cheapest.price < it.price ? { ...cheapest, query: it.query, reason: `Cheapest option, to stay within your ${CURRENCY} ${budget} budget` } : it;
  });
  const skipped: { query: string; why: string }[] = [];
  while (out.length && sum(out) > budget) {
    const priciest = out.reduce((a, b) => (b.price > a.price ? b : a));
    out = out.filter((x) => x !== priciest);
    skipped.push({ query: priciest.query, why: `Left out: ${CURRENCY} ${priciest.price.toFixed(2)} would take the cart over your ${CURRENCY} ${budget} budget` });
  }
  return { items: out, skipped };
}

// ---------- Caps ----------

export function policyFor(userId: Persona): Policy {
  return db().policies.find((p) => p.userId === userId) ?? { userId, perOrderCap: 100, monthlyCap: 250, autoApproveBelow: 25, refundHumanAbove: 50, revoked: false };
}

/** Paid this calendar month (demo clock). */
export function spentThisMonth(userId: Persona, at: Date = now()): number {
  const ym = at.toISOString().slice(0, 7);
  return round((db().carts ?? []).filter((c) => c.userId === userId && c.status === "paid" && c.paidAt?.slice(0, 7) === ym).reduce((s, c) => s + c.total, 0));
}

export function updatePolicy(userId: Persona, patch: Partial<Pick<Policy, "perOrderCap" | "monthlyCap" | "autoApproveBelow" | "revoked">>): Policy {
  const cur = policyFor(userId);
  const next = { ...cur, ...patch };
  for (const k of ["perOrderCap", "monthlyCap", "autoApproveBelow"] as const) {
    const v = Number(next[k]);
    if (!Number.isFinite(v) || v < 0 || v > 10000) throw new Error("Caps must be between 0 and 10,000");
    next[k] = round(v);
  }
  if (next.autoApproveBelow > next.perOrderCap) throw new Error("Auto-approve must be at or below the per-order cap");
  if (next.perOrderCap > next.monthlyCap) throw new Error("The per-order cap can't be above the monthly cap");
  next.revoked = Boolean(next.revoked);
  return mutate((d) => {
    const i = d.policies.findIndex((p) => p.userId === userId);
    if (i >= 0) d.policies[i] = next;
    else d.policies.push(next);
    return { ...next };
  });
}

// ---------- Carts ----------

function saveCart(cart: ShopCart) {
  mutate((d) => {
    (d.carts ??= []).unshift(cart);
  });
}

function patchCart(id: string, fn: (c: ShopCart) => void): ShopCart {
  return mutate((d) => {
    const c = (d.carts ?? []).find((x) => x.id === id);
    if (!c) throw new Error("Cart not found");
    fn(c);
    return structuredClone(c);
  });
}

export function getCart(id: string) {
  return (db().carts ?? []).find((c) => c.id === id);
}

export interface Draft {
  need: Need;
  items: ShopItem[];
  skipped: { query: string; why: string }[];
  total: number;
  source: "channel3" | "sample";
  decision: ShopCart["decision"];
  reason: string;
}

/** Search, pick and price a cart, and ask the policy engine. Pure: nothing is saved or paid. */
export async function draftCart(text: string, policy: Policy, spent: number, prefer: Record<string, string> = {}, budgetHint?: number): Promise<Draft> {
  const need = await parseNeed(text);
  if (budgetHint && !need.budget) need.budget = budgetHint;
  const options = new Map<string, Candidate[]>();
  let source: "channel3" | "sample" = "sample";
  const skipped: { query: string; why: string }[] = [];
  for (const q of need.items) {
    const r = await searchProducts(q, need.budget);
    if (r.source === "channel3") source = "channel3";
    if (r.items.length) options.set(q, r.items);
    else skipped.push({ query: q, why: r.source === "sample" ? "Not in the sample product list" : "No in-stock USD offers found" });
  }
  const lists = [...options.entries()].map(([query, o]) => ({ query, options: o, prefer: prefer[query] }));
  const picked = (await pickAll(lists, need.budget)).filter((x): x is ShopItem => Boolean(x));
  const fit = fitBudget(picked, options, need.budget);
  skipped.push(...fit.skipped);
  const total = sum(fit.items);
  const verdict = fit.items.length ? decideSpend(total, spent, policy) : { decision: "blocked" as const, reason: "Nothing to buy" };
  return { need, items: fit.items, skipped, total, source, decision: verdict.decision, reason: verdict.reason };
}

/** Build a cart for a written need, save it, and pay straight away only if the policy says auto. */
export async function planCart(userId: Persona, text: string, opts: { reorderId?: string } = {}): Promise<ShopCart> {
  if (!text.trim()) throw new Error("Tell the agent what you need");
  if (text.length > 500) throw new Error("Keep the list under 500 characters");
  const reorder = opts.reorderId ? (db().reorders ?? []).find((r) => r.id === opts.reorderId && r.userId === userId) : undefined;
  const prefer = Object.fromEntries((reorder?.items ?? []).map((i) => [i.query, i.productId]));
  const d = await draftCart(text, policyFor(userId), spentThisMonth(userId), prefer, reorder?.budget);
  if (!d.need.items.length) throw new Error("I couldn't find any items in that. Try a comma-separated list");
  const cart: ShopCart = {
    id: uid("cart"), userId, createdAt: nowIso(), need: text.trim(), budget: d.need.budget, monthly: d.need.monthly || Boolean(reorder),
    items: d.items, skipped: d.skipped, total: d.total, currency: CURRENCY, decision: d.decision, reason: d.reason,
    status: d.decision === "blocked" ? "blocked" : d.decision === "auto" ? "awaiting_payment" : "pending_approval",
    reorderId: reorder?.id, source: d.source,
    history: [{ at: nowIso(), event: reorder ? "Monthly reorder built" : "Cart built", detail: `${DECISION_WORDS[d.decision]}: ${d.reason} (${CURRENCY} ${d.total.toFixed(2)})` }],
  };
  saveCart(cart);
  if (reorder) mutate((x) => { (x.reorders ?? []).find((r) => r.id === reorder.id)!.lastProposedAt = nowIso(); });
  if (cart.status === "awaiting_payment") return startCheckout(cart.id);
  return getCart(cart.id)!;
}

const DECISION_WORDS: Record<ShopCart["decision"], string> = {
  auto: "Auto-approve", ask_customer: "Needs one tap", needs_human: "Needs review", blocked: "Blocked",
};

/** Shown on carts the agent paid on its own. */
export const AGENT_PAID_LABEL = "Paid by Shield agent · saved PayPal";

function logCart(id: string, event: string, detail: string) {
  patchCart(id, (c) => { (c.history ??= []).push({ at: nowIso(), event, detail }); });
}

/** Re-ask the policy engine with today's caps and spend. Throws when the agent may not pay. */
function recheck(cart: ShopCart): { decision: ShopCart["decision"]; reason: string } {
  const v = decideSpend(cart.total, spentThisMonth(cart.userId), policyFor(cart.userId));
  if (v.decision === "blocked") {
    patchCart(cart.id, (c) => {
      c.status = "blocked"; c.decision = "blocked"; c.reason = v.reason;
      (c.history ??= []).push({ at: nowIso(), event: "Blocked before payment", detail: v.reason });
    });
    throw new Error(`Blocked by your caps: ${v.reason}`);
  }
  if (v.decision === "ask_customer" && !cart.approvedAt) {
    patchCart(cart.id, (c) => { c.status = "pending_approval"; c.decision = "ask_customer"; c.reason = v.reason; });
    throw new Error(`Needs your approval: ${v.reason}`);
  }
  return v;
}

const describeCart = (cart: ShopCart) => `Shield shopping agent: ${cart.items.map((i) => i.title).join(", ")}`;

async function createCartOrder(cart: ShopCart): Promise<string> {
  const order = await paypal.createOrder({ amount: cart.total, currency: cart.currency, description: describeCart(cart), intent: "CAPTURE", referenceId: cart.id });
  patchCart(cart.id, (c) => { c.paypalOrderId = order.id; });
  return order.id;
}

/**
 * Ready the cart for payment. With a saved PayPal the agent pays at once (chargeWithSaved). Otherwise:
 * in mock mode the order is created and captured straight away; with PayPal keys the order is created
 * only when the payer clicks the PayPal button (checkoutOrder).
 */
async function startCheckout(id: string): Promise<ShopCart> {
  const cart = getCart(id)!;
  recheck(cart);
  patchCart(id, (c) => { c.status = "awaiting_payment"; delete c.paypalOrderId; delete c.fallbackReason; });
  if (savedPayPalFor(cart.userId)) return chargeWithSaved(id);
  if (paypal.paypalMode() === "mock") {
    await createCartOrder(getCart(id)!);
    return pay(cart.userId, id);
  }
  return getCart(id)!;
}

/** The PayPal-Request-Id for the agent's charge of a cart: fixed, so a retry can never charge twice. */
export const agentRequestId = (cartId: string) => `shield-agent-${cartId}`;

/**
 * The agent pays with the saved PayPal, buyer not present. The caps (per order, monthly, revoked)
 * are checked again right before the charge. PAYER_ACTION_REQUIRED or a PayPal refusal leaves the
 * cart waiting for the popup; an unknown outcome (network error, PayPal 5xx) leaves it "pending",
 * and only this function (same PayPal-Request-Id) may retry it.
 */
export async function chargeWithSaved(id: string, userId?: Persona): Promise<ShopCart> {
  const cart = getCart(id);
  if (!cart || (userId && cart.userId !== userId)) throw new Error("Cart not found");
  if (cart.status === "paid") return cart; // already paid: a retry changes nothing
  if (cart.status !== "awaiting_payment") throw new Error(`This cart is ${cart.status.replace("_", " ")}`);
  const saved = savedPayPalFor(cart.userId);
  if (!saved) throw new Error("No saved PayPal. Pay in the PayPal window, or save PayPal for the agent first");
  const policy = policyFor(cart.userId);
  const spent = spentThisMonth(cart.userId);
  const v = recheck(cart);
  logCart(id, "Policy check before charge",
    `${v.decision === "auto" ? `Auto-approved: ${cart.currency} ${cart.total.toFixed(2)} is within your ${cart.currency} ${policy.autoApproveBelow} auto-approve limit` : `Approved by you: ${v.reason}`}; ` +
    `${cart.currency} ${(spent + cart.total).toFixed(2)} of your ${cart.currency} ${policy.monthlyCap} monthly cap; agent not revoked`);
  let r: Awaited<ReturnType<typeof paypal.chargeSavedPayPal>>;
  try {
    r = await paypal.chargeSavedPayPal({
      vaultId: saved.paymentTokenId, amount: cart.total, currency: cart.currency, description: describeCart(cart), referenceId: cart.id, requestId: agentRequestId(cart.id),
    });
  } catch (e) {
    if (e instanceof paypal.PayPalError && e.status < 500) {
      const info = paypal.paypalErrorInfo(e);
      console.error("[shop] saved PayPal charge refused", info.code, "debug_id:", info.debugId ?? "none");
      return fallBackToPopup(id, info.message);
    }
    // Unknown outcome: PayPal may have charged. Never offer the popup for this cart; retry only
    // with the same request id, which returns the first result.
    patchCart(id, (c) => { c.agentChargePending = true; });
    logCart(id, "Charge not confirmed", `Couldn't confirm with PayPal (${(e as Error).message}). Trying again uses the same request id, so it can't charge twice.`);
    throw e;
  }
  if (r.status !== "COMPLETED" || !r.captureId) return fallBackToPopup(id, `PayPal needs the payer's approval for this one (${r.status}). Pay in the PayPal window.`);
  return recordPaid(id, { captureId: r.captureId, orderId: r.orderId, via: "saved_paypal" });
}

function fallBackToPopup(id: string, why: string): ShopCart {
  patchCart(id, (c) => {
    c.fallbackReason = why;
    delete c.agentChargePending;
    delete c.paypalOrderId;
    (c.history ??= []).push({ at: nowIso(), event: "Saved PayPal not used", detail: why });
  });
  return getCart(id)!;
}

/** Mark paid and record the transaction in one step. A second call for a paid cart records nothing. */
function recordPaid(id: string, p: { captureId: string; orderId?: string; via: NonNullable<ShopCart["paidVia"]> }): ShopCart {
  const out = mutate((d) => {
    const c = (d.carts ?? []).find((x) => x.id === id)!;
    if (c.status === "paid") return { cart: structuredClone(c), fresh: false };
    c.status = "paid";
    c.captureId = p.captureId;
    if (p.orderId) c.paypalOrderId = p.orderId;
    c.paidAt = nowIso();
    c.paidVia = p.via;
    delete c.agentChargePending;
    delete c.fallbackReason;
    const how = p.via === "saved_paypal" ? AGENT_PAID_LABEL : p.via === "paypal_checkout" ? "Paid in the PayPal window" : "Paid (simulated)";
    (c.history ??= []).push({ at: c.paidAt, event: how, detail: `${c.currency} ${c.total.toFixed(2)} · PayPal capture ${p.captureId}` });
    d.transactions.push({
      id: uid("tx"), userId: c.userId, at: c.paidAt, amount: c.total, currency: c.currency, direction: "out",
      counterparty: [...new Set(c.items.map((i) => i.retailer))].join(", "), country: "US", type: "goods_services",
      memo: `Shopping agent: ${c.items.length} item${c.items.length > 1 ? "s" : ""}`, captureId: p.captureId,
    });
    return { cart: structuredClone(c), fresh: true };
  });
  if (out.fresh) remember(out.cart);
  return out.cart;
}

/** The payer clicked the PayPal button: caps again, then a fresh CAPTURE order for the cart total. */
export async function checkoutOrder(userId: Persona, id: string): Promise<{ orderId: string }> {
  const cart = getCart(id);
  if (!cart || cart.userId !== userId) throw new Error("Cart not found");
  if (cart.status !== "awaiting_payment") throw new Error(`This cart is ${cart.status.replace("_", " ")}`);
  if (cart.agentChargePending) throw new Error("The agent's charge for this cart isn't confirmed yet. Use \"Check with PayPal again\" instead, so it can't be paid twice.");
  recheck(cart);
  return { orderId: await createCartOrder(cart) };
}

/** One-tap approval for a cart above the auto-approve threshold. */
export async function approveCart(userId: Persona, id: string): Promise<ShopCart> {
  const cart = getCart(id);
  if (!cart || cart.userId !== userId) throw new Error("Cart not found");
  if (cart.status !== "pending_approval") throw new Error(`This cart is ${cart.status.replace("_", " ")}`);
  patchCart(id, (c) => { c.approvedAt = nowIso(); (c.history ??= []).push({ at: nowIso(), event: "Approved by you", detail: `One tap for ${c.currency} ${c.total.toFixed(2)}` }); });
  try {
    return await startCheckout(id);
  } catch (e) {
    if (/Blocked by your caps/.test((e as Error).message)) return getCart(id)!;
    throw e;
  }
}

export function declineCart(userId: Persona, id: string): ShopCart {
  const cart = getCart(id);
  if (!cart || cart.userId !== userId) throw new Error("Cart not found");
  if (cart.status === "paid") throw new Error("Already paid");
  if (cart.agentChargePending) throw new Error("The agent's charge isn't confirmed yet. Check with PayPal again first.");
  return patchCart(id, (c) => { c.status = "declined"; });
}

/** Capture after the payer approved the PayPal order. Policy is checked once more first. */
export async function pay(userId: Persona, id: string, approvedOrderId?: string): Promise<ShopCart> {
  const cart = getCart(id);
  if (!cart || cart.userId !== userId) throw new Error("Cart not found");
  if (cart.status !== "awaiting_payment") throw new Error(`This cart is ${cart.status.replace("_", " ")}`);
  if (!cart.paypalOrderId) throw new Error("Pay with the PayPal button first");
  if (approvedOrderId && approvedOrderId !== cart.paypalOrderId) throw new Error("That PayPal order doesn't belong to this cart. Click the PayPal button again.");
  recheck(cart);
  const cap = await paypal.captureOrder(cart.paypalOrderId!);
  return recordPaid(id, { captureId: cap.captureId, via: paypal.paypalMode() === "mock" ? "simulated" : "paypal_checkout" });
}

// ---------- Reorders ----------

/** Accepted carts become a monthly reorder the agent proposes again. */
function remember(cart: ShopCart) {
  mutate((d) => {
    const list = (d.reorders ??= []);
    const existing = list.find((r) => r.id === cart.reorderId) ?? list.find((r) => r.userId === cart.userId && r.need === cart.need);
    const items = cart.items.map((i) => ({ query: i.query, productId: i.productId, title: i.title }));
    if (existing) {
      existing.items = items;
      existing.lastOrderedAt = cart.paidAt!;
      existing.active = true;
      delete existing.lastProposedAt;
      delete existing.notifiedAt;
    } else {
      list.unshift({ id: uid("reorder"), userId: cart.userId, need: cart.need, budget: cart.budget, items, createdAt: cart.paidAt!, lastOrderedAt: cart.paidAt!, everyDays: REORDER_DAYS, active: true });
    }
  });
}

export function nextDue(r: Reorder): Date {
  return new Date(new Date(r.lastOrderedAt).getTime() + r.everyDays * DAY);
}

export function isDue(r: Reorder, at: Date = now()): boolean {
  return r.active && nextDue(r).getTime() <= at.getTime();
}

export function setReorderActive(userId: Persona, id: string, active: boolean): Reorder {
  return mutate((d) => {
    const r = (d.reorders ?? []).find((x) => x.id === id && x.userId === userId);
    if (!r) throw new Error("Reorder not found");
    r.active = active;
    return { ...r };
  });
}

export async function proposeReorder(userId: Persona, id: string): Promise<ShopCart> {
  const r = (db().reorders ?? []).find((x) => x.id === id && x.userId === userId);
  if (!r) throw new Error("Reorder not found");
  const text = `${r.items.map((i) => i.query).join(", ")}${r.budget ? `, budget USD ${r.budget}` : ""}`;
  return planCart(userId, text, { reorderId: r.id });
}

/**
 * Job: monthly reorders. When one is due and PayPal is saved for the agent, the agent builds the
 * cart again and the caps decide: an auto-approvable cart is paid with the saved PayPal, anything
 * above the auto-approve limit waits for one tap, anything over a cap is blocked. Without a saved
 * PayPal (or with the agent revoked) it only says the reorder is due. Once per cycle.
 */
export async function tickReorders(): Promise<string[]> {
  const log: string[] = [];
  for (const due of (db().reorders ?? []).filter((x) => isDue(x) && !x.notifiedAt)) {
    // Claim this cycle first, so overlapping job runs can't build (or pay) it twice.
    const claimedAt = nowIso();
    const claimed = mutate((d) => {
      const r = (d.reorders ?? []).find((x) => x.id === due.id)!;
      if (r.notifiedAt) return false;
      r.notifiedAt = claimedAt;
      return true;
    });
    if (!claimed) continue;
    const policy = policyFor(due.userId);
    const what = due.items.map((i) => i.title).join(", ");
    if (!savedPayPalFor(due.userId) || policy.revoked) {
      await notify(due.userId, { kind: "info", title: "Your monthly reorder is due", body: `${what}. ${policy.revoked ? "The agent is revoked, so it didn't build the cart." : "The agent can build the cart again within your caps."}`, link: "/shop" });
      log.push(`reorder-due:${due.id}`);
      continue;
    }
    let cart: ShopCart;
    try {
      cart = await proposeReorder(due.userId, due.id);
    } catch (e) {
      const pending = (db().carts ?? []).some((c) => c.reorderId === due.id && c.createdAt >= claimedAt && c.agentChargePending);
      await notify(due.userId, {
        kind: "info", title: "Your monthly reorder needs a look",
        body: pending ? "PayPal didn't confirm the agent's charge yet. Open the cart and check with PayPal again; it can't be charged twice." : `The agent couldn't finish it: ${(e as Error).message}`,
        link: "/shop",
      });
      log.push(`${pending ? "reorder-charge-pending" : "reorder-failed"}:${due.id}`);
      continue;
    }
    const amt = `${cart.currency} ${cart.total.toFixed(2)}`;
    if (cart.status === "paid" && cart.paidVia === "saved_paypal") {
      await notify(due.userId, { kind: "info", title: `Your monthly reorder was paid: ${amt}, within your ${cart.currency} ${policy.autoApproveBelow} auto-approve limit`, body: `${AGENT_PAID_LABEL} · ${what}`, link: "/shop" });
      log.push(`reorder-paid:${due.id}`);
    } else if (cart.status === "pending_approval") {
      await notify(due.userId, { kind: "info", title: `Your monthly reorder needs one tap: ${amt}`, body: `It's above your ${cart.currency} ${policy.autoApproveBelow} auto-approve limit, so the agent waits for you.`, link: "/shop" });
      log.push(`reorder-approve:${due.id}`);
    } else if (cart.status === "blocked") {
      await notify(due.userId, { kind: "info", title: "Your monthly reorder was blocked by your caps", body: cart.reason, link: "/shop" });
      log.push(`reorder-blocked:${due.id}`);
    } else {
      await notify(due.userId, { kind: "info", title: `Your monthly reorder is ready to pay: ${amt}`, body: cart.fallbackReason ?? "Pay in the PayPal window.", link: "/shop" });
      log.push(`reorder-pay:${due.id}`);
    }
  }
  return log;
}
