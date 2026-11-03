// PayPal Agent Toolkit adapter (@paypal/agent-toolkit).
//
// Shield's agents never call the toolkit directly: they propose a tool, the policy
// engine (lib/policy.ts) decides, and only an allowed call reaches runToolkit().
// The toolkit is loaded lazily and only when PayPal keys are set; in mock mode the
// callers use lib/paypal.ts's mock exactly as before.
import { paypalMode } from "./paypal";

/** The toolkit tools Shield uses, and the toolkit "actions" that enable them. */
export const TOOLKIT_ACTIONS = {
  payments: { createRefund: true },
  disputes: { list: true, get: true },
  orders: { get: true },
  invoices: { cancel: true, sendReminder: true },
  shipment: { create: true },
} as const;

export type ToolkitToolName = "create_refund" | "list_disputes" | "get_dispute" | "get_order" | "cancel_sent_invoice" | "send_invoice_reminder" | "create_shipment_tracking";

type Runner = (tool: ToolkitToolName, args: Record<string, unknown>) => Promise<unknown>;

/** The toolkit couldn't be loaded (not a PayPal API error). Safe to fall back to our REST client. */
export class ToolkitUnavailable extends Error {}

/** PayPal answered through the toolkit with an error. Never retried through REST (it could double-move money). */
export class ToolkitError extends Error {
  constructor(public tool: string, message: string, public detail?: unknown) {
    super(message);
  }
}

let override: Runner | null = null;
let loaded: Promise<Runner | null> | null = null;

/** Tests inject a fake toolkit here; pass null to restore the real one. */
export function setToolkitRunner(r: Runner | null) {
  override = r;
  loaded = null;
}

/** True when calls should go through the toolkit (PayPal keys present, or a test runner injected). */
export function toolkitActive(): boolean {
  return override !== null || paypalMode() === "sandbox";
}

export function toolkitLabel(tool: string): string {
  return `PayPal Agent Toolkit · ${tool}`;
}

async function load(): Promise<Runner | null> {
  try {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const base = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
    const toolkit = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      configuration: { actions: TOOLKIT_ACTIONS as unknown as Record<string, Record<string, boolean>>, context: { sandbox: base.includes("sandbox") } },
    });
    const tools = toolkit.getTools();
    return async (name, args) => {
      const t = tools[name] as { execute?: (a: unknown, o: unknown) => Promise<unknown> } | undefined;
      if (!t?.execute) throw new ToolkitUnavailable(`Toolkit tool ${name} isn't enabled`);
      return t.execute(args, { toolCallId: `shield_${Date.now()}`, messages: [] });
    };
  } catch (e) {
    console.warn("[toolkit] couldn't load @paypal/agent-toolkit, using the REST client:", (e as Error).message);
    return null;
  }
}

/** Run one toolkit tool. Returns PayPal's parsed JSON; throws ToolkitError on a PayPal error. */
export async function runToolkit(tool: ToolkitToolName, args: Record<string, unknown>): Promise<Record<string, any>> {
  const run = override ?? (await (loaded ??= load()));
  if (!run) throw new ToolkitUnavailable("PayPal Agent Toolkit isn't available");
  const raw = await run(tool, args);
  let out: Record<string, any>;
  try {
    out = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, any>) ?? {};
  } catch {
    out = { raw };
  }
  // The toolkit reports failures instead of throwing, in several shapes:
  // {error: {...}}, {status: "error", response}, or {ok: false, status: 404, code, message}.
  const failed = out?.error || out?.status === "error" || out?.ok === false || (typeof out?.status === "number" && out.status >= 400);
  if (failed) {
    const msg = out.error?.message || out.error?.details?.[0]?.description || out.response?.message || out.message || "PayPal returned an error";
    throw new ToolkitError(tool, `${tool}: ${msg}`, out);
  }
  return out;
}

/**
 * Run a toolkit tool when the toolkit is active, otherwise (mock mode, or the toolkit
 * failed to load) the given lib/paypal.ts fallback. Reports which path ran.
 */
export async function viaToolkit<T>(tool: ToolkitToolName, args: Record<string, unknown>, parse: (out: Record<string, any>) => T, fallback: () => Promise<T>): Promise<{ value: T; via: string }> {
  if (toolkitActive()) {
    try {
      return { value: parse(await runToolkit(tool, args)), via: toolkitLabel(tool) };
    } catch (e) {
      if (!(e instanceof ToolkitUnavailable)) throw e;
    }
    return { value: await fallback(), via: `PayPal REST (toolkit unavailable) · ${tool}` };
  }
  return { value: await fallback(), via: `${tool} · mock (no PayPal keys)` };
}
