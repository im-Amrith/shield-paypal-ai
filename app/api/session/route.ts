import { NextResponse } from "next/server";
import { PERSONAS } from "@/lib/session";
import { redirectTo, safeNext } from "@/lib/url";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" as const, httpOnly: false };

/**
 * Demo sign-in. Not real auth: it just picks which demo person you are.
 * - JSON  { persona }            → sets the cookie, returns { ok }      (persona switcher, smoke test)
 * - form  persona=…&next=…       → sets the cookie, 303 to next or /app (sign-in page, works without JS)
 * - form  action=signout         → clears the cookie, 303 to /
 * Redirects use a relative Location: behind Render's proxy req.url is http://localhost:10000/….
 */
export async function POST(req: Request) {
  const form = !(req.headers.get("content-type") || "").includes("application/json");
  const body: Record<string, unknown> = form ? Object.fromEntries(await req.formData()) : await req.json().catch(() => ({}));

  if (body.action === "signout") {
    const res = form ? redirectTo("/") : NextResponse.json({ ok: true });
    res.cookies.delete("persona");
    return res;
  }
  const persona = body.persona as string;
  if (!PERSONAS.includes(persona as never)) {
    return form ? redirectTo("/signin") : NextResponse.json({ ok: false, error: "Unknown persona" }, { status: 400 });
  }
  const res = form ? redirectTo(safeNext(body.next)) : NextResponse.json({ ok: true });
  res.cookies.set("persona", persona, COOKIE);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("persona");
  return res;
}
