# Live sandbox checklist

Four manual checks against the real PayPal sandbox. These cover what the automated tests can't:
the PayPal popup, real capture IDs, and the sandbox inbox. Plan on about 30 minutes.

## Setup (once)

1. In `.env.local`, set the PayPal sandbox keys (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `NEXT_PUBLIC_PAYPAL_CLIENT_ID`). Then set `SANDBOX_BUYER_EMAIL` to your sandbox **personal**
   account (developer.paypal.com → Testing Tools → Sandbox Accounts). The seeded client Dana and
   the invoice form then use that address, so PayPal invoices land in its sandbox inbox.
2. **Don't** set `SHIELD_FORCE_MOCK`; the checks need real PayPal. Set `DEMO_EMAIL_OVERRIDE` to
   your own address, so Shield's reminder emails reach you and not the sandbox address.
3. For check 3, PayPal must be able to reach the webhook. Use the Render deploy, or a tunnel to
   `localhost:3000`. In the sandbox app, add a webhook at `https://<host>/api/paypal/webhook` for
   `INVOICING.INVOICE.PAID` and `INVOICING.INVOICE.CANCELLED`, and put its ID in `PAYPAL_WEBHOOK_ID`.
4. Run `npm run dev`. On **Demo**, press **Reset** so Dana picks up `SANDBOX_BUYER_EMAIL`.

A failed PayPal call shows its reason in the page or the console log, for example
`PayPal POST … failed (422 AUTHORIZATION_EXPIRED)`. Write it down before retrying.

## 1. Vault: hold, ship, release, tracking

| Step | As | Click |
|---|---|---|
| 1 | Meera | **Vault** → title "Canon 200D", price `320` USD → **Create Vault link** |
| 2 | Arjun (buyer) | open the deal → PayPal button → log in to the popup as the sandbox personal account → approve |
| 3 | Meera | carrier `India Post`, tracking `EZ123456789IN` → **Mark shipped** |
| 4 | Meera | **Simulate delivery scan** |
| 5 | Arjun | **It arrived. Release payment** |

**Pass:**
- After step 2, the deal reads "authorized" and its timeline shows "Funds held: authorization …"
  with a real ID, not `MOCKAUTH…`.
- After step 3, it shows **"Tracking goes to PayPal on release"**. This is expected: PayPal attaches
  tracking to a capture, and there isn't one yet.
- After step 5, "Paid to the seller" shows **PayPal capture `<real id>`** (not `MOCKCAP…`), and the pill
  reads **"Tracking shared with PayPal"** via `PayPal Agent Toolkit · create_shipment_tracking`.
- In the sandbox business account, the payment shows as completed with the India Post tracking number.

**Fail:** a red "PayPal didn't accept the tracking" pill. Note the reason shown next to it.

## 2. Resolve: refund that real capture, approved in the console

| Step | As | Click |
|---|---|---|
| 1 | Arjun | **Support** → "Please refund my Canon 200D from Meera, it stopped working" |
| 2 | Arjun | reply "that didn't help" (this escalates to the Tier 2 resolution agent) |
| 3 | agent | **Console** → the case → refund action marked **Needs your approval** → **Approve** |

**Pass:**
- The proposed refund is USD 320 against the capture ID from check 1.
- After **Approve**, the action reads **Approved**, the pill says `PayPal Agent Toolkit · create_refund`,
  and the result names a real PayPal refund ID.
- The sandbox business account shows the refund on that payment.

**Fail:**
- The pill says "simulated": the transaction has a `MOCKCAP…` ID, so check 1 didn't run against
  the sandbox.
- The action reads **Failed**: note the PayPal reason. The toolkit is never retried through REST,
  so a failure can't refund twice.

## 3. Invoice: paid in the sandbox inbox and recorded once, plus the late-fee invoice

| Step | As | Click |
|---|---|---|
| 1 | Meera | **Get Paid** → client email is already `SANDBOX_BUYER_EMAIL` → amount `800` USD, late fee `2`% → send |
| 2 | — | **Demo** → **+1 week** four times. That takes it past the final notice (due date + 14 days) |
| 3 | Meera | **Get Paid**: the original reads **"Late fee invoiced separately (INV-xxxx)"** |
| 4 | — | in the sandbox personal account's inbox (developer.paypal.com → Sandbox → Notifications), open the original invoice and pay it |
| 5 | — | pay the late-fee invoice from the inbox the same way |

**Pass:**
- After step 2, there are two PayPal invoices: the original, unchanged at USD 800, and a new one for
  USD 16, "Late fee — 2% of INV-xxxx, per agreed terms", due in 7 days.
- After step 4, the webhook marks only the original **Paid**. The fee invoice is still open and the
  agent keeps chasing it.
- On PayPal, the original shows **one** payment, not a second one recorded by Shield.
- After step 5, both are paid and no further reminders go out. Dana's pay page
  (`/get-paid/pay/<id>`) shows "Paid in full".

**Fail:**
- Either invoice shows two payments on PayPal.
- Paying the fee marks the original paid.
- A second fee invoice appears.

## 4. One /shop checkout

| Step | As | Click |
|---|---|---|
| 1 | Meera | **Shop** → "toilet paper, paper towels, laundry detergent, coffee, olive oil" (above the auto-approve threshold) |
| 2 | Meera | **Approve USD …** → the PayPal popup → approve as the sandbox personal account |

**Pass:**
- The cart moves from **pending approval** to **paid** with a real capture ID.
- A transaction "Shopping agent: N items" appears.
- In the sandbox personal account, the order shows as completed.
- Products are labeled with real retailers when `CHANNEL3_API_KEY` is set, or "Sample products"
  when it isn't.

**Fail:**
- The popup closes without paying: you should see "Payment cancelled — nothing was charged."
- A red "PayPal error <ISSUE>: …" message: note the issue and the debug id. `UNSUPPORTED_PAYEE_CURRENCY` or `PAYEE_ACCOUNT_RESTRICTED` means the app's sandbox business account can't take USD: use a US sandbox business account.
- The cart is captured without the popup, which means mock mode is still on.

## After

Record the date, the four results and any PayPal error reasons in CLAUDE.md under TODO #1.
