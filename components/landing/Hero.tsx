"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SceneColors } from "./HeroScene";
import { heroState } from "./heroState";

// three.js, R3F and postprocessing load only here, after the headline has painted.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

function readColors(): SceneColors {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { page: v("--page"), fg: v("--fg"), muted: v("--muted"), accent: v("--accent"), light: document.documentElement.dataset.theme === "light" };
}

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

type Mode = "pending" | "3d" | "static";

export function Hero({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<Mode>("pending");
  const [colors, setColors] = useState<SceneColors | null>(null);
  const [ready, setReady] = useState(false);
  const [light, setLight] = useState(false);
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    setColors(readColors());
    setLight(html.dataset.theme === "light");
    const mo = new MutationObserver(() => { setColors(readColors()); setLight(html.dataset.theme === "light"); });
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });

    const cap = new URLSearchParams(location.search).has("capture");
    setCapture(cap);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!cap && (reduce || !webglOK())) { setMode("static"); return () => mo.disconnect(); }
    // Start the 3D scene once the page is idle, so it never competes with the headline.
    // On phones and touch screens, wait for the first touch, scroll or key press: three.js is
    // heavy to parse on a mobile CPU, and the backdrop glow stands in until then.
    const go = () => setMode("3d");
    const idle = "requestIdleCallback" in window;
    let h = 0;
    const start = () => { h = idle ? window.requestIdleCallback(go, { timeout: 1500 }) : window.setTimeout(go, 600); };
    const light3d = matchMedia("(pointer: coarse)").matches || innerWidth < 1024;
    const wake = ["pointerdown", "touchstart", "wheel", "keydown", "scroll"] as const;
    const onWake = () => { wake.forEach((t) => window.removeEventListener(t, onWake)); start(); };
    if (cap) go();
    else if (light3d) wake.forEach((t) => window.addEventListener(t, onWake, { passive: true, once: true }));
    else start();
    const move = (e: PointerEvent) => { heroState.pointerX = (e.clientX / innerWidth) * 2 - 1; heroState.pointerY = (e.clientY / innerHeight) * 2 - 1; };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      mo.disconnect();
      window.removeEventListener("pointermove", move);
      wake.forEach((t) => window.removeEventListener(t, onWake));
      if (idle) window.cancelIdleCallback(h); else clearTimeout(h);
    };
  }, []);

  const open = signedIn ? "/app" : "/signin";

  return (
    <section data-hero aria-labelledby="hero-title" className="relative h-[100svh] min-h-[620px] overflow-hidden">
      {/* Visual layer: static glow first, then the canvas fades in over it. Decorative; described below. */}
      <div data-hero-canvas aria-hidden className="absolute inset-0">
        <div className="hero-backdrop absolute inset-0" />
        {mode === "static" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={light ? "/hero-shield-light.webp" : "/hero-shield.webp"} alt="" width={900} height={900} decoding="async"
            className="hero-still absolute left-1/2 top-[58%] w-[min(88vw,520px)] -translate-x-1/2 -translate-y-1/2 lg:left-[69%] lg:top-1/2 lg:w-[min(46vw,640px)]" />
        )}
        {mode === "3d" && colors && (
          <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
            <HeroScene key={colors.light ? "l" : "d"} colors={colors} capture={capture} onReady={() => setReady(true)} />
          </div>
        )}
        <div data-hero-veil className="hero-veil pointer-events-none absolute inset-0" />
      </div>
      <p className="sr-only">
        Illustration: a machined metal shield with a glass front, lit like a product photo. Streaks of light, standing for payments, slide past it;
        a few orange ones hit its edge and stop. As you scroll, the shield separates into three layers labelled Protect, Get Paid and Resolve,
        then locks back together.
      </p>

      <div className="relative mx-auto flex h-full max-w-[1200px] flex-col px-5 pb-10 pt-[104px] sm:px-6 lg:justify-center lg:px-10 lg:pb-0 lg:pt-16">
        <div data-hero-copy className={capture ? "invisible" : ""}>
          <div><h1 id="hero-title" className="hero-title font-extrabold">Payments that<br /> protect you.</h1></div>
          <div><p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-muted sm:text-[18px] lg:mt-7 lg:text-[19px]">
            Shield is an AI trust layer on PayPal. It stops scams before you pay, gets freelancers paid without the awkward chasing, and gives you support that actually fixes things.
          </p></div>
          <div><div className="mt-7 flex flex-wrap gap-3 lg:mt-9">
            <Link href={open} className="press inline-flex h-12 items-center rounded-full bg-accent px-7 text-[16px] font-bold text-on-accent hover:bg-accent-2">Open Shield</Link>
            <a href="#problem" data-scroll-to className="press inline-flex h-12 items-center rounded-full border border-fg/25 px-7 text-[16px] font-bold hover:border-fg/60 hover:bg-raised/60">See how it works</a>
          </div></div>
        </div>
      </div>
      <p data-hero-caption aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[7vh] px-5 text-center text-[clamp(24px,3.4vw,40px)] font-bold leading-[1.1] tracking-[-0.035em] opacity-0">
        <span data-cap-a className="block">Three pillars.</span>
        <span data-cap-b className="block text-accent">One set of rules.</span>
      </p>
      {!capture && (
        <div data-hero-cue aria-hidden className="hero-cue pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-muted lg:block">
          Scroll<i />
        </div>
      )}
    </section>
  );
}
