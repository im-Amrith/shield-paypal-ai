"use client";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PayPalScriptProvider, PayPalButtons as SdkButtons, ScriptContext, usePayPalScriptReducer, type ReactPayPalScriptOptions } from "@paypal/react-paypal-js";
import { api, ActionButton, ApiError, Spinner } from "./client";
import { setCheckoutOpen } from "./checkoutLock";

type Intent = "authorize" | "capture";
type Msg = { tone: "error" | "info"; text: string } | null;

const BUTTON_STYLE = { layout: "vertical", shape: "rect", label: "pay" } as const;

/** Readable text for whatever a PayPal callback or our API threw; details go to the console. */
function explain(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  // The SDK's own errors are long and technical: keep them for the console only.
  return m && m.length < 200 && !/paypal_js_sdk|zoid|window\.paypal/i.test(m) ? `${fallback}: ${m}` : `${fallback}. Please try again.`;
}

/**
 * Real PayPal Smart Buttons (official @paypal/react-paypal-js, JS SDK v5) when
 * NEXT_PUBLIC_PAYPAL_CLIENT_ID is set; otherwise a clearly labeled simulated approval (mock mode).
 *
 * - createOrder asks our API for a FRESH order (`orderBody` to `path`) at click time, so the order
 *   always matches the current amount and is never stale.
 * - After approval it POSTs `{...body, orderId}` to `path`, then refreshes the page once.
 * - From onClick until approve/cancel/error the checkout lock is held: LiveRefresh pauses, so the
 *   button's container is never re-rendered under the open popup.
 */
export function PayPalButtons({ currency, intent, path, orderBody, body, mockLabel, mockNote }: {
  currency: string; intent: Intent; path: string; orderBody: Record<string, unknown>; body: Record<string, unknown>; mockLabel: string; mockNote: string;
}) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) {
    return (
      <div>
        <ActionButton full path={path} body={body}>{mockLabel}</ActionButton>
        <p className="mt-2 text-[13px] text-muted">{mockNote}</p>
      </div>
    );
  }
  return <LiveButtons currency={currency} intent={intent} path={path} orderBody={orderBody} body={body} />;
}

/**
 * Loads the PayPal JS SDK once for everything inside it. Put it around a list of several
 * buttons (e.g. /shop's carts): two providers loading the same SDK at once inject the script
 * twice, and the second load destroys the first one's buttons ("zoid destroyed all components").
 * Without a client ID (mock mode) it renders its children only.
 */
export function PayPalProvider({ currency, intent, children }: { currency: string; intent: Intent; children: ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  // Stable options: the provider reloads the SDK when they change. One namespace per intent so an
  // AUTHORIZE script and a CAPTURE script never overwrite each other's window global.
  const options = useMemo<ReactPayPalScriptOptions | null>(() => clientId ? ({
    clientId, currency, intent, components: "buttons", dataNamespace: `paypal_${intent}`,
  }) : null, [clientId, currency, intent]);
  // Load only after mount. React StrictMode (dev) runs mount effects twice; if the provider loaded
  // on mount, the second run would inject the SDK again while the first copy is still loading, and
  // that re-initialisation destroys the rendered buttons. Updates aren't double-run, so this loads once.
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);
  return options ? <PayPalScriptProvider options={options} deferLoading={!armed}>{children}</PayPalScriptProvider> : <>{children}</>;
}

function LiveButtons({ currency, intent, path, orderBody, body }: {
  currency: string; intent: Intent; path: string; orderBody: Record<string, unknown>; body: Record<string, unknown>;
}) {
  const checkout = <Checkout path={path} orderBody={orderBody} body={body} />;
  // Inside a page-level PayPalProvider for the same currency and intent: share its SDK. Otherwise bring our own.
  const shared = useContext(ScriptContext)?.options;
  return shared && shared.currency === currency && shared.intent === intent
    ? checkout : <PayPalProvider currency={currency} intent={intent}>{checkout}</PayPalProvider>;
}

function Checkout({ path, orderBody, body }: { path: string; orderBody: Record<string, unknown>; body: Record<string, unknown> }) {
  const router = useRouter();
  const [{ isResolved, isRejected }] = usePayPalScriptReducer();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  // The latest props, read inside PayPal's callbacks without re-rendering the buttons.
  const latest = useRef({ path, orderBody, body });
  latest.current = { path, orderBody, body };
  const lastApiError = useRef<unknown>(null);

  // Never leave the lock held if the component goes away mid-checkout.
  useEffect(() => () => setCheckoutOpen(false), []);

  const done = (m: Msg, refresh = false) => {
    setCheckoutOpen(false);
    setBusy(false);
    setMsg(m);
    if (refresh) router.refresh();
  };

  if (isRejected) return <p role="alert" className="text-[14px] text-danger">Couldn&apos;t load PayPal. Check your connection and reload the page.</p>;

  return (
    <div>
      {!isResolved && <p className="flex items-center gap-2 text-[14px] text-muted"><Spinner /> Loading PayPal…</p>}
      {/* Stable position and no key: the SDK owns this container while the popup is open. */}
      {/* color-scheme light: on the dark theme a mismatched scheme makes the iframe paint opaque white. */}
      <SdkButtons
        className="max-w-[480px] [color-scheme:light]"
        style={BUTTON_STYLE}
        disabled={busy}
        onClick={() => {
          lastApiError.current = null;
          setMsg(null);
          setCheckoutOpen(true);
        }}
        createOrder={async () => {
          try {
            const { orderId } = await api<{ orderId: string }>(latest.current.path, latest.current.orderBody);
            return orderId;
          } catch (e) {
            lastApiError.current = e; // onError fires next; show this, not the SDK's wrapper
            throw e;
          }
        }}
        onApprove={async (data, actions) => {
          setBusy(true);
          setMsg({ tone: "info", text: "Confirming with PayPal…" });
          try {
            await api(latest.current.path, { ...latest.current.body, orderId: data.orderID });
            done(null, true);
          } catch (e) {
            console.error("[paypal] approve failed", e instanceof ApiError ? { code: e.code, debugId: e.debugId, message: e.message } : e);
            if (e instanceof ApiError && e.code === "INSTRUMENT_DECLINED") {
              // PayPal's advice: reopen the popup so the payer can pick another funding source.
              setBusy(false);
              setMsg({ tone: "error", text: e.message });
              return actions.restart();
            }
            done({ tone: "error", text: explain(e, "The payment didn't go through") }, true);
          }
        }}
        onCancel={() => done({ tone: "info", text: "Payment cancelled — nothing was charged." })}
        onError={(err) => {
          const cause = lastApiError.current ?? err;
          console.error("[paypal] checkout error", cause instanceof ApiError ? { code: cause.code, debugId: cause.debugId, message: cause.message } : cause);
          done({ tone: "error", text: explain(cause, "PayPal couldn't start the payment") });
        }}
      />
      {msg && <p role={msg.tone === "error" ? "alert" : "status"} className={`mt-2 text-[14px] ${msg.tone === "error" ? "text-danger" : "text-muted"}`}>{msg.text}</p>}
    </div>
  );
}

/** Vault: the buyer approves an AUTHORIZE order (funds held, not sent). */
export function PayPalPay({ dealId, currency }: { dealId: string; currency: string }) {
  return <PayPalButtons currency={currency} intent="authorize" path="/api/vault"
    orderBody={{ action: "order", id: dealId }} body={{ action: "authorize", id: dealId }}
    mockLabel="Approve payment with PayPal" mockNote="Mock mode: the approval is simulated. Add PayPal sandbox keys to see the real PayPal buttons here." />;
}
