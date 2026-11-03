import { NextResponse } from "next/server";

// Public URLs. On Render the app runs behind a proxy on an internal port (localhost:10000), so
// req.url / request.nextUrl carry the internal host. Never build a link or redirect from them.

const trim = (s: string) => s.replace(/\/+$/, "");

type HeaderSource = Request | Headers | { get(name: string): string | null } | null | undefined;

function headerOf(src: HeaderSource, name: string): string | null {
  if (!src) return null;
  const h = src instanceof Request ? src.headers : src;
  // x-forwarded-* may be a comma-separated chain: the first entry is the client-facing one.
  return h.get(name)?.split(",")[0]?.trim() || null;
}

/**
 * The origin users reach the app on: APP_URL if set, else Render's RENDER_EXTERNAL_URL, else the
 * proxy's x-forwarded-proto + x-forwarded-host, else the request URL (local dev).
 */
export function publicBaseUrl(src?: HeaderSource): string {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return trim(configured);
  const host = headerOf(src, "x-forwarded-host");
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const proto = headerOf(src, "x-forwarded-proto") === "http" ? "http" : "https";
    return `${proto}://${host}`;
  }
  if (src instanceof Request) return new URL(src.url).origin;
  const h = headerOf(src, "host");
  if (h && /^[a-z0-9.-]+(:\d+)?$/i.test(h)) return `http://${h}`;
  return "http://localhost:3000";
}

/** Absolute public URL for an in-app path (emails, share links). */
export function publicUrl(path: string, src?: HeaderSource): string {
  return `${publicBaseUrl(src)}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Only same-site paths survive as a `next=` target: "/vault?x=1" yes; "//evil.com",
 * "/\\evil.com", "https://evil.com", "javascript:…" and anything with control characters, no.
 */
export function safeNext(v: unknown, fallback = "/app"): string {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(v)) return fallback;
  try {
    const u = new URL(v, "http://same.invalid");
    if (u.origin !== "http://same.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/** A redirect with a relative Location, so the browser stays on whatever host it used. */
export function redirectTo(path: string, status = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: safeNext(path, "/") } });
}
