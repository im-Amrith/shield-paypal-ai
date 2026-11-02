# Shield — handoff notes for Claude Code

PayPal AI Hackathon entry (deadline Nov 12 2026, 12:00 PM PST). Solo builder. Plan doc:
https://claude.ai/code/artifact/81eefd39-bb93-455a-866a-9498803b701d

**Shield = an AI trust layer on PayPal.** Three pillars on one shared guardrails engine:
- Protect: scam check, Vault escrow (authorize now / capture on delivery), Guardian mode for seniors, subscription finder
- Get Paid: collections agent (invoice + reminder ladder + agreed late fee), FX billing copilot, freeze early-warning + Hold Explainer
- Resolve: Tier 1 triage (KB + citations) → Tier 2 resolution agent (PayPal tools via policy engine) → human console (approve / deny / take over)

Demo story: Meera (freelance designer, Kochi) and her father Ravi (Guardian mode). Personas switch via a `persona` cookie: meera, ravi, buyer, client, agent.

## Run
```
npm install
npm test          # 62 vitest tests, all passing
npm run eval      # labeled eval sets (rules mode); SHIELD_EVAL_LLM=1 to include LLM
npm run dev
```
No keys needed: PayPal falls back to a mock (`lib/paypal.ts`, `paypalMode()`), LLM falls back to rules (`lib/llm.ts`). Keys go in `.env.local` (see `.env.example`).

## Status (Nov 1, evening)
DONE and verified:
- Backend `lib/` (see README), API routes incl. verified PayPal webhook
- UI: every page in the plan (home per persona, protect, scan, vault, guardian, subscriptions, get-paid + FX copilot, account health/explainer, client pay page, support chat with voice, human console, demo controls), PWA manifest
- `npm test` 62 passing · `npm run eval` targets met · `npm run build` clean (no warnings) · `scripts/smoke.sh` 16 end-to-end checks passing against `next start`
- Screens reviewed at 390px phone width

Fixed along the way: DB cache was per-bundle (pages showed stale data) → store re-reads on file mtime change.

UI (Nov 2): "Hero score" design — references in `design/hero-desktop.png` and `design/hero-mobile.png` (phone #3). Dark by default (near-black, one orange accent #FF7A1A), light theme blue. Every page opens with a `HeroBand` (ring `HeroGauge` or `HeroFigure`), then an `AlertBanner` when something's urgent, then cards. Shell: 240px sidebar + search top bar on ≥1024px; top bar (persona pill, theme toggle, bell) + orange bottom nav below. Nav is per persona.
- Tokens are CSS variables on `:root` (dark) and `[data-theme="light"]` in `app/globals.css`, mapped to Tailwind via `@theme inline` (`bg-card`, `text-muted`, `bg-accent`, `text-on-accent`…). Theme lives in the `theme` cookie; `app/layout.tsx` sets `data-theme` server-side (no flash). Text on orange is near-black (`text-on-accent`) — white on #FF7A1A fails contrast. Two light values are darker than the brief to pass 4.5:1 (muted #586579, success #15803D); see the comment in globals.css.
- Shared pieces in `components/ui.tsx`: HeroGauge (role="meter", scales 150→200px via container units), HeroBand, HeroFigure, HeroIcon, AlertBanner, FeatureTile, AlertRows, Hi (orange key word).
- Search goes to `/alerts?q=` (alerts name every payment, invoice and case event).
- `npm run screens` (app running on :3000) seeds the demo and screenshots every page per persona × theme × 390/1440 into `.screens/`, failing loudly on horizontal scroll, render errors and console errors. Uses `playwright-core` with the installed Chrome.
- `components/styles.ts` holds `buttonClass`/`inputClass` — server pages must import from there, not from `components/client.tsx` (calling a client-module function on the server crashes the page).
- Next.js page files may only export page things; shared maps live in `components/vaultStatus.ts` and `components/caseStatus.ts`.
- `scripts/smoke.sh` now fails on pages that return 200 but render an error boundary, and checks every page as all 5 personas.
- Seed emails use the undelegated `.demo` TLD so Resend can never deliver demo mail to a real person.

TODO next:
1. Add real keys to `.env.local`; run the sandbox Vault flow with PayPal Smart Buttons and a real invoice; then `SHIELD_EVAL_LLM=1 npm run eval` and put the held-out number in the README.
2. Deploy to Render (+ cron for /api/jobs), seed demo, check on a real phone (voice needs Chrome/Android or Safari).
3. Record the <3 min video (script in the plan doc). Submit on Devpost before Nov 12, 12:00 PM PST.
Stretch: bounded shopping agent UI (`decideSpend` exists), traceable giving.

## Conventions / gotchas
- Never store caller-owned arrays by reference in the DB (a test caught `items` being mutated); copy.
- All money-moving agent actions go through `decideTool` / `decideSpend` in `lib/policy.ts`.
- What's simulated (say so in UI + README): account limitation events (sandbox can't freeze), carrier delivery event, FX fees are estimates (no PayPal fee-quote API).
- Don't use "PayPal" in the product name/logo.
