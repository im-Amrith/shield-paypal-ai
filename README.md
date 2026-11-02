# Shield — an AI trust layer built on PayPal

Built for the PayPal AI Hackathon 2026. Shield sits on top of PayPal and uses AI to stop bad payments before they happen, get freelancers paid without awkward chasing, and give people support that actually resolves things.

People on Reddit, Trustpilot and the PayPal Community forum keep raising the same problems: funds frozen with no explanation, support stuck in bot loops, Friends & Family scams, freelancers chasing late invoices, seniors scammed by "tax office" calls, and forgotten subscriptions. Shield tackles them in one app with three pillars on one shared guardrails engine.

| Pillar | Features |
| --- | --- |
| **Protect** | Scam check (paste a chat or screenshot) · **Vault** escrow: PayPal authorize now, capture on delivery or auto-release · **Guardian mode**: a senior's unusual payments wait for a trusted relative · Subscription finder |
| **Get Paid** | **Collections agent**: sends the PayPal invoice, then chases on a bounded, polite ladder; late fee only if agreed up front · **FX copilot**: shows what you keep in each billing currency · **Freeze early warning + Hold Explainer**: plain-language reason, the exact payments involved, documents to send, a ready appeal |
| **Resolve** | Tier 1 AI troubleshoots from cited help articles → Tier 2 agent can act through PayPal tools → every tool call passes the **policy engine** (read-only runs, small actions ask the customer, refunds above a limit and account changes need a human) → human console to approve, deny or take over. Voice in English, Hindi and Malayalam. |

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
| `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` for any OpenAI-compatible API) | LLM review of scams (incl. screenshots), triage, multilingual support replies, case summaries, appeal and reminder polishing |
| `RESEND_API_KEY` | Real emails (otherwise they appear in the Demo tab's outbox) |
| `CRON_SECRET` | Protects `/api/jobs` for a scheduled job |

## Tests and evals

```bash
npm test                      # 62 unit/integration tests (vitest)
npm run eval                  # labeled eval sets, rules mode
SHIELD_EVAL_LLM=1 npm run eval   # same sets with your LLM key
BASE=http://localhost:3000 bash scripts/smoke.sh   # end-to-end demo story against a running server
```

Eval sets: scam check (38 dev + 14 held-out messages), support triage (30), Guardian holds (18). The dev sets were written alongside the rules and score 100%; the **held-out** scam set scores about 50% recall with rules alone. That gap is why the LLM layer exists, and its target (80% recall) is enforced only when an LLM key is set.

## What's real and what's simulated

- **Real (sandbox):** PayPal orders with `intent: AUTHORIZE`, capture, void, reauthorization, refunds, invoices, reminders, payment recording, webhooks.
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

Create a Web Service: build `npm install && npm run build`, start `npm start`. Add the env vars above. Add a Cron Job hitting `GET /api/jobs?key=$CRON_SECRET` every 15 minutes. Note: the JSON store lives on the instance's disk; attach a Render disk or reset the demo from the Demo tab.

## License

MIT
