import { NextResponse } from "next/server";

/** Wrap a route handler: JSON in, JSON out, errors as 400 with a message. */
export function handle<T>(fn: (body: Record<string, any>, req: Request) => Promise<T> | T) {
  return async (req: Request) => {
    try {
      const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
      const out = await fn(body, req);
      return NextResponse.json({ ok: true, data: out });
    } catch (e) {
      const msg = (e as Error).message || "Something went wrong";
      console.error("[api]", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  };
}
