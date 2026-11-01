import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bell, ShieldCheck } from "lucide-react";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { PersonaSwitcher, LiveRefresh } from "@/components/client";
import { getPersona } from "@/lib/session";
import { db } from "@/lib/store";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";

export const metadata: Metadata = {
  title: "Shield — an AI trust layer built on PayPal",
  description: "Scam checks, escrow, Guardian mode, AI collections and support that actually resolves things.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#14213d", width: "device-width", initialScale: 1 };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getPersona();
  const unread = db().notifications.filter((n) => n.userId === me && !n.read).length;
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:p-2">Skip to content</a>
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck size={22} className="text-brand" aria-hidden /> Shield
            </Link>
            <div className="flex items-center gap-3">
              <PersonaSwitcher current={me} />
              <Link href="/#alerts" aria-label={`${unread} unread alerts`} className="relative">
                <Bell size={20} aria-hidden />
                {unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
            </div>
          </div>
          {(paypalMode() === "mock" || llmProvider() === "none") && (
            <p className="mx-auto max-w-md px-4 pb-2 text-[11px] text-ink/50">
              {paypalMode() === "mock" ? "PayPal: mock mode (add sandbox keys). " : "PayPal: sandbox. "}
              {llmProvider() === "none" ? "AI: rules only (add an LLM key)." : `AI: ${llmProvider()}.`}
            </p>
          )}
        </header>
        <main id="main" className="mx-auto max-w-md px-4 pb-28 pt-4">{children}</main>
        <BottomNav />
        <LiveRefresh />
      </body>
    </html>
  );
}
