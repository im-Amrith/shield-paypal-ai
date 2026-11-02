import { NextResponse } from "next/server";
import { PERSONAS } from "@/lib/session";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" as const, httpOnly: false };

/** Only same-site paths: "/vault", not "//evil.com" or "https://…". */
function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/app";
}

/**
 * Demo sign-in. Not real auth: it just picks which demo person you are.
 * - JSON  { persona }            → sets the cookie, returns { ok }      (persona switcher, smoke test)
 * - form  persona=…&next=…       → sets the cookie, 303 to next or /app (sign-in page, works without JS)
 * - form  action=signout         → clears the cookie, 303 to /
 */
export async function POST(req: Request) {
  const form = !(req.headers.get("content-type") || "").includes("application/json");
  const body: Record<string, unknown> = form ? Object.fromEntries(await req.formData()) : await req.json().catch(() => ({}));
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  if (body.action === "signout") {
    const res = form ? to("/") : NextResponse.json({ ok: true });
    res.cookies.delete("persona");
    return res;
  }
  const persona = body.persona as string;
  if (!PERSONAS.includes(persona as never)) {
    return form ? to("/signin") : NextResponse.json({ ok: false, error: "Unknown persona" }, { status: 400 });
  }
  const res = form ? to(safeNext(body.next)) : NextResponse.json({ ok: true });
  res.cookies.set("persona", persona, COOKIE);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("persona");
  return res;
}
