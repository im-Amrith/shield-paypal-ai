import { NextResponse } from "next/server";
import { PayPalError, paypalErrorInfo } from "./paypal";

/**
 * Wrap a route handler: JSON in, JSON out, errors as 400 with a message. PayPal failures come back
 * as a readable message plus PayPal's issue `code` and `debugId` (also logged for support).
 */
export function handle<T>(fn: (body: Record<string, any>, req: Request) => Promise<T> | T) {
  return async (req: Request) => {
    try {
      const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
      const out = await fn(body, req);
      return NextResponse.json({ ok: true, data: out });
    } catch (e) {
      if (e instanceof PayPalError) {
        const info = paypalErrorInfo(e);
        console.error("[api] PayPal", e.status, info.code, "debug_id:", e.debugId ?? "none", "-", e.message);
        return NextResponse.json({ ok: false, error: info.message, code: info.code, debugId: info.debugId }, { status: 400 });
      }
      const msg = (e as Error).message || "Something went wrong";
      console.error("[api]", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  };
}
