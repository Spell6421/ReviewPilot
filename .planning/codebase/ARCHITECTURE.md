# Architecture

**Analysis Date:** 2026-06-03

## Overview

**Backbooked** (formerly *ReviewPilot*) is a single-tenant-per-user SaaS for local
service businesses, built as a **Next.js 16 App Router monolith**. There is no separate
backend service — Next.js **Server Actions** (mutations) and **Route Handlers** (webhooks
+ cron) *are* the backend. Persistence is Prisma → Supabase Postgres; auth is Supabase Auth
via SSR cookies.

The product is conceived as **four stacked layers**; only the first two are partly built:

1. **Integration layer** — connect to booking/phone platforms (Square, GlossGenius, …). ⛔ Not started.
2. **Automation layer** — unattended review follow-up, rebooking/win-back, missed-call follow-up. 🟡 Built but naive (query-driven dedup, fixed time windows).
3. **Communication layer** — a structured inbox for all inbound signal. ⛔ Not started (replies are only counted).
4. **Analytics layer** — owner-grade ROI dashboard. ⛔ Not started.

## Architectural Pattern

**Layered monolith with a shared send core.** Two distinct execution contexts converge on
one messaging primitive:

- **Interactive context** — a signed-in owner triggers a send through the UI (Server Action).
- **Unattended context** — Vercel Cron hits a secret-gated route; no logged-in user, so the
  engine enumerates *all* businesses.

Both paths call the **same `sendMessage()` core** (`lib/send-message.ts`), guaranteeing
identical opt-out, recipient-resolution, record-before-send, and status-tracking behavior
regardless of trigger.

## Layers & Responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Presentation | `app/(app)/**/page.tsx`, `components/` | Server Components render data; `"use client"` dialogs/forms for interaction |
| Application (mutations) | `app/**/actions.ts` | Server Actions: validate → mutate → `revalidatePath()`; return form-state |
| Webhooks / Cron | `app/api/twilio/**`, `app/api/cron/automations/` | Inbound HTTP: Twilio status/replies, secret-gated automation trigger |
| Domain logic | `lib/**` | Pure-ish functions: send core, templates, automations, phone, CSV, feedback |
| Auth/scoping | `lib/current-business.ts`, `proxy.ts`, `lib/supabase/**` | Session refresh + per-business scoping gates |
| Persistence | `prisma/`, `lib/prisma.ts` | Prisma singleton → Supabase Postgres |

## Key Abstractions

- **`sendMessage()` core** (`lib/send-message.ts`) — the single send path. `resolveRecipient()`
  guards opt-out / missing phone / missing email (returns a `skipped` reason, no row);
  otherwise inserts the `Message` as `queued`, sends via `sendSms()`/`sendEmail()`, then flips
  to `sent` (+`providerSid`) or `failed`. Returns a discriminated `SendMessageResult`.
- **Find/send/preview symmetry** (`lib/automations/`) — every automation is a pure **`find*`**
  lookup returning `DueSend[]` (exactly what *would* send). `run.ts` does the shared send step;
  `preview.ts` (`buildAutomationPreview`) dry-runs the *same* `find*` so the dashboard "Test my
  setup" card can never drift from what cron actually sends. `find*` filters to reachable
  recipients via `resolveRecipient()` so counts are honest.
- **Template rendering** (`lib/render-template.ts`) — fills `{{businessName}}`,
  `{{customerName}}`, `{{reviewLink}}`. Unsupplied placeholders survive *as literals* — this is
  how `{{feedbackLink}}` passes through the pure preview/find path untouched and is minted +
  substituted at send time (`lib/feedback.ts` → `fillFeedbackLink`), keeping `find*` side-effect-free.
- **Discriminated result objects** — pervasive `{ ok: true, ... } | { ok: false, reason }` and
  `{ status: "sent" | "failed" | "skipped" }` instead of thrown exceptions.

## Data Flow

**Manual send (UI):**
```
owner submits dialog form
  → Server Action (app/(app)/messages|missed-leads/actions.ts)
  → validate input + look up customer/lead (scoped by businessId)
  → sendMessage() → resolveRecipient() → insert Message(queued)
  → sendSms()/sendEmail() → update Message(sent + providerSid | failed)
  → revalidatePath() → form-state returned to dialog
```

**Automated send (cron):**
```
Vercel Cron (daily) → GET /api/cron/automations  [Bearer CRON_SECRET]
  → enumerate ALL businesses
  → findDueSends() per business (review-follow-up / rebooking / missed-call)
  → sendMessage() per DueSend (same core) → tally sent/failed/skipped
  → JSON summary response
```

**Inbound / lifecycle (webhooks):**
```
Twilio delivery → POST /api/twilio/status → verify signature → mapTwilioStatus()
  → match by providerSid → update Message status (never downgrades 'replied')

Twilio reply  → POST /api/twilio/inbound → verify signature
  → attribute to most-recent outbound SMS to that From number
  → store new Message(replied)  [dashboard 'replies' count]
  → STOP/START keyword → toggle Customer.smsOptedOut
```

**Feedback gating (public):**
```
review_request send → mint Feedback row (token) → {{feedbackLink}} → /feedback/[token]
  → customer rates 1–5
  → rating ≥ 4 (POSITIVE_RATING_THRESHOLD): lead with Google review CTA
  → rating < 4: lead with private comment box → owner's /feedback inbox
  (non-gating: the public Google path stays reachable for everyone — Google/FTC policy)
```

## Entry Points

- **`app/layout.tsx`** — root layout: fonts, metadata, `<TooltipProvider>`. Marketing/auth
  pages (`/`, `/login`, `/onboarding`) live outside the authed group (no sidebar).
- **`app/(app)/layout.tsx`** — authed shell: sidebar + header; gates on
  `requireCurrentBusiness()`.
- **`proxy.ts`** — the middleware (this Next renames `middleware.ts` → `proxy.ts`, exporting
  `proxy()`). Runs `updateSession()` on every non-asset request to refresh the Supabase cookie.
- **`app/api/cron/automations/route.ts`** — `GET` (Vercel cron) + `POST` (manual) automation trigger.
- **`app/api/twilio/status|inbound/route.ts`** — Twilio webhooks.

## Auth & Scoping Model

- **One user owns exactly one business** (`Business.ownerId` = Supabase `auth.users.id`). No
  teams, roles, or multi-location.
- Prisma does **not** model `auth.users` — it stores `ownerId` as a UUID and scopes every
  query by it.
- Helpers in `lib/current-business.ts`: `requireCurrentUser()` (→ `/login` if signed out),
  `requireCurrentBusiness()` (→ `/onboarding` if no business; returns `{ user, business }`).
- **Every read/write is scoped by `business.id`.** Destructive actions re-check ownership in
  the `where` clause so a crafted POST can't touch another business's row. Server Actions
  enforce auth *inside* the action, not just in the UI.

## Architectural Decisions

- **No separate backend framework** — Server Actions + Route Handlers only.
- **Single shared messaging core** — UI and cron must behave identically; never send directly.
- **Preserve find/send/preview symmetry** — smarter automations (predictive cadence) must
  still be a `find*` the preview can dry-run.
- **Store every attempt before sending** — the `Message` log is the source of truth and the
  basis for automation dedup (query-only; no scheduling columns yet).
- **Branch feedback routing on rating, never on a sentiment model** — keep value obvious
  without AI.
- **Rename to Backbooked is in progress** — code/DB identifiers still say `reviewpilot`;
  rename opportunistically, never break a migration/env to change a label.

## Known Architectural Constraints

- Automation dedup is **query-against-the-Message-log** with fixed time windows — no
  per-customer cadence learning, no scheduling columns.
- A **single shared Twilio number** means inbound replies are attributed by most-recent
  outbound match, not by a per-business number.
- No `Appointment` model yet — rebooking is driven by a single `Customer.lastAppointmentAt`.
- Inbox, integrations, analytics, and Stripe billing are **not yet built**; build clickable
  UI for a layer before its deep integration.
