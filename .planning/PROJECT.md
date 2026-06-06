# Backbooked

## What This Is

Backbooked is a small SaaS for local service businesses (barbers, med spas, dentists,
tattoo shops, cleaners, detailers, photographers, tutors) that automatically recovers the
revenue an owner never sees — the missed call, the regular who quietly stopped coming, the
happy client who never left a review. The positioning is **"stay backbooked"**: keep the
calendar full.

The product is conceived as four stacked layers — **integration** (connect to booking/phone
systems), **automation** (unattended review/rebook/missed-call/win-back sends), **communication**
(a structured inbox for inbound signal), and **analytics** (owner-grade ROI). The foundation
of layers 2–3 is built; this milestone makes the **automation layer intelligent**.

## Core Value

**Bring customers back at the right time, automatically** — predictive, per-customer rebooking
that nudges each customer when *they* are due, not on a generic fixed schedule. If everything
else fails, recovering repeat bookings without the owner lifting a finger must work.

## Current Milestone

**Automation layer — make it smart.** Most of the way there: real `Appointment` history and
**predictive per-customer rebooking** are built (Phases 1–2); the remaining piece is **staged
multi-touch win-back** (Phase 3). See `.planning/ROADMAP.md`.

> **Build assumption:** integrations are *assumed*. Any data the automations rely on —
> appointment history, phone numbers, last-visit dates, missed-call events — will be piped in
> by the (future) integration layer. We do **not** build integrations this milestone; we seed
> data manually/CSV and code against it as if it arrives automatically.

## Requirements

### Validated

<!-- Built and confirmed working in the existing codebase (brownfield). -->

- ✓ Manual + CSV customer entry with E.164 normalization/validation — existing
- ✓ SMS send via Twilio with full round-trip: delivery-status webhook, inbound-reply webhook, STOP/opt-out — existing
- ✓ Email send via Resend (send path; delivery webhooks not wired) — existing
- ✓ Shared `sendMessage()` core (record-before-send, recipient resolution, opt-out guard, status tracking) used by both UI and cron — existing
- ✓ Editable per-business message templates with `{{businessName}}`/`{{customerName}}`/`{{reviewLink}}`/`{{feedbackLink}}` — existing
- ✓ Review request + feedback-gated rating page (`/feedback/[token]`): ≥4 → Google CTA, <4 → private comment box → owner inbox, no-link → thanks — existing, confirmed end-to-end
- ✓ Review follow-up automation (one follow-up 2–30 days after a sent request; skips repliers/raters) — existing
- ✓ Missed-call follow-up automation (one follow-up to a still-`contacted` lead after a sent recovery text) — existing
- ✓ Naive rebooking + win-back automation (fixed 60–120 / 120–365 day windows off `lastAppointmentAt`) — existing, to be replaced this milestone
- ✓ Cron automation trigger (secret-gated route) + find/send/preview symmetry + dashboard "Test my setup" dry-run preview — existing

### Active

<!-- This milestone: make the automation layer smart. -->

- [x] Real `Appointment` history model (date, service, source); seed/CSV now, integrations populate it later — **shipped (Phase 1)**
- [x] Predictive rebooking: compute each customer's typical interval from their own appointment history (median gap), nudge when overdue — **shipped (Phase 2, `e4ff002`)**
- [x] Default-interval fallback when a customer's history is too thin to learn a cadence — **shipped (Phase 2, 45-day default)**
- [x] Preserve find/send/preview symmetry — predictive logic stays a `find*` the preview can dry-run — **preserved**
- [x] Keep review + missed-call automations working unchanged — **preserved**
- [ ] Staged win-back: multi-touch (~60/120/360 days) for cold customers, replacing the single-shot win-back — **Phase 3, next**

### Out of Scope

<!-- Explicit boundaries with reasoning, so they aren't re-added by accident. -->

- **Integration layer (Square, GlossGenius, Booksy, Vagaro, Acuity, Fresha, phone/SMS event ingest)** — assumed for now; data is piped in by a future milestone. Coding against assumed data keeps this milestone focused.
- **Communication inbox layer** — future milestone (`/gsd-new-milestone` after this). Low-rating feedback already has a minimal `/feedback` home; the full structured inbox comes later.
- **Analytics / ROI dashboard layer** — future milestone.
- **Stripe billing + message-quota enforcement** — future milestone (billing fields exist but inert).
- **In-text reply sentiment classification (happy/unhappy reply → route)** — deferred. Sentiment-analyzing short SMS is error-prone, and a smarter conversational-feedback loop is a *differentiator*, not a minimum-viable requirement. Parked deliberately; revisit as a differentiator once the MVP layers exist. Gating stays at the deterministic `/feedback` rating page.
- **Per-business Twilio numbers, send retry/backoff, email delivery webhooks, structured logging/alerting** — known debt, not this milestone.

## Context

- **Brownfield.** Next.js 16 App Router monolith; Server Actions + Route Handlers are the backend. Prisma 5.22 → Supabase Postgres; Supabase Auth via SSR cookies. One user owns exactly one business; every query scoped by `business.id`.
- **The engine to evolve** lives in `lib/automations/` (`run.ts` find+send, `preview.ts` dry-run, plus per-automation `find*` lookups). Today's dedup is query-against-the-`Message`-log with fixed windows — no scheduling columns, no appointment history. Rebooking is driven by a single `Customer.lastAppointmentAt`.
- **Naming:** rename ReviewPilot → Backbooked is in progress; DB tables/package/identifiers still say `reviewpilot`. Rename opportunistically, never break a migration/env/identifier for a label.
- **Testing:** no automated suite. Validation is `npx tsc --noEmit` + `npm run lint` + manual browser/Supabase checks. A2P 10DLC unapproved — test SMS via Twilio Virtual Phone `+18777804236` over a tunnel.
- Engineering source of truth: `AGENTS.md` (+ `docs/engineering-guide.md`). Product vision: `docs/product-vision.md`.

## Constraints

- **Tech stack**: Next.js 16.2.6 / React 19.2 / TypeScript 5 / Prisma 5.22 / Supabase / Twilio v6 / Resend v6 — don't add a separate backend or new deps without an immediate need.
- **Architecture**: preserve the single shared `sendMessage()` core and the find/send/preview symmetry — smarter automations must still be a `find*` the preview can dry-run. Store every attempt before sending; honor opt-out; at most one follow-up per anchor; no bulk blasting; include business identity.
- **No AI dependency for core value**: the value must be obvious without AI. Branch on data (ratings, intervals), not on sentiment models.
- **Migrations**: Prisma CLI reads `.env`, not `.env.local` — run through the `dotenv-cli`-wrapped `npm run db:*` scripts.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scope this roadmap to the automation layer only | Go layer-by-layer to avoid context rot; inbox/analytics/billing become later milestones | — Pending |
| Predictive rebooking = per-customer median cadence (not richer modeling) | Simple, explainable, no ML; accurate enough for MVP; default fallback when history is thin | ✅ Shipped (Phase 2) |
| Add a real `Appointment` history model | Genuine cadence needs actual visit history, not a single `lastAppointmentAt`; integrations populate it later | ✅ Shipped (Phase 1) |
| Staged win-back (~60/120/360) instead of single-shot | Vision calls for multi-touch recovery of cold customers | Phase 3 (next) |
| Defer in-text reply sentiment gating | Misclassification risk on short SMS; differentiator, not MVP; keep deterministic page gating | — Pending |
| PROJECT.md describes the whole product; roadmap stays narrow | Keep an accurate north star while keeping execution tight | — Pending |

## Evolution

Hand-maintained (the project offboarded from GSD tooling on 2026-06-06). Update this doc when a
phase completes or scope shifts: move shipped items from Active → Validated with a phase/commit
reference, log new decisions, promote a future-milestone layer to the current milestone when it
starts, and re-check that "What This Is" / Core Value still hold. Keep it honest — this is the
north star a state eval reads first.

---
*Last updated: 2026-06-06 — Phases 1–2 shipped (appointment history + predictive rebooking); staged win-back (Phase 3) remaining.*
