import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui";
import { signedInPersona } from "@/lib/session";
import { safeNext } from "@/lib/url";

export const metadata: Metadata = { title: "Sign in · Shield" };

const PEOPLE = [
  { id: "meera", name: "Meera", tag: "Freelancer", line: "Invoices the agent chases for her, her account-health score, and a payment her dad was talked into." },
  { id: "ravi", name: "Ravi", tag: "Guardian mode", line: "Big, simple screens. A payment that looks like a scam waits until Meera says it's fine." },
  { id: "buyer", name: "Arjun", tag: "Buyer", line: "Buying a used camera through Vault. The money is held until the parcel arrives." },
  { id: "client", name: "Dana", tag: "Client", line: "Meera's invoice from the other side: pay in full, or half now with Pay Later." },
  { id: "agent", name: "Priya", tag: "Support", line: "The specialist console. Approve the refunds the AI can't make alone, or take over." },
];


export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const current = await signedInPersona();
  return (
    <main id="main" className="relative mx-auto w-full max-w-[1200px] px-4 pb-20 pt-[112px] sm:px-6 lg:px-10 lg:pt-[148px]">
      <div aria-hidden className="signin-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]" />
      <h1 className="max-w-[16ch] text-balance text-[clamp(34px,6vw,64px)] font-extrabold leading-[1.02] tracking-[-0.045em]">Pick who you want to be.</h1>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-muted lg:text-[18px]">
        Shield&apos;s demo has five people in one story. Each one sees a different side of it. You can switch at any time from the avatar menu.
      </p>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-4">
        {PEOPLE.map((p) => (
          <li key={p.id}>
            <form action="/api/session" method="post" className="h-full">
              <input type="hidden" name="persona" value={p.id} />
              <input type="hidden" name="next" value={next} />
              <button aria-label={`Continue as ${p.name}, ${p.tag}`} aria-describedby={`who-${p.id}`}
                className="lift group flex h-full w-full flex-col rounded-[20px] border border-border bg-card p-5 text-left lg:p-6">
                <span className="flex items-center gap-3">
                  <Avatar id={p.id} size={48} />
                  <span>
                    <span className="block text-[19px] font-extrabold tracking-[-0.02em]">{p.name}</span>
                    <span className="mt-0.5 inline-block rounded-full border border-border px-2 py-0.5 text-[12px] font-semibold text-muted">{p.tag}</span>
                  </span>
                  {current === p.id && <span className="ml-auto rounded-full bg-accent-tint px-2.5 py-1 text-[12px] font-bold text-accent">Signed in</span>}
                </span>
                <span id={`who-${p.id}`} className="mt-4 block text-[15px] leading-relaxed text-muted">{p.line}</span>
                <span className="mt-auto flex items-center gap-1.5 pt-6 text-[15px] font-bold text-accent">
                  Continue as {p.name}
                  <ArrowRight size={17} aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[14px] text-muted">Demo accounts — no real money moves.</p>
    </main>
  );
}
