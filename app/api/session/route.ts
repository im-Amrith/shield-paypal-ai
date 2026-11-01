import { NextResponse } from "next/server";
import { PERSONAS } from "@/lib/session";

export async function POST(req: Request) {
  const { persona } = await req.json();
  if (!PERSONAS.includes(persona)) return NextResponse.json({ ok: false, error: "Unknown persona" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("persona", persona, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  return res;
}
