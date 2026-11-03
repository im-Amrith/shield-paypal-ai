import type { ArtId } from "./tools";

/*
 * Fine-line illustrations for the tool cards (mega-menu and landing page).
 * Every stroke has pathLength=1 and the class "draw", so CSS can draw it on with
 * stroke-dashoffset 1 → 0 (see .line-art in globals.css). One accent mark per drawing.
 * Purely decorative: aria-hidden.
 */

const ART: Record<ArtId, React.ReactNode> = {
  // A chat bubble, its lines, and a lens passing over one suspicious line.
  scan: (
    <>
      <path pathLength={1} className="draw" d="M26 20h92a10 10 0 0 1 10 10v38a10 10 0 0 1-10 10H58l-16 14v-14H26a10 10 0 0 1-10-10V30a10 10 0 0 1 10-10z" />
      <path pathLength={1} className="draw" d="M32 38h70M32 50h48M32 62h60" />
      <path pathLength={1} className="draw accent" d="M82 50h20" />
      <circle pathLength={1} className="draw" cx="140" cy="58" r="22" />
      <path pathLength={1} className="draw" d="M156 74l20 20" />
      <circle className="dot" cx="92" cy="50" r="2.5" />
    </>
  ),
  // Money (dots) travelling into a held box; a tick waits at the far end.
  vault: (
    <>
      <path pathLength={1} className="draw" d="M70 30h60v50H70z" />
      <path pathLength={1} className="draw" d="M70 42h60M92 30v12M108 30v12" />
      <path pathLength={1} className="draw dash" d="M10 55h56M134 55h30" />
      <circle className="dot" cx="24" cy="55" r="2.5" /><circle className="dot" cx="40" cy="55" r="2.5" /><circle className="dot" cx="56" cy="55" r="2.5" />
      <circle pathLength={1} className="draw" cx="178" cy="55" r="12" />
      <path pathLength={1} className="draw accent" d="M172 55l5 5 8-9" />
    </>
  ),
  // A paused payment: shield with pause bars, linked by a curve to a trusted person.
  guardian: (
    <>
      <path pathLength={1} className="draw" d="M62 18l30 10v24c0 20-14 32-30 38-16-6-30-18-30-38V28z" />
      <path pathLength={1} className="draw accent" d="M56 44v20M68 44v20" />
      <path pathLength={1} className="draw dash" d="M96 54c22 0 28-26 54-26" />
      <circle pathLength={1} className="draw" cx="164" cy="26" r="9" />
      <path pathLength={1} className="draw" d="M146 58c2-12 9-18 18-18s16 6 18 18" />
      <circle className="dot" cx="150" cy="28" r="2.5" />
    </>
  ),
  // Repeat charges: a calendar row with the same mark recurring, and a loop.
  subs: (
    <>
      <path pathLength={1} className="draw" d="M14 30h120v58H14z" />
      <path pathLength={1} className="draw" d="M14 44h120M44 30v58M74 30v58M104 30v58" />
      <circle className="dot" cx="29" cy="66" r="3" /><circle className="dot" cx="59" cy="66" r="3" /><circle className="dot" cx="89" cy="66" r="3" />
      <circle className="dot accent-fill" cx="119" cy="66" r="3" />
      <path pathLength={1} className="draw" d="M178 46a20 20 0 1 1-6-14" />
      <path pathLength={1} className="draw accent" d="M174 22l-2 10 10 1" />
    </>
  ),
  // An invoice and its reminder ladder: day 1, 7 and 14.
  invoice: (
    <>
      <path pathLength={1} className="draw" d="M20 14h52l14 14v70H20z" />
      <path pathLength={1} className="draw" d="M72 14v14h14M32 44h40M32 56h40M32 68h24" />
      <path pathLength={1} className="draw dash" d="M100 84h90" />
      <path pathLength={1} className="draw" d="M110 84v-14M140 84v-28M170 84v-44" />
      <circle className="dot" cx="110" cy="66" r="3" /><circle className="dot" cx="140" cy="52" r="3" />
      <circle className="dot accent-fill" cx="170" cy="36" r="3.5" />
    </>
  ),
  // Two currencies overlapping; the share you keep is the lens between them.
  fx: (
    <>
      <circle pathLength={1} className="draw" cx="76" cy="55" r="34" />
      <circle pathLength={1} className="draw" cx="124" cy="55" r="34" />
      <path pathLength={1} className="draw accent" d="M100 31a34 34 0 0 1 0 48a34 34 0 0 1 0-48z" />
      <path pathLength={1} className="draw dash" d="M10 55h20M170 55h20" />
      <circle className="dot" cx="64" cy="55" r="2.5" /><circle className="dot" cx="136" cy="55" r="2.5" />
    </>
  ),
  // A pulse line rising towards a dashed limit; the mark sits where it would cross.
  health: (
    <>
      <path pathLength={1} className="draw dash" d="M10 34h180" />
      <path pathLength={1} className="draw" d="M10 84h30l10-14 10 22 12-40 12 30 10-10h22l12-16 14 8 16-28" />
      <path pathLength={1} className="draw accent" d="M158 36l14-6" />
      <circle className="dot accent-fill" cx="174" cy="34" r="3.5" />
      <path pathLength={1} className="draw" d="M10 98h180" />
    </>
  ),
  // A speech bubble with a voice waveform.
  voice: (
    <>
      <path pathLength={1} className="draw" d="M20 18h112a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H62l-18 16V82H20A12 12 0 0 1 8 70V30a12 12 0 0 1 12-12z" />
      <path pathLength={1} className="draw" d="M30 50v0M40 42v16M50 34v32M60 44v12M70 30v40M80 40v20M90 46v8M100 38v24M110 46v8M120 50v0" />
      <path pathLength={1} className="draw accent" d="M160 36c8 8 8 20 0 28M172 28c14 14 14 30 0 44" />
    </>
  ),
  // A queue of cases; one is lifted for a person to approve.
  console: (
    <>
      <path pathLength={1} className="draw" d="M24 74h112v20H24zM24 50h112v20H24z" />
      <path pathLength={1} className="draw" d="M36 26h120v22H36z" />
      <path pathLength={1} className="draw" d="M46 37h60M34 60h50M34 84h40" />
      <circle pathLength={1} className="draw" cx="176" cy="37" r="11" />
      <path pathLength={1} className="draw accent" d="M170 37l4 4 8-8" />
    </>
  ),
  // A cart rolling along, items dropping in; a cap line the last item stops at.
  shop: (
    <>
      <path pathLength={1} className="draw" d="M14 30h18l14 46h80l12-34H40" />
      <circle pathLength={1} className="draw" cx="58" cy="90" r="7" /><circle pathLength={1} className="draw" cx="114" cy="90" r="7" />
      <path pathLength={1} className="draw" d="M62 50h12v16H62zM82 46h14v20H82z" />
      <path pathLength={1} className="draw dash" d="M150 20v76" />
      <path pathLength={1} className="draw accent" d="M164 46h22M175 35v22" />
      <circle className="dot" cx="104" cy="58" r="2.5" />
    </>
  ),
  // One line in, one decision point, three ways out.
  rules: (
    <>
      <path pathLength={1} className="draw" d="M8 55h52" />
      <path pathLength={1} className="draw" d="M60 41h28v28H60z" />
      <path pathLength={1} className="draw" d="M88 55c26 0 26-34 54-34M88 55h54M88 55c26 0 26 34 54 34" />
      <circle pathLength={1} className="draw" cx="152" cy="21" r="8" /><circle pathLength={1} className="draw" cx="152" cy="55" r="8" /><circle pathLength={1} className="draw" cx="152" cy="89" r="8" />
      <path pathLength={1} className="draw accent" d="M162 55h28" />
      <circle className="dot" cx="30" cy="55" r="2.5" />
    </>
  ),
};

export function LineArt({ id, className = "" }: { id: ArtId; className?: string }) {
  return (
    <svg viewBox="0 0 200 110" aria-hidden focusable="false" className={`line-art ${className}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {ART[id]}
    </svg>
  );
}
