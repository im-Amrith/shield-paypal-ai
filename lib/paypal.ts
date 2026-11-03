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
  /** PayPal's machine-readable reason, e.g. `AUTHORIZATION_EXPIRED` (from `details[0].issue`, else `name`). */
  public issue?: string;
  /** PayPal's debug_id: quote it to PayPal support (or look it up in the developer dashboard). */
  public debugId?: string;
  constructor(message: string, public status: number, public body: string) {
    super(message);
    this.issue = issueOf(body);
    this.debugId = debugIdOf(body);
  }
}

function debugIdOf(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { debug_id?: string }).debug_id || undefined;
  } catch {
    return undefined;
  }
}

/** Errors that mean the seller's (payee's) account can't take this payment. */
const PAYEE_ISSUES = new Set([
  "UNSUPPORTED_PAYEE_CURRENCY", "PAYEE_ACCOUNT_RESTRICTED", "PAYEE_ACCOUNT_LOCKED_OR_CLOSED", "PAYEE_ACCOUNT_INVALID",
  "PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING", "PAYEE_BLOCKED_TRANSACTION", "CURRENCY_NOT_SUPPORTED_FOR_COUNTRY",
  "PAYEE_NOT_CONSENTED", "PAYEE_ACCOUNT_NOT_SUPPORTED", "PAYEE_ACCOUNT_NOT_VERIFIED",
]);
export const PAYEE_ACCOUNT_HELP = "The seller's PayPal sandbox account can't receive this currency — use a US sandbox business account.";

const HELP: Record<string, string> = {
  INSTRUMENT_DECLINED: "Your payment method was declined. Pick another card or your PayPal balance in the PayPal window and try again.",
  PAYER_ACTION_REQUIRED: "PayPal needs you to finish approving the payment in the PayPal window. Click the PayPal button again.",
  ORDER_NOT_APPROVED: "The payment wasn't approved in the PayPal window. Click the PayPal button again.",
  PAYER_CANNOT_PAY: "PayPal can't take this payment from this buyer account. Try another sandbox personal account.",
  PAYER_ACCOUNT_RESTRICTED: "The buyer's PayPal account is restricted. Log in with another sandbox personal account.",
  TRANSACTION_REFUSED: "PayPal refused this payment. Try another payment method or sandbox account.",
  ORDER_ALREADY_AUTHORIZED: "This payment is already held. Reload the page.",
  ORDER_ALREADY_CAPTURED: "This payment has already gone through. Reload the page.",
  DUPLICATE_INVOICE_ID: "PayPal saw this payment before. Reload the page and try again.",
  AUTHORIZATION_EXPIRED: "The hold expired before it was used. Ask the buyer to pay again.",
};

/**
 * What to show a person for a PayPal failure: the error name, what to do, and the debug_id.
 * `code` is PayPal's issue name, so the browser can react (INSTRUMENT_DECLINED → restart the popup).
 */
export function paypalErrorInfo(e: PayPalError): { code: string; message: string; debugId?: string } {
  const code = e.issue || `HTTP_${e.status}`;
  const help = PAYEE_ISSUES.has(code) ? PAYEE_ACCOUNT_HELP : HELP[code] || describe(e.body) || "PayPal couldn't complete this step. Try again in a moment.";
  return { code, message: `PayPal error ${code}: ${help}${e.debugId ? ` (debug id ${e.debugId})` : ""}`, debugId: e.debugId };
}

function describe(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as { message?: string; details?: { description?: string }[] };
    return j.details?.[0]?.description || j.message;
  } catch {
    return undefined;
  }
}

function issueOf(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as { name?: string; details?: { issue?: string }[] };
    return j.details?.[0]?.issue || j.name;
  } catch {
    return undefined;
  }
}

/**
 * One REST call. `requestId` is sent as PayPal-Request-Id: money-moving calls pass a key derived
 * from what they act on (e.g. `capture-<authId>`), so a retry or a double click returns the first
 * result instead of moving money twice. Other writes get a random one; GETs get none.
 */
async function call<T>(method: string, path: string, body?: unknown, opts: { requestId?: string; retried?: boolean } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(method === "GET" ? {} : { "PayPal-Request-Id": opts.requestId || crypto.randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !opts.retried) {
    tokenCache = null; // token revoked or rotated early: fetch a fresh one, once
    return call<T>(method, path, body, { ...opts, retried: true });
  }
  const text = await res.text();
  if (!res.ok) throw new PayPalError(`PayPal ${method} ${path} failed (${res.status}${issueOf(text) ? ` ${issueOf(text)}` : ""})`, res.status, text);
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
    purchase_units: [{ reference_id: opts.referenceId, custom_id: opts.referenceId.slice(0, 127), description: opts.description.slice(0, 127), amount: money(opts.amount, opts.currency) }],
  });
  return { id: o.id, status: o.status, approveUrl: o.links.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href };
}

/** Statuses (AuthorizationStatus / CaptureStatus) that mean no money is held or moved. */
const AUTH_FAILED = new Set(["DENIED", "VOIDED"]);
const CAPTURE_FAILED = new Set(["DECLINED", "FAILED"]);

/** PayPal honors an authorization for 3 days; it can be reauthorized on days 4–29, once (Payments v2). */
export const HONOR_PERIOD_DAYS = 3;
export const AUTHORIZATION_PERIOD_DAYS = 29;

export async function authorizeOrder(orderId: string): Promise<{ authorizationId: string; status: string; expiresAt?: string }> {
  if (paypalMode() === "mock") return { authorizationId: mockId("MOCKAUTH"), status: "CREATED" };
  const o = await call<{ purchase_units?: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[] }>(
    "POST", `/v2/checkout/orders/${orderId}/authorize`, {}, { requestId: `authorize-${orderId}` },
  );
  const a = o.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!a) throw new PayPalError("Authorize returned no authorization", 502, JSON.stringify(o));
  if (AUTH_FAILED.has(a.status)) throw new PayPalError(`PayPal ${a.status.toLowerCase()} the authorization`, 422, JSON.stringify(o));
  return { authorizationId: a.id, status: a.status, expiresAt: a.expiration_time };
}

export async function captureAuthorization(authorizationId: string): Promise<{ captureId: string; status: string }> {
  if (paypalMode() === "mock") return { captureId: mockId("MOCKCAP"), status: "COMPLETED" };
  const c = await call<{ id: string; status: string }>("POST", `/v2/payments/authorizations/${authorizationId}/capture`, { final_capture: true },
    { requestId: `capture-${authorizationId}` });
  if (CAPTURE_FAILED.has(c.status)) throw new PayPalError(`PayPal ${c.status.toLowerCase()} the capture`, 422, JSON.stringify(c));
  return { captureId: c.id, status: c.status };
}

export async function voidAuthorization(authorizationId: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "VOIDED" };
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, { requestId: `void-${authorizationId}` });
  return { status: "VOIDED" };
}

export async function reauthorize(authorizationId: string, amount: number, currency: string): Promise<{ authorizationId: string }> {
  if (paypalMode() === "mock") return { authorizationId: mockId("MOCKAUTH") };
  const a = await call<{ id: string; status: string }>("POST", `/v2/payments/authorizations/${authorizationId}/reauthorize`, { amount: money(amount, currency) },
    { requestId: `reauthorize-${authorizationId}` });
  if (AUTH_FAILED.has(a.status)) throw new PayPalError(`PayPal ${a.status.toLowerCase()} the reauthorization`, 422, JSON.stringify(a));
  return { authorizationId: a.id };
}

export async function refundCapture(captureId: string, amount: number, currency: string, note: string, ref?: string): Promise<{ refundId: string; status: string }> {
  if (paypalMode() === "mock") return { refundId: mockId("MOCKREF"), status: "COMPLETED" };
  const r = await call<{ id: string; status: string }>("POST", `/v2/payments/captures/${captureId}/refund`, {
    amount: money(amount, currency), note_to_payer: note.slice(0, 255), ...(ref ? { custom_id: ref.slice(0, 127) } : {}),
  }, { requestId: ref ? `refund-${ref}` : undefined });
  if (r.status === "FAILED" || r.status === "CANCELLED") throw new PayPalError(`PayPal refund ${r.status.toLowerCase()}`, 422, JSON.stringify(r));
  return { refundId: r.id, status: r.status };
}

/** Capture a CAPTURE-intent order after the payer approved it (shopping agent checkout). */
export async function captureOrder(orderId: string): Promise<{ captureId: string; status: string }> {
  if (paypalMode() === "mock") return { captureId: mockId("MOCKCAP"), status: "COMPLETED" };
  const o = await call<{ status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] }>(
    "POST", `/v2/checkout/orders/${orderId}/capture`, {}, { requestId: `capture-order-${orderId}` },
  );
  const c = o.purchase_units?.[0]?.payments?.captures?.[0];
  if (!c) throw new PayPalError("Capture returned no capture", 502, JSON.stringify(o));
  if (CAPTURE_FAILED.has(c.status)) throw new PayPalError(`PayPal ${c.status.toLowerCase()} the payment`, 422, JSON.stringify(o));
  return { captureId: c.id, status: c.status };
}

// ---------- Order tracking (fallback when the Agent Toolkit isn't available) ----------

/**
 * Orders v2 `POST /v2/checkout/orders/{id}/track`. PayPal tracks a *capture*: an authorization id
 * isn't accepted, so Vault shares tracking once the payment is released. (The toolkit's
 * create_shipment_tracking uses the older `/v1/shipping/trackers-batch` with the same capture id.)
 */
export async function addTracking(t: { captureId: string; orderId: string; trackingNumber: string; carrier: string; carrierNameOther?: string }): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "SHIPPED" };
  await call("POST", `/v2/checkout/orders/${t.orderId}/track`, {
    capture_id: t.captureId, tracking_number: t.trackingNumber, carrier: t.carrier,
    ...(t.carrier === "OTHER" ? { carrier_name_other: (t.carrierNameOther || "Other").slice(0, 64) } : {}),
    notify_payer: false, // Shield already tells the buyer
  }, { requestId: `track-${t.captureId}-${t.trackingNumber}` });
  return { status: "SHIPPED" };
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
      invoice_date: new Date().toISOString().slice(0, 10),
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: inv.dueDate },
    },
    primary_recipients: [{ billing_info: { email_address: inv.clientEmail, name: { full_name: inv.clientName } } }],
    items: inv.items.map((it) => ({ name: it.name.slice(0, 200), quantity: "1", unit_amount: money(it.amount, inv.currency) })),
    configuration: { allow_tip: false, partial_payment: { allow_partial_payment: true } },
  }, { requestId: `invoice-${inv.number}` });
  const id = created.id || created.href?.split("/").pop() || created.links?.find((l) => l.rel === "self")?.href.split("/").pop();
  if (!id) throw new PayPalError("Invoice created but no id returned", 500, JSON.stringify(created));
  // 200 returns the payer-view link; 202 (scheduled send) has no body, so read it off the invoice.
  const sent = await call<{ href?: string }>("POST", `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false },
    { requestId: `invoice-send-${id}` });
  let link = sent.href;
  if (!link) {
    const full = await call<{ detail?: { metadata?: { recipient_view_url?: string } } }>("GET", `/v2/invoicing/invoices/${id}`).catch(() => null);
    link = full?.detail?.metadata?.recipient_view_url;
  }
  return { invoiceId: id, status: "SENT", link };
}

export async function remindInvoice(invoiceId: string, subject: string, note: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "REMINDED" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, { subject: subject.slice(0, 100), note: note.slice(0, 4000), send_to_recipient: true, send_to_invoicer: false });
  return { status: "REMINDED" };
}

/**
 * Record a payment made *outside* PayPal (`POST /v2/invoicing/invoices/{id}/payments`).
 * PayPal records payments made through PayPal itself; don't call this for those (the webhook
 * path skips it), or the invoice gets paid twice on paper.
 */
export async function recordInvoicePayment(invoiceId: string, amount: number, currency: string, ref: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "PAID" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, {
    method: "OTHER", payment_date: new Date().toISOString().slice(0, 10), amount: money(amount, currency), note: "Recorded by Shield",
  }, { requestId: `invoice-payment-${invoiceId}-${ref}` });
  return { status: "PAID" };
}

export async function cancelInvoice(invoiceId: string): Promise<{ status: string }> {
  if (paypalMode() === "mock") return { status: "CANCELLED" };
  await call("POST", `/v2/invoicing/invoices/${invoiceId}/cancel`, { send_to_recipient: true, send_to_invoicer: true }, { requestId: `invoice-cancel-${invoiceId}` });
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

// ---------- Webhooks ----------

/**
 * `POST /v1/notifications/verify-webhook-signature`. The event goes in as the raw bytes PayPal
 * sent, spliced into the JSON rather than re-serialized: PayPal checks the signature against the
 * CRC32 of the exact body, and a parse/stringify round trip can change it.
 */
export async function verifyWebhookSignature(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
  const h = (k: string) => headers.get(k);
  const fields = {
    auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"), transmission_id: h("paypal-transmission-id"),
    transmission_sig: h("paypal-transmission-sig"), transmission_time: h("paypal-transmission-time"), webhook_id: webhookId,
  };
  if (Object.values(fields).some((v) => !v)) return false;
  const body = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${rawBody}}`;
  const send = async () => fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body,
  });
  let res = await send();
  if (res.status === 401) {
    tokenCache = null;
    res = await send();
  }
  if (!res.ok) return false;
  const j = (await res.json()) as { verification_status?: string };
  return j.verification_status === "SUCCESS";
}
