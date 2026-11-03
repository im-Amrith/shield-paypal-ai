import { NextResponse } from "next/server";
import { db, mutate } from "@/lib/store";
import { recordPayment, balance } from "@/lib/collections";
import { paypalMode, verifyWebhookSignature } from "@/lib/paypal";

// Register this URL in the PayPal developer dashboard (sandbox app → Webhooks):
//   https://<your-app>/api/paypal/webhook   events: INVOICING.INVOICE.PAID, INVOICING.INVOICE.CANCELLED
// and put the webhook's id in PAYPAL_WEBHOOK_ID.
async function verify(req: Request, raw: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  // Unsigned events are only accepted in local development without PayPal keys.
  if (!webhookId || paypalMode() === "mock") return process.env.NODE_ENV !== "production";
  try {
    return await verifyWebhookSignature(req.headers, raw, webhookId);
  } catch {
    return false;
  }
}

type InvoiceEvent = { event_type?: string; resource?: { id?: string; invoice?: { id?: string } } };

export async function POST(req: Request) {
  const raw = await req.text();
  let evt: InvoiceEvent;
  try {
    evt = JSON.parse(raw) as InvoiceEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!(await verify(req, raw))) return NextResponse.json({ ok: false }, { status: 401 });
  // INVOICING.INVOICE.* events carry the invoice as the resource (older payloads nest it under resource.invoice).
  const ppId = evt.resource?.invoice?.id || evt.resource?.id;
  const inv = ppId ? db().invoices.find((i) => i.paypalInvoiceId === ppId) : undefined;
  if (evt.event_type === "INVOICING.INVOICE.PAID" && inv && balance(inv) > 0)
    await recordPayment(inv.id, balance(inv), { paidThroughPayPal: true });
  if (evt.event_type === "INVOICING.INVOICE.CANCELLED" && inv && inv.status !== "paid")
    mutate((d) => {
      d.invoices.find((i) => i.id === inv.id)!.status = "cancelled";
    });
  return NextResponse.json({ ok: true });
}
