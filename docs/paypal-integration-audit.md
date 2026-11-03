# PayPal integration audit (Nov 3, 2026)

Every PayPal call in Shield was checked against the APIMatic PayPal context plugin
(`context-matic`, PayPal Server SDK reference: Orders, Payments, order tracking) and against the
installed `@paypal/agent-toolkit` 1.11.0 source. **The plugin does not cover Invoicing v2, webhook
verification or the JS SDK** (it says so when asked). Those were checked against PayPal's public
REST reference instead, and this doc marks them that way.

## What was checked

| Area | Call | Source checked against | Result |
|---|---|---|---|
| OAuth | `POST /v1/oauth2/token` | plugin (client credentials) | OK; now refreshes the token once on a 401 |
| Orders | `POST /v2/checkout/orders` | plugin `CreateOrder` / `OrderRequest` | OK; added `custom_id` |
| Orders | `POST /v2/checkout/orders/{id}/authorize` | plugin `AuthorizeOrder` | **Fixed:** response status not checked |
| Orders | `POST /v2/checkout/orders/{id}/capture` (shopping agent) | plugin | **Fixed:** status not checked |
| Payments | `POST /v2/payments/authorizations/{id}/capture` | plugin `CaptureAuthorizedPayment` | **Fixed:** status, idempotency |
| Payments | `POST /v2/payments/authorizations/{id}/reauthorize` | plugin `ReauthorizePayment` | **Fixed:** when it is attempted (below) |
| Payments | `POST /v2/payments/authorizations/{id}/void` | plugin `VoidPayment` | OK; idempotency key added |
| Payments | `POST /v2/payments/captures/{id}/refund` (REST + toolkit `create_refund`) | plugin `RefundRequest` | Body OK; **fixed** fake capture ids and status handling |
| Tracking | toolkit `create_shipment_tracking` → `/v1/shipping/trackers-batch`; REST fallback | plugin `CreateOrderTracking` / `OrderTrackerRequest`, `ShipmentCarrier` | **Fixed:** wrong id and wrong carrier codes |
| Invoicing | create / send / remind / payments / cancel (toolkit `cancel_sent_invoice`) | PayPal REST reference (not in plugin) | **Fixed:** payment recording; small body fixes; late fee now billed as its own invoice (follow-up below) |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | PayPal REST reference (not in plugin) | **Fixed:** re-serialized event |
| JS SDK | `paypal.com/sdk/js` Smart Buttons | PayPal JS SDK v5 reference (not in plugin) | **Fixed:** loading race; added `onCancel` |
| Disputes / get order | toolkit `list_disputes`, `get_order`; REST fallbacks | toolkit source | OK |

## Changes

**Authorize → capture → reauthorize** (`lib/paypal.ts`, `lib/vault.ts`)
- The plugin's Payments reference: an authorization is honored for 3 days. It can be reauthorized
  on days 4–29, and after day 29 a new authorization is needed. The plugin text says "once" in one
  place and "multiple" in another; Shield takes the safe reading and reauthorizes once.
- Before: any 400 or 422 on capture triggered a reauthorize, even inside the honor period or for a
  malformed request, so the real error was hidden behind a second failure.
- Now `canReauthorize()` lets it happen only for a 422, only on days 4–29, and only if the deal
  hasn't been reauthorized before. The new authorization id and a `reauthorized` history entry are
  saved on the deal. Vault's 21-day expiry stays inside the 29-day window.
- Authorize, capture and reauthorize now check the returned status (`DENIED`/`VOIDED`,
  `DECLINED`/`FAILED`). Before, a denied authorization was shown as "Funds held".
- `PayPalError.issue` now holds PayPal's `details[0].issue` (or `name`) for logs and decisions.

**Idempotency** (`PayPal-Request-Id`)
- Before, every call sent a random key, so a retry or double click could capture or refund twice.
- Now money-moving calls send keys built from what they act on: `capture-<authId>`,
  `capture-order-<orderId>`, `authorize-<orderId>`, `reauthorize-<authId>`, `void-<authId>`,
  `refund-<actionId>`, `invoice-<number>`, `invoice-send-<id>` and `invoice-payment-<id>-<state>`.
- Order creation keeps a random key on purpose. A fixed key would return a stale order for 6
  hours, and an extra order moves no money. GETs send no key.

**Refund body**
- `amount`, `note_to_payer` (max 255) and the new `custom_id` match `RefundRequest`.
- Seeded demo payments have `MOCKCAP_*` capture ids. In the sandbox these were sent to PayPal and
  failed with a 404. They are now simulated and labeled "create_refund · simulated (demo payment has
  no PayPal capture)"; real capture ids still go through the toolkit.
- A refund that comes back `FAILED` or `CANCELLED` is treated as a failure, never as success.

**Tracking** (Vault)
- The plugin is explicit that tracking needs a **capture id**, not an authorization id. Before,
  Vault sent the authorization id at ship time, which the sandbox would reject.
- Now tracking is saved as `pending` at ship time ("Tracking goes to PayPal on release"). It is sent
  right after capture, as `transaction_id` = capture id through the toolkit.
- The REST fallback moved from the legacy trackers-batch API to Orders v2
  `POST /v2/checkout/orders/{id}/track` (`capture_id`, `carrier`, `carrier_name_other` for `OTHER`,
  `notify_payer: false`).
- Carrier codes were corrected to PayPal's `ShipmentCarrier` values:
  `INDIA_POST` (was `IND_INDIAPOST`), `BLUEDART` (was `IND_BLUEDART`), `DTDC_IN` (was `IND_DTDC`),
  `EKART` (was `IND_EKART`). `IND_DELHIVERY`, `UPS`, `USPS`, `FEDEX` and `DHL` were already right.

**Invoicing v2** (checked against PayPal's REST reference)
- create: added `invoice_date` and `payment_term.term_type: "DUE_ON_DATE_SPECIFIED"` alongside
  `due_date`. The rest of the body was correct: `primary_recipients[].billing_info`, items with
  `quantity` as a string and `unit_amount`, `configuration.partial_payment`.
- send: if the response carries no payer-view link (a 202 has no body), the link is read from
  `detail.metadata.recipient_view_url`.
- remind: `{subject, note, send_to_recipient, send_to_invoicer}`. Correct; made `send_to_invoicer` explicit.
- record payment: **the webhook re-recorded payments PayPal had already recorded** (an
  `INVOICING.INVOICE.PAID` event led to `POST …/payments` on an invoice that was already paid). It now
  passes `paidThroughPayPal` and skips that call. Payments recorded outside PayPal (Shield's pay page)
  use `method: "OTHER"` with a note instead of `PAYPAL`, because that endpoint is for external
  payments.
- cancel: the body was correct. The toolkit's `cancel_sent_invoice` posts the same fields.

**Webhook verification** (`verifyWebhookSignature` in `lib/paypal.ts`)
- All required fields were present: `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`,
  `transmission_time`, `webhook_id`, `webhook_event`.
- Bug: the event was `JSON.parse`d and re-serialized. PayPal checks the signature against the exact
  body bytes, so the raw body is now spliced into the request unchanged.
- Missing headers now fail closed before any network call. A non-OK response and any thrown error
  count as unverified. Malformed JSON gets a 400. The route uses the shared, cached OAuth token.
- `INVOICING.INVOICE.CANCELLED`, which the route says it handles, now marks the invoice cancelled.

**JS SDK buttons** (`components/PayPalPay.tsx`)
- The script URL is built with `URLSearchParams` (`client-id`, `currency`, `intent`,
  `components=buttons`). `intent` matches the server order: `authorize` for Vault, `capture` for /shop.
- Race: if a second button mounted while the script was still loading, it called `render()` too
  early and showed nothing. It now waits for the script's `load` event.
- Added `onCancel`, so a closed popup shows "nothing was charged" instead of nothing at all.
- It stays on v5 of the JS SDK, which is still supported; v6 would mean a different integration.

**Checkout popup fix (Nov 3, later).** Buyers saw "Things don't appear to be working at the moment"
and the console logged `Detected container element removed from DOM`: the button container was
cleared and re-rendered while the popup was open (effect re-runs, StrictMode, LiveRefresh's
`router.refresh()` every 3 s), and the order was made when the deal was created, so it could be stale.
- Buttons now use the official `@paypal/react-paypal-js` (`PayPalScriptProvider` + `PayPalButtons`,
  JS SDK v5, `intent` `authorize` for Vault, `capture` for /shop). Each button is rendered once per
  mount at a stable position; nothing clears its container. /shop wraps all carts in one provider:
  two providers loading the same SDK at once inject it twice and the second load destroys the
  first one's buttons ("zoid destroyed all components").
- The provider loads the SDK only after mount (`deferLoading` until an effect runs). StrictMode
  double-runs mount effects; loading on mount injected a second copy while the first was loading.
- `createOrder` calls our API (`action: "order"`) and gets a **fresh** order at click time with the
  right intent and amount. Vault deals no longer create an order up front; /shop creates it at click
  time too (mock mode still creates and captures at once). Only the latest order can be
  authorized/captured; another order id is rejected.
- A checkout lock (`components/checkoutLock.ts`) is set in `onClick` and cleared in
  `onApprove`/`onCancel`/`onError` (and on unmount, or after 15 minutes). LiveRefresh skips while
  it's held; the page refreshes once after `onApprove` finishes.
- `onCancel` shows "Payment cancelled — nothing was charged." Errors show a readable message and log
  the details. PayPal API errors come back as `PayPal error <ISSUE>: <what to do> (debug id …)`;
  the `debug_id` is also logged on the server (`lib/http.ts`, `paypalErrorInfo` in `lib/paypal.ts`).
  Payee errors (`UNSUPPORTED_PAYEE_CURRENCY`, `PAYEE_ACCOUNT_RESTRICTED`, …) say to use a US sandbox
  business account. `INSTRUMENT_DECLINED` reopens the popup (`actions.restart()`), as PayPal advises.
- Verified with Playwright in `next dev` (StrictMode) and `next start`, for Vault and /shop: the
  popup opens on PayPal's sandbox login, the button stays while the DB changes for 10 s (several
  LiveRefresh ticks), there's no container error, and closing the popup shows the cancel message.

## Fixed afterwards (Nov 3, follow-up)
- **Late-fee mismatch: fixed.** Before, the final reminder added the agreed fee only to Shield's copy
  of the invoice, so a client paying through PayPal paid the original amount. Now the original
  PayPal invoice is never rewritten. `createLateFeeInvoice` (`lib/collections.ts`) creates and
  sends a **separate PayPal invoice** for the fee:
  - item "Late fee — <percent>% of <original>, per agreed terms", same client, due in 7 days, and
    a note naming the original invoice;
  - the amount is `lateFeePercent` of the balance still unpaid when the fee is applied, as the
    invoice terms state (a part-paid invoice pays the fee on the rest only);
  - only when `lateFeePercent > 0`, and at most once per original. The fee invoice's id is reserved
    before the PayPal call so overlapping job runs can't both create one, and a PayPal failure
    releases it and retries the final notice on the next run.
  - The two are linked with `feeInvoiceId` on the original and `feeFor` on the fee invoice.
  - The collections agent treats the pair as one debt (`debtPair`, `debtBalance`,
    `nextStep(inv, at, fee)`). It stops only when both are paid, never chases the fee invoice on
    its own, and sends PayPal reminders for whichever of the two is still open.
  - Each payment is recorded against the invoice it was for. In the UI, `recordPayment` and the
    webhook, which maps `resource.id` to the invoice by its PayPal invoice ID, apply the payment
    to that invoice alone. Payments made through PayPal are still never recorded on PayPal again.
  - The original shows "Late fee invoiced separately (INV-xxxx)". The client pay page shows both
    balances, with a pay button for each.
  - Tests: `tests/collections.test.ts` (late-fee block) and `tests/webhook.test.ts`.

## FX quotes (Pricing v2, added Nov 3)
- `quoteExchangeRates()` in `lib/paypal.ts` calls `POST /v2/pricing/quote-exchange-rates` with
  `{ quote_items: [{ base_currency, quote_currency, base_amount?, markup_percent? }] }` and reads
  `exchange_rate_quotes[]` (`base_amount`/`quote_amount` money, `exchange_rate` string, `fx_id`,
  `expiry_time`). The APIMatic plugin doesn't cover Pricing v2 (its SDK only has `ExchangeRate` on
  captures), so the shape is from PayPal's OpenAPI spec (`/api/pricing/v2/schema.json`, v2.17).
- `getRates()` in `lib/fx.ts` uses it first ("PayPal rate"), else mid-market or offline rates
  ("Estimated"). Tests: `tests/fxrates.test.ts` (mocked PayPal and market responses).
- Live, Nov 3: the token has the `pricing/quote-exchange-rates/read` scope, but the call returns
  `403 NOT_AUTHORIZED` / `FEATURE_NOT_PROVISIONED` because FX-as-a-Service isn't turned on for the
  sandbox business account. The fallback works. Re-check with `scripts/fx-live-check.ts` after
  turning it on.

## Known gaps (not changed)
- The toolkit's trackers-batch call drops `carrier_name_other`, so tracking sent as `OTHER` through
  the toolkit can be rejected. The failure is recorded on the deal and never blocks the release.
- The toolkit sends `capture_id` in the refund body as well as the path. That is the toolkit's
  behavior and can't be changed from Shield. Not yet confirmed against the live sandbox.

## Verification
- `npx tsc --noEmit` passes.
- `npm test`: 96 passing. New tests cover the honor-period and reauthorize rules, PayPal issue
  parsing, and carrier codes, plus tracking that stays pending until release and is then sent
  against the capture id.
- The live sandbox Vault and /shop popup flows are still TODO #1 in CLAUDE.md. They were not run
  in this audit.
