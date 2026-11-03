import { NextResponse, type NextRequest } from "next/server";

// Demo sign-in guard. Kept self-contained (proxy shouldn't rely on app modules).
const PERSONAS = ["meera", "ravi", "buyer", "client", "agent"];
// API routes that must work without a persona: sign-in itself, PayPal's webhook, the cron job.
const PUBLIC_API = ["/api/session", "/api/paypal/webhook", "/api/jobs"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const persona = req.cookies.get("persona")?.value;
  if (persona && PERSONAS.includes(persona)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
    return NextResponse.json({ ok: false, error: "Sign in first" }, { status: 401 });
  }
  // Middleware must return an absolute Location. Built on the request's own origin (on Render that's
  // the internal localhost:10000), Next rewrites it to the relative "/signin?next=…" before sending,
  // so the browser stays on the public host. Never build it from x-forwarded-* or APP_URL here.
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = `?${new URLSearchParams({ next: pathname + search })}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/app",
    "/alerts",
    "/console",
    "/demo",
    "/subscriptions",
    "/shop",
    "/support",
    "/get-paid/:path*",
    "/guardian/:path*",
    "/protect/:path*",
    "/vault/:path*",
    "/api/:path*",
  ],
};
