import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/session/route";
import { proxy } from "@/proxy";
import { publicBaseUrl, publicUrl, safeNext } from "@/lib/url";
import { PayPalError, paypalErrorInfo, PAYEE_ACCOUNT_HELP } from "@/lib/paypal";

// Render runs the app on an internal port behind its proxy: the request URL says localhost:10000.
const RENDER = { host: "localhost:10000", "x-forwarded-host": "shield-6ojs.onrender.com", "x-forwarded-proto": "https" };

function signIn(fields: Record<string, string>) {
  return POST(new Request("http://localhost:10000/api/session", {
    method: "POST", headers: { ...RENDER, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields),
  }));
}

describe("redirects behind Render's proxy", () => {
  const saved = { APP_URL: process.env.APP_URL, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL };
  afterEach(() => Object.assign(process.env, saved));

  it("sign-in never redirects to the internal localhost host", async () => {
    const res = await signIn({ persona: "meera", next: "/vault?x=1" });
    expect(res.status).toBe(303);
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("localhost");
    expect(loc).toBe("/vault?x=1");
    expect(res.headers.get("set-cookie")).toContain("persona=meera");
    expect((await signIn({ persona: "meera" })).headers.get("location")).toBe("/app");
  });

  it("sign-out and an unknown persona redirect relatively too", async () => {
    expect((await signIn({ action: "signout" })).headers.get("location")).toBe("/");
    expect((await signIn({ persona: "nobody" })).headers.get("location")).toBe("/signin");
  });

  it("an open-redirect next falls back to /app", async () => {
    for (const next of ["//evil.com", "https://evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "/a\nb", "/a\rSet-Cookie:x"]) {
      expect((await signIn({ persona: "meera", next })).headers.get("location"), next).toBe("/app");
    }
  });

  it("the proxy's sign-in redirect stays on the request's own origin (Next sends it as a relative path)", () => {
    const res = proxy(new NextRequest("http://localhost:10000/vault?x=1", { headers: RENDER }));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    // Same origin as the request, so Next's middleware adapter relativizes it to "/signin?next=…".
    expect(loc.origin).toBe("http://localhost:10000");
    expect(loc.pathname + loc.search).toBe("/signin?next=%2Fvault%3Fx%3D1");
  });

  it("publicBaseUrl: APP_URL, then RENDER_EXTERNAL_URL, then the forwarded host, never the internal one", () => {
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    const req = new Request("http://localhost:10000/x", { headers: RENDER });
    expect(publicBaseUrl(req)).toBe("https://shield-6ojs.onrender.com");
    expect(publicUrl("/vault/v1", req.headers)).toBe("https://shield-6ojs.onrender.com/vault/v1");
    expect(publicBaseUrl(new Request("http://localhost:3000/x"))).toBe("http://localhost:3000");
    expect(publicBaseUrl(new Request("http://localhost:10000/x", { headers: { "x-forwarded-host": "evil.com/path" } }))).toBe("http://localhost:10000");
    process.env.RENDER_EXTERNAL_URL = "https://shield-6ojs.onrender.com";
    expect(publicBaseUrl()).toBe("https://shield-6ojs.onrender.com");
    process.env.APP_URL = "https://shield.example/";
    expect(publicBaseUrl(req)).toBe("https://shield.example");
  });

  it("safeNext keeps same-site paths only", () => {
    expect(safeNext("/get-paid/pay/INV-1001?a=1#b")).toBe("/get-paid/pay/INV-1001?a=1#b");
    expect(safeNext("//evil.com")).toBe("/app");
    expect(safeNext("/\\evil.com")).toBe("/app");
    expect(safeNext("https://evil.com")).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
  });
});

describe("PayPal checkout errors", () => {
  const err = (issue: string, debug = "f00d1234") =>
    new PayPalError(`PayPal POST /v2/checkout/orders failed (422 ${issue})`, 422, JSON.stringify({ name: "UNPROCESSABLE_ENTITY", details: [{ issue }], debug_id: debug }));

  it("payee currency and restriction errors tell you to use a US sandbox business account", () => {
    for (const issue of ["UNSUPPORTED_PAYEE_CURRENCY", "PAYEE_ACCOUNT_RESTRICTED"]) {
      const info = paypalErrorInfo(err(issue));
      expect(info.code).toBe(issue);
      expect(info.message).toContain(issue);
      expect(info.message).toContain(PAYEE_ACCOUNT_HELP);
      expect(info.debugId).toBe("f00d1234");
    }
  });

  it("INSTRUMENT_DECLINED names the error, says what to do and carries the debug id", () => {
    const info = paypalErrorInfo(err("INSTRUMENT_DECLINED"));
    expect(info.message).toMatch(/^PayPal error INSTRUMENT_DECLINED: .*declined.*\(debug id f00d1234\)$/);
  });

  it("unknown issues fall back to PayPal's description", () => {
    const e = new PayPalError("x", 422, JSON.stringify({ details: [{ issue: "SOMETHING_NEW", description: "Something new happened." }] }));
    expect(paypalErrorInfo(e).message).toBe("PayPal error SOMETHING_NEW: Something new happened.");
  });
});
