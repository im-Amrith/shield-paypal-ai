import { LiveRefresh } from "@/components/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { paypalMode } from "@/lib/paypal";
import { llmProvider } from "@/lib/llm";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pp = paypalMode();
  const ai = llmProvider();
  const modes = `PayPal ${pp === "mock" ? "mock mode (no sandbox keys)" : pp} · AI ${ai === "none" ? "rules only (no LLM key)" : ai}`;
  return (
    <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-[88px] sm:px-6 lg:px-10 lg:pt-[104px]">
      <Breadcrumbs />
      {children}
      <p className="mt-12 text-center text-[12px] text-muted lg:text-left">{modes}. Account limits, delivery scans and FX fees are simulated or estimated.</p>
      <LiveRefresh />
    </main>
  );
}
