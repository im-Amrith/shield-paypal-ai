"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ActionButton } from "./client";

declare global {
  interface Window { paypal?: any }
}

/**
 * Real PayPal Smart Buttons when NEXT_PUBLIC_PAYPAL_CLIENT_ID is set (sandbox),
 * otherwise a clearly labeled simulated approval for the mock mode.
 * After approval it POSTs `{...body, orderId}` to `path`. Each intent loads the SDK under
 * its own namespace, so Vault (authorize) and the shopping agent (capture) can coexist.
 */
export function PayPalButtons({ orderId, currency, intent, path, body, mockLabel, mockNote }: {
  orderId: string; currency: string; intent: "authorize" | "capture"; path: string; body: Record<string, unknown>; mockLabel: string; mockNote: string;
}) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    const ns = `paypal_${intent}`;
    const render = () => {
      const sdk = (window as unknown as Record<string, any>)[ns];
      if (!sdk || !ref.current) return;
      ref.current.innerHTML = "";
      sdk.Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },
        createOrder: () => orderId,
        onApprove: async (data: { orderID: string }) => {
          try {
            await api(path, { ...JSON.parse(bodyKey), orderId: data.orderID });
            router.refresh();
          } catch (e) { setErr((e as Error).message); }
        },
        onError: (e: Error) => setErr(e?.message || "PayPal error"),
      }).render(ref.current);
    };
    const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=${intent}`;
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { render(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.dataset.namespace = ns;
    s.onload = render;
    s.onerror = () => setErr("Couldn't load PayPal");
    document.body.appendChild(s);
  }, [clientId, orderId, currency, intent, path, bodyKey, router]);

  if (!clientId) {
    return (
      <div>
        <ActionButton full path={path} body={body}>{mockLabel}</ActionButton>
        <p className="mt-2 text-[13px] text-muted">{mockNote}</p>
      </div>
    );
  }
  return (
    <div>
      <div ref={ref} />
      {err && <p role="alert" className="mt-2 text-[14px] text-danger">{err}</p>}
    </div>
  );
}

/** Vault: the buyer approves an AUTHORIZE order (funds held, not sent). */
export function PayPalPay({ dealId, orderId, currency }: { dealId: string; orderId: string; currency: string }) {
  return <PayPalButtons orderId={orderId} currency={currency} intent="authorize" path="/api/vault" body={{ action: "authorize", id: dealId }}
    mockLabel="Approve payment with PayPal" mockNote="Mock mode: the approval is simulated. Add PayPal sandbox keys to see the real PayPal buttons here." />;
}
