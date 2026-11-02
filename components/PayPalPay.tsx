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
 */
export function PayPalPay({ dealId, orderId, currency }: { dealId: string; orderId: string; currency: string }) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    const render = () => {
      if (!window.paypal || !ref.current) return;
      ref.current.innerHTML = "";
      window.paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },
        createOrder: () => orderId,
        onApprove: async (data: { orderID: string }) => {
          try {
            await api("/api/vault", { action: "authorize", id: dealId, orderId: data.orderID });
            router.refresh();
          } catch (e) { setErr((e as Error).message); }
        },
        onError: (e: Error) => setErr(e?.message || "PayPal error"),
      }).render(ref.current);
    };
    const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=authorize`;
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { render(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = render;
    s.onerror = () => setErr("Couldn't load PayPal");
    document.body.appendChild(s);
  }, [clientId, orderId, currency, dealId, router]);

  if (!clientId) {
    return (
      <div>
        <ActionButton full path="/api/vault" body={{ action: "authorize", id: dealId }}>Approve payment with PayPal</ActionButton>
        <p className="mt-2 text-[13px] text-muted">Mock mode: the approval is simulated. Add PayPal sandbox keys to see the real PayPal buttons here.</p>
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
