import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { SiteNav } from "@/components/Nav";
import { signedInPersona } from "@/lib/session";
import { db } from "@/lib/store";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Shield",
  description: "Shield is an AI trust layer on PayPal. It stops scams before you pay, gets freelancers paid without the awkward chasing, and gives you support that actually fixes things.",
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
  const persona = await signedInPersona();
  const alerts = persona ? db().notifications.filter((n) => n.userId === persona && !n.read).length : 0;
  const pp = paypalMode();
  const ai = llmProvider();
  const modes = `PayPal ${pp === "mock" ? "mock mode (no sandbox keys)" : pp} · AI ${ai === "none" ? "rules only (no LLM key)" : ai}`;

  return (
    <html lang="en" data-theme={theme} className={manrope.variable}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <SiteNav signedIn={!!persona} persona={persona ?? undefined} alerts={alerts} theme={theme} modes={modes} />
        {children}
      </body>
    </html>
  );
}
