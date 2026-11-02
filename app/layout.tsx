import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar, TopBar, DeskBar, TabBar, type NavCounts } from "@/components/Nav";
import { LiveRefresh } from "@/components/client";
import { getUser } from "@/lib/session";
import { db } from "@/lib/store";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Shield",
  description: "Pay, get paid and get help, with an AI that checks first. Scam checks, escrow, Guardian mode, collections and support that resolves things.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Shield", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  const light = (await cookies()).get("theme")?.value === "light";
  return { themeColor: light ? "#f7f8fa" : "#0a0a0a", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  const me = await getUser();
  const d = db();
  const counts: NavCounts = {
    alerts: d.notifications.filter((n) => n.userId === me.id && !n.read).length,
    dadHolds: d.holds.filter((h) => h.guardianId === me.id && h.status === "held").length,
    myHolds: d.holds.filter((h) => h.seniorId === me.id && h.status === "held").length,
    waiting: d.cases.filter((c) => c.status === "waiting_human").length,
    invoicesDue: d.invoices.filter((i) => i.clientEmail === me.email && (i.status === "sent" || i.status === "partially_paid")).length,
    disputes: d.vaultDeals.filter((v) => v.status === "disputed").length,
  };
  const pp = paypalMode();
  const ai = llmProvider();
  const modes = `PayPal ${pp === "mock" ? "mock mode (no sandbox keys)" : pp} · AI ${ai === "none" ? "rules only (no LLM key)" : ai}`;
  const name = me.name.replace(/ \(.*\)$/, "");

  return (
    <html lang="en" data-theme={theme} className={manrope.variable}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <div className="lg:flex">
          <Sidebar role={me.role} name={name} counts={counts} />
          <div className="min-w-0 flex-1">
            <TopBar persona={me.id} alerts={counts.alerts} theme={theme} modes={modes} />
            <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pb-12 lg:pt-6">
              <DeskBar persona={me.id} alerts={counts.alerts} theme={theme} modes={modes} />
              {children}
              <p className="mt-10 text-center text-[12px] text-muted lg:text-left">{modes}. Account limits, delivery scans and FX fees are simulated or estimated.</p>
            </main>
          </div>
        </div>
        <TabBar role={me.role} counts={counts} />
        <LiveRefresh />
      </body>
    </html>
  );
}
