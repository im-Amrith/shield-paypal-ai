# Shield — an AI trust layer built on PayPal

Built for the PayPal AI Hackathon 2026. Shield sits on top of PayPal and uses AI to stop bad payments before they happen, get freelancers paid without awkward chasing, and give people support that actually resolves things.

People on Reddit, Trustpilot and the PayPal Community forum keep raising the same problems: funds frozen with no explanation, support stuck in bot loops, Friends & Family scams, freelancers chasing late invoices, seniors scammed by "tax office" calls, and forgotten subscriptions. Shield tackles them in one app with three pillars on one shared guardrails engine.

| Pillar | Features |
| --- | --- |
| **Protect** | Scam check (paste a chat or screenshot) · **Vault** escrow: PayPal authorize now, capture on delivery or auto-release · **Guardian mode**: a senior's unusual payments wait for a trusted relative · **Shopping agent**: write a need, it compares products (Channel3) and buys within your caps (auto below a threshold, one-tap approve above it, blocked over the caps, one switch to revoke), with monthly reorders. Save PayPal once and **the agent pays with a saved PayPal payment method, only within your caps**, with no popup · Subscription finder |
| **Get Paid** | **Collections agent**: sends the PayPal invoice, then chases on a bounded, polite ladder; late fee only if agreed up front · **FX copilot**: shows what you keep in each billing currency · **Freeze early warning + Hold Explainer**: plain-language reason, the exact payments involved, documents to send, a ready appeal |
| **Resolve** | Tier 1 AI troubleshoots from cited help articles → Tier 2 agent acts through the **PayPal Agent Toolkit** (refunds, disputes, orders, invoices) → every tool call passes the **policy engine** (read-only runs, small actions ask the customer, refunds above a limit and account changes need a human) → human console to approve, deny or take over. Voice in English, Hindi and Malayalam. |

## Run it (2 minutes)

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # optional: works with no keys at all
npm run dev                   # http://localhost:3000
```

With no keys, PayPal runs in a faithful **mock** mode and the AI runs on its deterministic rule engine, so judges can try everything immediately. Add keys to switch on the real PayPal sandbox and the LLM.

Open http://localhost:3000, press **Open Shield** and pick a demo person (you can switch later from the avatar menu): Meera (freelancer), Ravi (her father, Guardian mode), Arjun (buyer), Dana (client), Priya (support). The **Demo** tab fast-forwards time so week-long flows (reminders, auto-release, re-alerts) happen in seconds, and has a suggested walkthrough.

## Keys (`.env.local`)

| Key | What it turns on |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Real sandbox calls: Orders (authorize/capture/void/reauthorize), Refunds, Invoicing v2, Disputes, and PayPal Smart Buttons on Vault payments |
| `PAYPAL_WEBHOOK_ID` | Verified webhooks at `/api/paypal/webhook` (`INVOICING.INVOICE.PAID`) |
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` for any OpenAI-compatible API such as Groq, `OPENAI_MODEL`, and `OPENAI_VISION_MODEL` for calls with a screenshot, default `qwen/qwen3.8-27b`) | LLM review of scams (incl. screenshots), triage, multilingual support replies, case summaries, appeal and reminder polishing |
| `CHANNEL3_API_KEY` | Live product search for the shopping agent (otherwise a small built-in list, labeled "sample products") |
| `RESEND_API_KEY` | Real emails (otherwise they appear in the Demo tab's outbox) |
| `CRON_SECRET` | Protects `/api/jobs` for a scheduled job |

## Tests and evals

```bash
npm test                      # 149 unit/integration tests (vitest)
npm run eval                  # labeled eval sets, rules mode
SHIELD_EVAL_LLM=1 npm run eval   # same sets with your LLM key
BASE=http://localhost:3000 bash scripts/smoke.sh   # end-to-end demo story against a running server
```

Manual checks against the real PayPal sandbox (popup, real captures, sandbox inbox): [docs/live-sandbox-checklist.md](docs/live-sandbox-checklist.md).

Eval sets: scam check (38 dev + 14 held-out messages), support triage (30), Guardian holds (18), shopping agent (10 requests against different caps; the cap-safety target is 100%: a cart the agent may pay never breaks a cap or the stated budget). The dev sets were written alongside the rules and score 100%; the **held-out** scam set scores about 50% recall with rules alone. That gap is why the LLM layer exists, and its target (80% recall) is enforced only when an LLM key is set.

LLM results (Nov 3, Groq via the OpenAI-compatible path, `SHIELD_EVAL_LLM=1 npm run eval`):

| Model (`OPENAI_MODEL`) | Held-out scam set (n=14) | Support triage (n=30) | Notes |
|---|---|---|---|
| rules only (no key) | recall 50.0% · accuracy 71.4% · precision 100% | 100% | baseline |
| **`openai/gpt-oss-120b`** (kept) | **recall 100% · accuracy 92.9% · precision 88.9%** | 96.7% | all targets met, 0 fallbacks to rules |
| `llama-3.3-70b-versatile` | not run | not run | Groq returns 404 `model_not_found` for this key, so every call would fall back to rules and repeat the baseline |

The triage set was written alongside the rules, so the rules' 100% there is optimistic; the held-out scam set is the fair comparison (rules 50% recall vs `openai/gpt-oss-120b` 100%).

Calls with a screenshot use `OPENAI_VISION_MODEL` (default `qwen/qwen3.8-27b`, checked live with a real image). On Groq the client sends at most 3 images (each at most 4 MB) and temperature 0.2. It never sends `logprobs`, `logit_bias`, `n` or `messages[].name`. On a 429 it retries once after `Retry-After` (up to 20 s); after that, or if the wait is longer, it falls back to the rules.

## What's real and what's simulated

- **Real (sandbox):** PayPal orders with `intent: AUTHORIZE`, capture, void, reauthorization, refunds, invoices, reminders, payment recording, webhooks, shipment tracking, and shopping-agent checkout (`intent: CAPTURE`).
- **Through the PayPal Agent Toolkit** (`lib/toolkit.ts`): the Tier 2 agent's refunds (`create_refund`), dispute and order lookups (`list_disputes`, `get_order`), invoice cancellation (`cancel_sent_invoice`), and Vault tracking (`create_shipment_tracking`). The policy engine decides first; the toolkit runs only after an automatic, customer or specialist approval, and the console shows which toolkit tool ran. Authorize / capture / void / reauthorize stay on our REST client (`lib/paypal.ts`), which is also the fallback if the toolkit can't load. A PayPal error from the toolkit is never retried through REST, so money can't move twice.
- **Shopping agent checkout: the agent pays with a saved PayPal payment method, only within your caps.** On /shop, "Save PayPal for the shopping agent" runs PayPal's save-without-purchase flow (Vault v3): our server creates a setup token (`usage_type` MERCHANT, `customer_type` CONSUMER, "Shield shopping agent — pays only within your caps"), the buyer approves once in the PayPal popup, and our server exchanges it for a payment token. The payment token ID and PayPal customer ID stay on the server; the page shows only "PayPal saved · <payer email>" and a Remove button (which deletes the token on PayPal).
  - From then on, an auto-approved cart (at or below the auto-approve limit), or a cart you approve with one tap, is paid by the agent with an Orders v2 order that uses `payment_source.paypal.vault_id` (intent CAPTURE): no popup. The caps (per order, monthly, revoked) are checked again right before the charge, and each cart has a fixed `PayPal-Request-Id`, so a retry can't charge twice. If the outcome is unknown (network error), the cart offers "Check with PayPal again" (same request ID), never the popup.
  - Paid carts read **"Paid by Shield agent · saved PayPal"**, and each cart's "What the agent did" timeline shows the policy decision that allowed the charge.
  - If PayPal answers `PAYER_ACTION_REQUIRED` or refuses (for example `INSTRUMENT_DECLINED`), the cart falls back to the PayPal popup and says why. Without a saved PayPal, every cart uses the popup, as before.
  - Monthly reorders: when a reorder is due (demo clock), the agent builds the cart again; if it's auto-approvable it pays with the saved PayPal and tells you ("Your monthly reorder was paid: USD 31.40, within your USD 40 auto-approve limit"); above the limit it waits for one tap. The Revoke switch stops all agent payments at once.
  - Live check: after saving PayPal once in the browser, `npx tsx --env-file=.env.local scripts/vault-live-check.ts` charges USD 5 to the saved token on the sandbox and prints the capture ID.
- **FX copilot rates:** it asks PayPal first (`POST /v2/pricing/quote-exchange-rates`, one call quoting USD → every currency it shows) and labels the result **"PayPal rate"**, with the time the quote expires. If that call fails it uses public mid-market rates (open.er-api.com), or the bundled offline rates if those are unreachable too, labelled **"Estimated"**; hovering the label shows PayPal's reason. Sources are never mixed: one missing currency means estimated rates for all. PayPal quotes are cached until they expire (at most an hour); after a PayPal failure it waits 10 minutes before asking again. The API needs the `https://uri.paypal.com/services/pricing/quote-exchange-rates/read` scope **and** FX-as-a-Service turned on for the business account. Our sandbox token has the scope, but the live check on Nov 3 got `403 FEATURE_NOT_PROVISIONED` ("FX-as-a-Service is not provisioned for this account"), so the copilot shows "Estimated" for now. After turning it on in the sandbox business account (its FX-as-a-Service hub), re-check with `npx tsx --env-file=.env.local scripts/fx-live-check.ts`. Fees and PayPal's conversion spread stay estimates either way.
- **Simulated, and labeled in the UI:** account limitation events (the sandbox can't freeze an account, so the Demo fires the same event), carrier "delivered" scans, and fees (PayPal has no public fee-quote API; estimates use published rates).
- **Deliberately out of scope:** cancelling subscriptions on merchants' own websites. It needs the user's logins there, runs into 2FA and CAPTCHAs, and often breaks merchant terms. Shield drafts the cancellation email instead.

## Design choices worth knowing

- **One guardrails engine** (`lib/policy.ts`) decides proceed / ask / escalate / block for Guardian, Vault, the shopping caps and every support-agent tool call.
- **Vault never holds money itself.** Funds stay authorized on the buyer's PayPal account (up to 21 days, inside PayPal's 29-day authorization window) and are captured straight to the seller.
- **Collections stays humane:** at least 3 days between messages, at most 4 messages, stops on payment or dispute, then hands back to the freelancer.
- **Rules first, AI on top:** the rule engine is fast, explainable and testable; the LLM can raise a risk score (e.g. from a screenshot) but can only lower a rule hit slightly.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vitest · PayPal REST APIs + JS SDK · Anthropic or any OpenAI-compatible LLM · Web Speech API for voice · JSON-file store (swap for Postgres for production).

## Deploy (Render)

`render.yaml` is a Render Blueprint: a web service, a 1 GB persistent disk for the JSON store, and a cron job for background work.

1. Push the repo to GitHub. In Render: **New → Blueprint**, pick the repo.
2. Render asks for every secret (`sync: false`): the PayPal sandbox keys, one LLM key, `CHANNEL3_API_KEY`, `RESEND_API_KEY`, `APP_URL` (your `https://<service>.onrender.com`) and a long random `CRON_SECRET`. All are optional; missing ones fall back to mock mode.
3. Deploy. The web service runs `npm ci && npm run build`, then `npm start`, with `SHIELD_DB_PATH=/data/db.json` on the disk so data survives restarts. The disk needs a paid (Starter) instance.
4. The `shield-jobs` cron calls `GET /api/jobs?key=$CRON_SECRET` every 15 minutes (Vault auto-release, invoice reminders, freeze early warning, reorder alerts). It reads the host and secret from the web service.
5. In the PayPal developer dashboard, add a webhook for `https://<service>.onrender.com/api/paypal/webhook` and set `PAYPAL_WEBHOOK_ID`. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is read at build time, so redeploy after setting it.
6. Open the site, sign in as Meera, and press **Reset** on the Demo tab to seed the data.

## Built with

- **[PayPal Agent Toolkit](https://www.npmjs.com/package/@paypal/agent-toolkit)** (`@paypal/agent-toolkit`): the Tier 2 support agent's PayPal tools and Vault shipment tracking, behind Shield's policy engine.
- **[Channel3](https://trychannel3.com/developers)**: product search across retailers for the shopping agent.
- **[Render](https://render.com)**: hosting, persistent disk and the cron job (`render.yaml`).
- **[APIMatic Context Plugin](https://gh.ali360.cloudns.ch/apimatic/context-matic)**: PayPal API and SDK context for Claude Code while building.

## License

MIT
