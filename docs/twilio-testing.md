# Testing Twilio SMS end-to-end

How to fully exercise the Twilio integration — outbound send, the **status**
webhook, and the **inbound** (reply) webhook — without A2P 10DLC approval, a
hosted site, or a personal phone.

## Why this works

A2P 10DLC registration is still pending, so real SMS to normal phone numbers
(including your own "verified" number) is blocked by carriers. The **Twilio
Virtual Phone** (`+18777804236`) is exempt: it's a simulated device in the
Console, and because the exchange stays entirely inside Twilio it bypasses the
A2P wall while still using your **live** credentials and producing **real**
message events. That's enough to trigger both webhooks for real.

- Your trial number `+18557743033` is the **sender** (the `From`).
- The Virtual Phone `+18777804236` is the **test recipient/device**.

## One-time setup

1. **Run the app and a tunnel** so Twilio can reach `localhost`:

   ```bash
   npm run dev          # terminal 1 → http://localhost:3000
   ngrok http 3000      # terminal 2 → copy the https URL, e.g. https://abc123.ngrok-free.app
   ```

2. **Status callback** — add to `.env.local`, then restart `npm run dev`:

   ```
   TWILIO_STATUS_CALLBACK_URL=https://abc123.ngrok-free.app/api/twilio/status
   ```

3. **Inbound webhook** — Twilio Console → Phone Numbers → your number
   `+18557743033` → **A message comes in** → **HTTP POST** →

   ```
   https://abc123.ngrok-free.app/api/twilio/inbound
   ```

4. **Test customer** — in the app (Customers page), add a customer whose phone
   is exactly **`+18777804236`**. This is the key trick: the inbound handler
   (`app/api/twilio/inbound/route.ts`) attributes a reply by matching its `From`
   against the most recent outbound SMS to that phone, and the Virtual Phone's
   `From` *is* `+18777804236`.

## The round-trip test

5. **Send** a review request to the test customer from the Messages page.
6. **Status webhook** — watch the `npm run dev` terminal for a `POST
   /api/twilio/status`. In Supabase, the `messages` row should carry a
   `provider_sid` and settle on `sent`.
7. **Reply** from the Virtual Phone UI in the Console (type anything, send).
8. **Inbound webhook** — a `POST /api/twilio/inbound` arrives; a **new**
   `messages` row appears with `status = replied` and your reply in `body`.
9. **Dashboard** — "Replies received" increases by 1; "Review requests sent" is
   unchanged (the inbound reply is a separate row, not a status flip).

If steps 6 and 8 both land in the database, the whole Twilio integration is
proven correct. The only thing still pending is A2P approval to swap the Virtual
Phone for real customer numbers — a Twilio account gate, not a code change.

## Gotchas

- **ngrok free URLs change** on every restart. Re-paste the new URL into both
  `TWILIO_STATUS_CALLBACK_URL` and the Console inbound webhook if you restart the
  tunnel (and restart `npm run dev` after editing `.env.local`).
- **Phone matching is exact-string.** Enter the customer's phone as
  `+18777804236` with no spaces or dashes, or the inbound reply won't match and
  gets dropped (you'll see a `no prior outbound message matched` warning in the
  logs).
- **Signature validation** is enforced (403) only in production. In dev the
  webhooks log a warning and proceed, so tunnel/proxy quirks don't block local
  testing.
- **Trial prefix** — trial accounts prepend "Sent from your Twilio trial
  account" to outbound messages. Harmless; it disappears once the account is
  upgraded.

## Magic test numbers (outbound-only alternative)

If you only want to test the **outbound** code path (not webhooks), Twilio's
[magic numbers](https://www.twilio.com/docs/iam/test-credentials) work with your
**Test** credentials (Console → Account → API keys & tokens → *Test* SID/token).
They return fake responses without sending — useful for forcing the `failed`
branch:

| Send `To`       | Result                                   |
| --------------- | ---------------------------------------- |
| `+15005550006`  | success (fake)                           |
| `+15005550001`  | error 21211 — invalid number → `failed`  |
| `+15005550009`  | error 21614 — not SMS-capable → `failed` |

With Test credentials the `From` must also be `+15005550006`. These do **not**
fire status or inbound webhooks (no real message exists), so prefer the Virtual
Phone for full-flow testing.
