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
