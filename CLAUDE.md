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

## Status (Nov 1)
DONE — backend, tested:
- `lib/` store (JSON file `data/db.json`), demo clock, seed, policy engine, paypal REST client (orders authorize/capture/void/reauth, refunds, invoicing v2), llm (Anthropic or OpenAI-compatible, vision), scam, guardian, vault, collections, fx, risk (signals, simulated limitation, explainer, appeal, re-notify 24h/72h), kb + support (tiers, policy-gated actions, human console functions), subscriptions, notify (Resend or outbox), jobs
- `app/api/*` route handlers: session, scam, guardian, vault, invoices, fx, support, risk, demo (reset/advance clock/jobs), jobs (cron), notifications, state (polling)
- `tests/` 10 files, 62 tests; `evals/` scam (38 dev + 14 held-out), triage (30), guardian (18)

Eval honesty: dev sets were written alongside the rules, so they score 100%. The held-out scam set scores ~50% recall with rules alone — that gap is the argument for the LLM layer; its target is only enforced when an LLM key is set. Run `SHIELD_EVAL_LLM=1 npm run eval` once a key is added and report the real number.

TODO — in order:
1. UI (nothing exists yet besides api routes): `app/layout.tsx`, `app/globals.css` (Tailwind 4: `@import "tailwindcss";`), mobile-first phone-width shell with bottom nav (Home, Protect, Get Paid, Support, Demo) + persona switcher. Pages:
   - `/` home: three pillar cards, notifications (call /api/notifications to mark read), risk badge
   - `/protect/scan`: paste text / upload screenshot → /api/scam → signals, score, "Pay safely with Vault"
   - `/vault`, `/vault/[id]`: create deal (seller), pay (PayPal JS SDK buttons when NEXT_PUBLIC_PAYPAL_CLIENT_ID set, else "simulate approval"), ship, mark delivered (demo), confirm / report problem (buyer), timeline, fee breakdown, auto-release countdown
   - `/guardian`, `/guardian/[id]`: Ravi sends money; Meera approves/blocks holds; Ravi can cancel; reasons + cooling-off
   - `/get-paid`: invoices + new invoice form with FX copilot (/api/fx), reminder timeline, "client pays" demo button
   - `/get-paid/account`: risk report, simulate freeze, explanation, evidence txns, docs to upload, copyable appeal
   - `/subscriptions`: `findRecurring` + `cancellationEmail`
   - `/support`: chat with voice via browser Web Speech API (SpeechRecognition + speechSynthesis, langs en-IN / hi-IN / ml-IN), action confirm chips, case timeline, poll /api/state
   - `/console` (agent persona, desktop width): queue of `waiting_human` cases, AI summary, approve/deny proposed action, take over, message, resolve
   - `/demo`: advance clock (1h/1d/3d/1w), run jobs, reset, simulate freeze, email outbox
   Pages read the DB server-side (`export const dynamic = "force-dynamic"`), mutate via fetch to /api then `router.refresh()`.
2. `app/api/paypal/webhook/route.ts`: verify with /v1/notifications/verify-webhook-signature when PAYPAL_WEBHOOK_ID set; handle INVOICING.INVOICE.PAID → recordPayment.
3. `npm run build` must pass (Next 16, React 19, TypeScript pinned to 5.x on purpose).
4. README (setup, what's real vs simulated, keys), MIT LICENSE, deploy to Render, seeded demo, record <3 min video.

Stretch only if ahead: voice handoff polish, bounded shopping agent (`decideSpend` already in lib/policy.ts).

## Conventions / gotchas
- Never store caller-owned arrays by reference in the DB (a test caught `items` being mutated); copy.
- All money-moving agent actions go through `decideTool` / `decideSpend` in `lib/policy.ts`.
- What's simulated (say so in UI + README): account limitation events (sandbox can't freeze), carrier delivery event, FX fees are estimates (no PayPal fee-quote API).
- Don't use "PayPal" in the product name/logo.
