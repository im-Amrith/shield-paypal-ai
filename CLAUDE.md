# Shield — handoff notes for Claude Code

PayPal AI Hackathon entry (deadline Nov 12 2026, 12:00 PM PST). Solo builder. Plan doc:
https://claude.ai/code/artifact/81eefd39-bb93-455a-866a-9498803b701d

**Shield = an AI trust layer on PayPal.** Three pillars on one shared guardrails engine:
- Protect: scam check, Vault escrow (authorize now / capture on delivery), Guardian mode for seniors, shopping agent (/shop, Channel3 + caps), subscription finder
- Get Paid: collections agent (invoice + reminder ladder + agreed late fee), FX billing copilot, freeze early-warning + Hold Explainer
- Resolve: Tier 1 triage (KB + citations) → Tier 2 resolution agent (PayPal tools via policy engine) → human console (approve / deny / take over)

Demo story: Meera (freelance designer, Kochi) and her father Ravi (Guardian mode). Personas switch via a `persona` cookie: meera, ravi, buyer, client, agent.

Routes: `/` is the public landing page, `/signin` is the demo sign-in (five persona cards; a plain form POST to `/api/session`, which also handles `action=signout`), `/app` is the home dashboard. Every other app route keeps its path and lives in the `app/(app)/` route group (layout = container + breadcrumbs + LiveRefresh; `template.tsx` = page transition). `proxy.ts` (Next 16's renamed middleware) redirects app routes to `/signin?next=…` without a valid persona cookie and returns 401 for API calls, except `/api/session`, `/api/paypal/webhook`, `/api/jobs`.

## Run
```
npm install
npm test          # 103 vitest tests, all passing
# open http://localhost:3000 → "Open Shield" → pick a persona
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

Integrations (Nov 3, part 2):
- PayPal Agent Toolkit (`@paypal/agent-toolkit`, adapter `lib/toolkit.ts`): `executeAction` in `lib/support.ts` runs refunds (`create_refund`), `list_disputes`, `get_order` and `cancel_sent_invoice` through it; Vault `ship` registers tracking with `create_shipment_tracking` (`shareTracking` in `lib/vault.ts`). decideTool still runs first. `viaToolkit()` picks toolkit (keys set) / REST fallback (toolkit failed to *load*) / mock (no keys) and returns a `via` label stored on the action (console pill) and in the timeline. A PayPal error from the toolkit is never retried via REST (no double refunds). Authorize/capture/void/reauthorize stay in `lib/paypal.ts`.
- Gotcha (found live): the toolkit doesn't throw on PayPal errors; it returns JSON in several shapes (`{error}`, `{status:"error"}`, `{ok:false,status:404,message}`). `runToolkit` treats all as failures; keep it that way.
- Shopping agent: `lib/shop.ts` (draftCart is pure, used by the eval; planCart saves), `/shop`, `/api/shop`, `components/ShopForms.tsx`. Channel3 `POST https://api.trychannel3.com/v1/search` with `x-api-key` (price lives on `offers[]`, no rating field); without `CHANNEL3_API_KEY` (or with SHIELD_FORCE_MOCK) it uses `SAMPLE_PRODUCTS`, labeled "Sample products". decideSpend runs when the cart is built and again before capture (`recheck`), so revoke/lowered caps stop carts mid-checkout. In the sandbox the payer approves each order in the PayPal popup (no vaulting); in mock, auto/approved carts are captured at once. Paid carts become 30-day reorders; `tickReorders` (in runJobs) notifies once per cycle.
- `render.yaml`: web + 1 GB disk at /data (`SHIELD_DB_PATH=/data/db.json`, needs Starter plan) + cron every 15 min reading host and CRON_SECRET from the web service.
- `.env.local` now has real sandbox PayPal, Channel3 and Resend keys: run `scripts/smoke.sh` against a server started with `SHIELD_FORCE_MOCK=1` (scripted buyer approvals fail in the sandbox, and it would send real emails).
- APIMatic context plugin: `claude plugin install context-matic@apimatic` (marketplace `apimatic/context-matic`, named `apimatic`, not `apimatic-context-matic` as its README says).

UI (Nov 2, part 2): landing page + navbar, in the style of chargeflow.io / decagon.ai (references `design/ref-bento.png`, `design/ref-megamenu.png`).
- `components/Nav.tsx` `SiteNav` is the only chrome (sidebar and bottom nav are gone): floating frosted bar, mega-menu per pillar (hover with 120ms intent, click, or keyboard focus; arrows/Home/End/Esc), full-screen sheet below 1024px. Tool catalogue for menu, landing and breadcrumbs: `components/tools.ts`; fine-line drawings: `components/LineArt.tsx`.
- Landing: `components/landing/` — `Hero.tsx` (lazy R3F `HeroScene.tsx` via next/dynamic ssr:false; desktop loads it at idle, phones/touch on first interaction; reduced motion or no WebGL → `public/hero-shield(-light).webp`, edge-feathered with a CSS mask), `LandingMotion.tsx` (Lenis + ScrollTrigger in one gsap.matchMedia inside useGSAP, so it all reverts on unmount and is skipped under reduced motion), `Sections.tsx` (server-rendered content). Three.js/GSAP/Lenis load only on `/`. To regenerate the still images, open `/?capture=1` and save the canvas (`toDataURL("image/webp")`).
- `npm run shots:landing` (app running) screenshots the landing at 0–100% scroll, mega-menus, sign-in and /app in both themes + a reduced-motion pass. Lighthouse (Nov 2): mobile perf 95–96 / a11y 100, desktop 97 / 100, CLS 0.
- `next.config.ts` caps build workers at 4 (15 workers ran out of memory here); on a busy machine use `NEXT_BUILD_CPUS=1 npm run build`.
- Hero (Nov 3 rebuild) is shot like a product render: fov 22 long lens, studio Lightformers baked into an env map, ACES `ToneMapping` + bloom + light grain in the composer. The shield is three layers: glass lens (`MeshTransmissionMaterial`, built-in transmission on phones) = Protect, brushed anodized body with an accent edge and a lit check = Get Paid, titanium back plate = Resolve. Payments are instanced long-exposure light trails (custom shader); threats hit the edge, collapse and flash a point light. Scroll beats (fractions of the pin, kept in sync between `Rig` in `HeroScene.tsx` and the timeline in `LandingMotion.tsx`): 0–.32 to centre · .28–.56 exploded view · .42–.73 callouts · .70–.83 layers click together ("One set of rules.") · .9 fade.
- Callouts are plain DOM labels + an SVG leader, projected from 3D anchors each frame. Don't use drei `<Html>` there: it mounts a nested React root and triggers "synchronously unmount a root while React was already rendering" when the canvas remounts (theme switch).
- Gotchas found on this laptop's Intel Iris Xe: composer `multisampling` > 0 renders the whole frame black; `anisotropy` on the extruded geometry gave NaN-black metal. Keep both off. The canvas background is the page colour pushed through an inverse ACES curve (`pageBackground`) so it matches `--page` exactly.
- The hero copy's CSS entrance runs on the inner elements and GSAP's scroll exit on their wrapper divs; putting both on one element makes GSAP record the mid-entrance state (copy stuck hidden).
- `node scripts/hero-shots.mjs [out] [dark,light]` screenshots the pinned hero at several scroll depths in a headed Chrome (real GPU; swiftshader is too slow for the transmission pass). Set `SW=1` for software rendering.

UI (Nov 2): "Hero score" design — references in `design/hero-desktop.png` and `design/hero-mobile.png` (phone #3). Dark by default (near-black, one orange accent #FF7A1A), light theme blue. Every page opens with a `HeroBand` (ring `HeroGauge` or `HeroFigure`), then an `AlertBanner` when something's urgent, then cards. Shell: see part 2 above (the old sidebar/bottom nav were replaced).
- Tokens are CSS variables on `:root` (dark) and `[data-theme="light"]` in `app/globals.css`, mapped to Tailwind via `@theme inline` (`bg-card`, `text-muted`, `bg-accent`, `text-on-accent`…). Theme lives in the `theme` cookie; `app/layout.tsx` sets `data-theme` server-side (no flash). Text on orange is near-black (`text-on-accent`) — white on #FF7A1A fails contrast. Two light values are darker than the brief to pass 4.5:1 (muted #586579, success #15803D); see the comment in globals.css.
- Shared pieces in `components/ui.tsx`: HeroGauge (role="meter", scales 150→200px via container units), HeroBand, HeroFigure, HeroIcon, AlertBanner, FeatureTile, AlertRows, Hi (orange key word).
- Search lives on `/alerts` (`?q=`; alerts name every payment, invoice and case event).
- `npm run screens` (app running on :3000) seeds the demo and screenshots every page per persona × theme × 390/1440 into `.screens/`, failing loudly on horizontal scroll, render errors and console errors. Uses `playwright-core` with the installed Chrome.
- `components/styles.ts` holds `buttonClass`/`inputClass` — server pages must import from there, not from `components/client.tsx` (calling a client-module function on the server crashes the page).
- Next.js page files may only export page things; shared maps live in `components/vaultStatus.ts` and `components/caseStatus.ts`.
- `scripts/smoke.sh` fails on pages that return 200 but render an error boundary, checks every page as all 5 personas, and checks the signed-out flow (landing, /signin, redirect with next, API 401, sign-in form, open-redirect guard, sign-out). 36 checks, incl. Vault tracking and the shopping agent (auto, approve, blocked, revoked, caps validation).
- Seed emails use the undelegated `.demo` TLD so Resend can never deliver demo mail to a real person.

TODO next:
1. Keys are in `.env.local` (PayPal sandbox, Channel3, Resend; no LLM key yet). Run the sandbox Vault flow and a /shop checkout in a browser (PayPal popup) with PayPal Smart Buttons and a real invoice; then `SHIELD_EVAL_LLM=1 npm run eval` and put the held-out number in the README.
2. Deploy to Render (+ cron for /api/jobs), seed demo, check on a real phone (voice needs Chrome/Android or Safari).
3. Record the <3 min video (script in the plan doc). Submit on Devpost before Nov 12, 12:00 PM PST.
Stretch: traceable giving.

## Conventions / gotchas
- Never store caller-owned arrays by reference in the DB (a test caught `items` being mutated); copy.
- All money-moving agent actions go through `decideTool` / `decideSpend` in `lib/policy.ts`.
- What's simulated (say so in UI + README): account limitation events (sandbox can't freeze), carrier delivery event, FX fees are estimates (no PayPal fee-quote API).
- Don't use "PayPal" in the product name/logo.
- PayPal audit (Nov 3): `docs/paypal-integration-audit.md`. Tracking needs a *capture* id, so Vault keeps it `pending` until release; carrier codes are PayPal's `ShipmentCarrier` values (`INDIA_POST`, `BLUEDART`, `DTDC_IN`…). Reauthorize only via `canReauthorize` (422, days 4–29, once). Money-moving calls use deterministic `PayPal-Request-Id`s; order creation doesn't. The webhook must pass the raw body to `verifyWebhookSignature` and never re-record a PayPal-paid invoice (`paidThroughPayPal`). `MOCKCAP_*` refunds are simulated when keys are set.
