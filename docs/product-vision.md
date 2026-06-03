# Backbooked — Product Vision & Pivot Brief

> This document is the canonical statement of where the product is going. It captures the
> pivot from **ReviewPilot** (a narrow review-request tool) to **Backbooked** (a missed-revenue
> recovery platform for local service businesses). `AGENTS.md` is the working/engineering
> source of truth and stays in sync with this; when the two disagree about *intent*, this wins.

## One sentence

> **Backbooked connects to your booking and phone systems to automatically recover missed
> calls, bring back inactive customers, and turn happy appointments into more reviews.**

## Why the pivot

ReviewPilot only did one thing — ask for reviews — and required the owner to feed it
customers by hand. That's a feature, not a product. The real, repeatable pain for a barber,
med spa, dentist, tattoo shop, cleaner, or detailer is **lost revenue they never see**:
the call they missed, the regular who quietly stopped coming, the happy client who never
left the review that would have brought in the next three.

Backbooked is the same surface area, reframed as an outcome the owner already understands —
**stay backbooked** (calendar full) — and built so it works against the systems they
*already* use instead of a manual customer list.

## The four layers

The product is built as four layers that stack into one coherent app.

### 1. Integration layer — *the foundation that makes it seamless*

The most tedious layer, and the most important for adoption. Owners must be able to use
Backbooked **with their existing systems** — Square, GlossGenius, and everything in
between (Booksy, Vagaro, Acuity, Fresha, Calendly, etc.) — plus their phone/SMS provider
for missed-call signal.

The goal of this layer is **simple, customer-usable setup flows** for those integrations:
connect an account, pull in customers + appointment history, and receive ongoing events
(appointment completed, missed call) without the owner exporting CSVs. CSV/manual entry
stays as the universal fallback, but integrations are what make the automation layer
*automatic*.

### 2. Automation layer — *the meat of the product*

Four automations, all schedule/event-driven and unattended:

1. **Review request with feedback gating.** After an appointment, text the customer asking
   for feedback. If they respond **positively**, route them to leave a detailed Google Maps
   review. If they respond **negatively**, route the feedback *to the owner* (private — into
   the communication layer) instead of to a public review. This protects the business's
   public rating while still capturing the signal.
2. **Predictive rebook reminders.** Use each customer's own visit history to learn their
   cadence and nudge them when they're due. Start from a default interval, then per-customer:
   if a regular comes in every ~7 weeks, on week 8 (if they haven't already rebooked) send a
   "we miss you at [shop], we'd love to have you back" nudge with a booking link.
3. **Missed-call follow-up.** The easiest lost revenue to recover — text/email after any
   missed call: "Hey, you called us — did you want an appointment?"
4. **Win-back campaigns.** For customers who've gone cold, send win-back messages at set
   intervals (e.g. ~60 / 120 / 360 days) to pull them back onto the calendar.

### 3. Communication layer — *a structured inbox for the owner*

Feedback and replies from customers have to land somewhere structured and sortable. Some
messages don't expect a reply (a rebook nudge just wants the customer to click the booking
link) — but the owner still wants to *see* it if they say something. More importantly, the
**negative feedback routed from the review automation** needs a home. This layer is a
single, sortable inbox where every inbound signal (replies, feedback, opt-outs) is
organized so the owner can act on it.

### 4. Analytics layer — *down-to-earth ROI*

A simple dashboard showing the few metrics an owner actually cares about — **ROI, reviews
generated, calls recovered, customers rebooked, revenue brought back** — not generic
SaaS-slop charts. The bar is "an owner glances at this and knows the product is paying for
itself."

## Current state (honest)

The app today is essentially the **bare foundation** of the communication + automation
layers:

- Customers can be added **manually or via CSV import** (E.164 normalization, validation).
- It can **send SMS (Twilio) and email (Resend)** to those customers, with the full SMS
  round-trip wired: delivery-status webhook, inbound-reply webhook, and STOP/opt-out.
- A **first-pass automation engine** exists (`lib/automations/`) — review follow-up,
  rebooking/win-back, missed-call follow-up — triggered by a cron route, with a dry-run
  preview. This is the seed of the automation layer, but it is *query-driven and naive*:
  fixed time windows, no per-customer cadence learning, no feedback gating/routing.

Everything else in the vision is **not built**: no integrations (Square/GlossGenius/etc.),
no predictive rebook timing, no good-vs-bad feedback routing, no structured inbox, no
analytics/ROI dashboard. The name change (ReviewPilot → Backbooked) is also in progress.

## What changes vs. ReviewPilot

| Area | ReviewPilot (old) | Backbooked (new) |
| --- | --- | --- |
| Input | Manual / CSV customers only | Integrations (Square, GlossGenius, …) + CSV fallback |
| Reviews | Blanket review request | Feedback-gated: happy → Google, unhappy → private inbox |
| Rebooking | Fixed 60/120/365-day windows | Per-customer learned cadence |
| Inbox | Replies counted on the dashboard | Structured, sortable communication inbox |
| Analytics | Stat cards | Owner-grade ROI dashboard |
| Positioning | "Get more reviews" | "Stay backbooked — recover the revenue you don't see" |

## Guardrails (unchanged from the product's roots)

Every feature must answer one of: **(1) more reviews? (2) recover a lost lead? (3) bring
back a customer? (4) save the owner time?** If not, defer it. Stay conservative on
messaging — store every attempt, honor opt-out, include business identity, no bulk
blasting, at most one follow-up per anchor. Don't build a "generic AI app"; the value
should be obvious without AI.
