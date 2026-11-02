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
  const url = new URL("/signin", req.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/app",
    "/alerts",
    "/console",
    "/demo",
    "/subscriptions",
    "/support",
    "/get-paid/:path*",
    "/guardian/:path*",
    "/protect/:path*",
    "/vault/:path*",
    "/api/:path*",
  ],
};
