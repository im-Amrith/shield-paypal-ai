import { signedInPersona } from "@/lib/session";
import { Hero } from "@/components/landing/Hero";
import { LandingMotion } from "@/components/landing/LandingMotion";
import { Problem, Pillars, HowItWorks, Guardrails, BuiltOn, FinalCta, SiteFooter } from "@/components/landing/Sections";

export default async function Landing() {
  const signedIn = !!(await signedInPersona());
  return (
    <LandingMotion>
      <main id="main" className="landing">
        <Hero signedIn={signedIn} />
        <Problem />
        <Pillars signedIn={signedIn} />
        <HowItWorks />
        <Guardrails />
        <BuiltOn />
        <FinalCta signedIn={signedIn} />
      </main>
      <SiteFooter />
    </LandingMotion>
  );
}
