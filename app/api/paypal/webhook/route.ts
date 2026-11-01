import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { recordPayment, balance } from "@/lib/collections";
import { paypalMode } from "@/lib/paypal";

// Register this URL in the PayPal developer dashboard (sandbox app → Webhooks):
//   https://<your-app>/api/paypal/webhook   events: INVOICING.INVOICE.PAID, INVOICING.INVOICE.CANCELLED
async function verify(req: Request, raw: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || paypalMode() === "mock") return process.env.NODE_ENV !== "production";
  const base = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const tok = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }).then((r) => r.json());
  const h = (k: string) => req.headers.get(k) || "";
  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"), transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"), transmission_time: h("paypal-transmission-time"), webhook_id: webhookId,
      webhook_event: JSON.parse(raw),
    }),
  }).then((r) => r.json());
  return res.verification_status === "SUCCESS";
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verify(req, raw))) return NextResponse.json({ ok: false }, { status: 401 });
  const evt = JSON.parse(raw) as { event_type: string; resource?: { invoice?: { id: string }; id?: string } };
  const ppId = evt.resource?.invoice?.id || evt.resource?.id;
  const inv = db().invoices.find((i) => i.paypalInvoiceId === ppId);
  if (evt.event_type === "INVOICING.INVOICE.PAID" && inv && balance(inv) > 0) await recordPayment(inv.id, balance(inv));
  return NextResponse.json({ ok: true });
}
