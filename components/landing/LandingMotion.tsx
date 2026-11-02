"use client";
/*
 * The landing page's motion system: Lenis smooth scroll synced to GSAP ScrollTrigger, the pinned
 * hero, the scrubbed word reveal, the sticky story stack, the guardrails line-drawing and one-time
 * section reveals. Everything lives in one gsap.matchMedia() inside useGSAP, so it is reverted on
 * unmount (navigating to the app) and skipped entirely under prefers-reduced-motion.
 */
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { heroState } from "./heroState";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function LandingMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = root.current!;
    const q = <T extends Element = HTMLElement>(s: string) => [...el.querySelectorAll<T>(s)];
    const mm = gsap.matchMedia();
    const off: (() => void)[] = [];
    const listen = (t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) => { t.addEventListener(type, fn, o); off.push(() => t.removeEventListener(type, fn)); };

    let lenis: Lenis | null = null;

    // "See how it works" and other in-page links: smooth when allowed, instant otherwise.
    q<HTMLAnchorElement>("[data-scroll-to]").forEach((a) => listen(a, "click", (e) => {
      const target = document.querySelector(a.getAttribute("href") || "");
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -8, duration: 1.4 });
      else target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      (target as HTMLElement).focus?.({ preventScroll: true });
    }));

    mm.add({ motion: "(prefers-reduced-motion: no-preference)", wide: "(min-width: 1024px)", hover: "(hover: hover) and (pointer: fine)" }, (ctx) => {
      const { motion, wide, hover } = ctx.conditions as { motion: boolean; wide: boolean; hover: boolean };
      if (!motion) { heroState.progress = 0; heroState.active = true; return; }

      /* ---------- Lenis ⇄ ScrollTrigger ---------- */
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (t: number) => lenis?.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      /* ---------- Hero: pinned while the 3D scene plays ---------- */
      const hero = el.querySelector<HTMLElement>("[data-hero]");
      if (hero) {
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: hero, start: "top top", end: () => `+=${innerHeight * (wide ? 1.6 : 1.2)}`,
            pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: (s) => { heroState.progress = s.progress; },
          },
        });
        tl.to(hero.querySelector("[data-hero-copy]"), { autoAlpha: 0, y: -48, duration: 0.25 }, 0)
          .fromTo(hero.querySelector("[data-hero-caption]"), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.15 }, 0.48)
          .to(hero.querySelector("[data-hero-caption]"), { autoAlpha: 0, y: -16, duration: 0.1 }, 0.84)
          .to(hero.querySelector("[data-hero-canvas]"), { autoAlpha: 0, duration: 0.14 }, 0.86);
        // Pause the WebGL loop while the hero is off-screen.
        ScrollTrigger.create({ trigger: hero, start: "top bottom", end: "bottom top", onToggle: (s) => { heroState.active = s.isActive; } });
      }

      /* ---------- The problem: three lines, revealed word by word ---------- */
      const problem = el.querySelector<HTMLElement>("[data-problem]");
      if (problem) {
        const lines = q<HTMLElement>("[data-problem] [data-line]").map((l) => [...l.querySelectorAll<HTMLElement>(".wr")]);
        lines.flat().forEach((w) => w.style.setProperty("--p", "0"));
        ScrollTrigger.create({
          trigger: problem, start: "top top", end: () => `+=${innerHeight * (wide ? 2.2 : 1.8)}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (s) => {
            const P = Math.min(1, s.progress / 0.9); // finish slightly before the pin releases
            lines.forEach((words, i) => {
              const lp = Math.min(1, Math.max(0, P * lines.length - i));
              words.forEach((w, j) => w.style.setProperty("--p", String(Math.min(1, Math.max(0, lp * (words.length + 2) - j - 1)).toFixed(3))));
            });
          },
        });
      }

      /* ---------- One-time reveals (sections fade and rise in, once) ---------- */
      const reveals = q("[data-reveal]");
      gsap.set(reveals, { autoAlpha: 0, y: 32 });
      ScrollTrigger.batch(reveals, {
        start: "top 86%", once: true,
        onEnter: (batch) => {
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.95, ease: "power3.out", stagger: 0.08, overwrite: true });
          batch.forEach((b) => b.classList.add("art-play"));
        },
      });

      /* ---------- How it works: sticky stack + step timelines that draw on ---------- */
      const cards = q("[data-stack-card]");
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (next) {
          gsap.to(card.firstElementChild, {
            scale: 0.93, "--dim": 0.65, ease: "none", transformOrigin: "50% 0%",
            scrollTrigger: { trigger: next, start: "top 90%", end: () => `top ${wide ? 160 : 120}px`, scrub: true, invalidateOnRefresh: true },
          });
        }
        const line = card.querySelector<SVGPathElement>("[data-step-line]");
        const dots = [...card.querySelectorAll<HTMLElement>("[data-step]")];
        if (line) {
          gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
          dots.forEach((d) => d.removeAttribute("data-on"));
          gsap.to(line, {
            strokeDashoffset: 0, ease: "none",
            scrollTrigger: {
              trigger: card, start: "top 80%", end: "top 25%", scrub: 0.6,
              onUpdate: (s) => dots.forEach((d, k) => d.toggleAttribute("data-on", s.progress >= k / Math.max(1, dots.length - 1) - 0.02)),
            },
          });
        }
      });

      /* ---------- Guardrails: the flow draws in sequence ---------- */
      const g = el.querySelector("[data-guardrails]");
      if (g) {
        const lines = q<SVGPathElement>("[data-guardrails] .gline");
        const nodes = q("[data-guardrails] .gnode");
        gsap.set(lines, { strokeDasharray: 1, strokeDashoffset: 1 });
        gsap.set(nodes, { autoAlpha: 0.15 });
        const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: g, start: "top 72%", end: "bottom 62%", scrub: 0.8 } });
        for (let step = 0; step <= 5; step++) {
          tl.to(q(`[data-guardrails] .gnode[data-g="${step}"]`), { autoAlpha: 1, duration: 0.5 }, step);
          tl.to(q(`[data-guardrails] .gline[data-g="${step}"]`), { strokeDashoffset: 0, duration: 0.8 }, step + 0.3);
        }
      }

      /* ---------- Bento cards: subtle parallax inside the mock, pointer only ---------- */
      if (hover) {
        q("[data-tilt]").forEach((card) => {
          const mock = card.querySelector("[data-tilt-layer]");
          if (!mock) return;
          const xTo = gsap.quickTo(mock, "x", { duration: 0.6, ease: "power3.out" });
          const yTo = gsap.quickTo(mock, "y", { duration: 0.6, ease: "power3.out" });
          listen(card, "pointermove", (e) => {
            const r = card.getBoundingClientRect(), p = e as PointerEvent;
            xTo(((p.clientX - r.left) / r.width - 0.5) * 14);
            yTo(((p.clientY - r.top) / r.height - 0.5) * 10);
          });
          listen(card, "pointerleave", () => { xTo(0); yTo(0); });
        });
      }

      document.fonts?.ready.then(() => ScrollTrigger.refresh());

      return () => {
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        lenis?.destroy();
        lenis = null;
        heroState.progress = 0;
        heroState.active = true;
      };
    });

    return () => { off.forEach((f) => f()); mm.revert(); };
  }, { scope: root });

  return <div ref={root}>{children}</div>;
}
