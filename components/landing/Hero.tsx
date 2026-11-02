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
        <div className="hero-veil pointer-events-none absolute inset-0" />
      </div>
      <p className="sr-only">
        Illustration: a metal shield with a glowing rim. Streams of small dots, standing for payments, flow through it; most pass and turn white,
        while a few orange ones are knocked away. As you scroll, the shield splits into three rings named Protect, Get Paid and Resolve.
      </p>

      <div className="relative mx-auto flex h-full max-w-[1200px] flex-col px-5 pb-10 pt-[104px] sm:px-6 lg:justify-center lg:px-10 lg:pb-0 lg:pt-16">
        <div data-hero-copy className={capture ? "invisible" : ""}>
          <h1 id="hero-title" className="hero-title font-extrabold">Payments that<br /> protect you.</h1>
          <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-muted sm:text-[18px] lg:mt-7 lg:text-[19px]">
            Shield is an AI trust layer on PayPal. It stops scams before you pay, gets freelancers paid without the awkward chasing, and gives you support that actually fixes things.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 lg:mt-9">
            <Link href={open} className="press inline-flex h-12 items-center rounded-full bg-accent px-7 text-[16px] font-bold text-on-accent hover:bg-accent-2">Open Shield</Link>
            <a href="#problem" data-scroll-to className="press inline-flex h-12 items-center rounded-full border border-fg/25 px-7 text-[16px] font-bold hover:border-fg/60 hover:bg-raised/60">See how it works</a>
          </div>
        </div>
      </div>
      <p data-hero-caption aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[10vh] text-center text-[clamp(22px,3vw,34px)] font-bold tracking-[-0.03em] opacity-0">
        Three pillars. One set of rules.
      </p>
    </section>
  );
}
