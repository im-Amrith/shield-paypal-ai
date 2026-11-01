// PayPal REST client (sandbox). Falls back to a faithful mock when no
// credentials are set, so the app and tests run before keys are added.
//
// Keys to add (see .env.example): PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
// NEXT_PUBLIC_PAYPAL_CLIENT_ID (same client id, used by the browser SDK).

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

export function paypalMode(): "sandbox" | "mock" {
  if (process.env.SHIELD_FORCE_MOCK === "1") return "mock";
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox" : "mock";
}

let tokenCache: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`OAuth failed (${res.status})`, res.status, await res.text());
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class PayPalError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": crypto.randomUUID(),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(`PayPal ${method} ${path} failed (${res.status})`, res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

const mockId = (p: string) => `${p}${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
const money = (amount: number, currency: string) => ({ currency_code: currency, value: amount.toFixed(2) });

// ---------- Orders: authorize now, capture later (Vault escrow) ----------

export async function createOrder(opts: {
  amount: number;
  currency: string;
  description: string;
  intent: "AUTHORIZE" | "CAPTURE";
  referenceId: string;
}): Promise<{ id: string; status: string; approveUrl?: string }> {
  if (paypalMode() === "mock") return { id: mockId("MOCKORDER"), status: "CREATED" };
  const o = await call<{ id: string; status: string; links: { rel: string; href: string }[] }>("POST", "/v2/checkout/orders", {
    intent: opts.intent,
    purchase_units: [{ reference_id: opts.referenceId, description: opts.description.slice(0, 127), amount: money(opts.amount, opts.currency) }],
  });
  return { id: o.id, status: o.status, approveUrl: o.links.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href };
}

export async function authorizeOrder(orderId: string): Promise<{ authorizationId: string; status: string }> {
  if (paypalMode() === "mock") return { authorizationId: mockId("MOCKAUTH"), status: "CREATED" };
  const o = await call<{ purchase_units: { payments: { authorizations: { id: string; status: string }[] } }[] }>(
    "POST", `/v2/checkout/orders/${orderId}/authorize`, {},
  );
  const a = o.purchase_units[0].payments.authorizations[0];
  return { authorizationId: a.id, status: a.status };
}

export async function captureAuthorization(authorizationId: string): Promise<{ captureId: string; status: string }> {
  if (paypalMode() === "mock") return { captureId: mockId("MOCKCAP"), status: "COMPLETED" };
  const c = await call<{ id: string; status: string }>("POST", `/v2/payments/authorizations/${authorizationId}/capture`, { final_capture: true });
  return { captureId: c.id, status: c.status };
}

export async function voidAuthorization(authorizationId: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "VOIDED" };
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`);
  return { status: "VOIDED" };
}

export async function reauthorize(authorizationId: string, amount: number, currency: string): Promise<{ authorizationId: string }> {
  if (paypalMode() === "mock") return { authorizationId: mockId("MOCKAUTH") };
  const a = await call<{ id: string }>("POST", `/v2/payments/authorizations/${authorizationId}/reauthorize`, { amount: money(amount, currency) });
  return { authorizationId: a.id };
}

export async function refundCapture(captureId: string, amount: number, currency: string, note: string): Promise<{ refundId: string; status: string }> {
  if (paypalMode() === "mock") return { refundId: mockId("MOCKREF"), status: "COMPLETED" };
  const r = await call<{ id: string; status: string }>("POST", `/v2/payments/captures/${captureId}/refund`, {
    amount: money(amount, currency), note_to_payer: note.slice(0, 255),
  });
  return { refundId: r.id, status: r.status };
}

// ---------- Invoicing v2 (Collections agent) ----------

export async function createAndSendInvoice(inv: {
  number: string;
  clientEmail: string;
  clientName: string;
  currency: string;
  items: { name: string; amount: number }[];
  dueDate: string; // YYYY-MM-DD
  note: string;
  terms: string;
}): Promise<{ invoiceId: string; status: string; link?: string }> {
  if (paypalMode() === "mock") return { invoiceId: mockId("INV2-MOCK-"), status: "SENT" };
  const created = await call<{ id?: string; href?: string; links?: { rel: string; href: string }[] }>("POST", "/v2/invoicing/invoices", {
    detail: {
      invoice_number: inv.number,
      currency_code: inv.currency,
      note: inv.note.slice(0, 4000),
      term: inv.terms.slice(0, 4000),
      payment_term: { due_date: inv.dueDate },
    },
    primary_recipients: [{ billing_info: { email_address: inv.clientEmail, name: { full_name: inv.clientName } } }],
    items: inv.items.map((it) => ({ name: it.name.slice(0, 200), quantity: "1", unit_amount: money(it.amount, inv.currency) })),
    configuration: { allow_tip: false, partial_payment: { allow_partial_payment: true } },
  });
  const id = created.id || created.href?.split("/").pop() || created.links?.find((l) => l.rel === "self")?.href.split("/").pop();
  if (!id) throw new PayPalError("Invoice created but no id returned", 500, JSON.stringify(created));
  const sent = await call<{ href?: string }>("POST", `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true });
  return { invoiceId: id, status: "SENT", link: sent.href };
}

export async function remindInvoice(invoiceId: string, subject: string, note: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "REMINDED" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, { subject: subject.slice(0, 100), note: note.slice(0, 4000), send_to_recipient: true });
  return { status: "REMINDED" };
}

export async function recordInvoicePayment(invoiceId: string, amount: number, currency: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "PAID" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, {
    method: "PAYPAL", payment_date: new Date().toISOString().slice(0, 10), amount: money(amount, currency),
  });
  return { status: "PAID" };
}

export async function cancelInvoice(invoiceId: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "CANCELLED" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/cancel`, { send_to_recipient: true, send_to_invoicer: true });
  return { status: "CANCELLED" };
}

// ---------- Read-only lookups used by the support agent ----------

export async function getOrder(orderId: string): Promise<Record<string, unknown>> {
  if (paypalMode() === "mock") return { id: orderId, status: "COMPLETED", mock: true };
  return call("GET", `/v2/checkout/orders/${orderId}`);
}

export async function listDisputes(): Promise<Record<string, unknown>> {
  if (paypalMode() === "mock") return { items: [], mock: true };
  return call("GET", "/v1/customer/disputes?page_size=10");
}
