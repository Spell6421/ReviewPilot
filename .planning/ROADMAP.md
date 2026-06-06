# Roadmap: Backbooked — Automation Layer (Smart)

**Last updated:** 2026-06-06

## Overview

This milestone makes the existing (naive) automation engine intelligent. The old rebooking
fired on a fixed 60–120 day window off a single `Customer.lastAppointmentAt`; we replace it
with genuine per-customer prediction. Three sequential capabilities, each end-to-end and
visible in the dashboard "Test my setup" dry-run preview: a real **Appointment history** model
(seeded manually/CSV, since integrations are assumed and piped in later), then **predictive
rebooking** that learns each customer's cadence and nudges them when *they* are due, then
**staged win-back** that recovers customers who stay cold. The find/send/preview symmetry and
shared `sendMessage()` core are preserved throughout — every automation stays a pure `find*`
the preview can dry-run, and the existing review and missed-call automations keep working.

## Status at a glance

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Appointment History Foundation | ✅ **Done** | `Appointment` model + migration/backfill (applied to live DB), manual add/delete, customer-create/import seeding, appointments-CSV import |
| 2. Predictive Rebooking | ✅ **Done** | Per-customer learned cadence (median gap), default fallback, overdue ceiling. Committed `e4ff002`. Built natively after GSD offboarding |
| 3. Staged Win-Back | ✅ **Done** | Multi-touch staged recovery (count-of-`win_back`-since-last-visit, capped at 3 touches) made cadence-aware: the sequence starts at `interval × OVERDUE_CEILING` (floored at 60d), contiguous with rebooking — closing the cadence-blind seam. `lib/automations/rebooking.ts` |

## Phases

### Phase 1: Appointment History Foundation — ✅ Done

**Goal:** Store a customer's visits as individual appointment records an owner can seed
manually or via CSV, with existing last-visit behavior working off that history.
**Requirements:** APPT-01, APPT-02, APPT-03 (all complete)
**Delivered & verified:**

1. ✅ Customer profile shows individual past visits (date, optional service/source), not just one date.
2. ✅ Owner can add a visit manually and import history via CSV, with bad rows surfaced in a preview.
3. ✅ Most-recent visit is derived from appointment records (`recomputeLastAppointment` cache); rebooking/win-back still correct.
4. ✅ Adding/importing is scoped to the owner's business — no cross-business leakage.

### Phase 2: Predictive Rebooking — ✅ Done

**Goal:** Each customer is nudged to rebook when overdue relative to their own learned visit
interval (default fallback when history is thin), replacing the fixed 60–120 day window — and
the dashboard preview shows exactly who will be nudged.
**Requirements:** REBK-01…04, ENGN-01…04 (all complete)
**Delivered:** `lib/automations/rebooking.ts` (commit `e4ff002`):

1. ✅ Preview shows N rebooking nudges from each customer's computed interval (median gap); the dry-run lists the exact customers the cron would send.
2. ✅ A customer with too few visits falls back to a configurable default interval (`DEFAULT_INTERVAL_DAYS = 45`) — never silently dropped.
3. ✅ At most one rebooking nudge per dry spell; a new booking recomputes cadence and re-arms eligibility.
4. ✅ Cron sends only to reachable, opted-in customers, records every attempt before sending; review + missed-call automations unchanged.

### Phase 3: Staged Win-Back — ✅ Done

**Goal:** Customers who stay cold receive a *staged* sequence of win-back messages at multiple
intervals (~60/120/360 days), continuing in time after any rebooking nudge, without ever
double-touching the same customer in a single cron run.
**Requirements:** WINB-01, WINB-02, WINB-03, WINB-04 (all complete)
**Delivered:** `lib/automations/rebooking.ts` (`findStagedWinBacks`):

1. ✅ A cold customer receives staged win-back messages at multiple intervals, each stage firing at most once per cold spell, and a new booking resets the whole sequence. *(Stage = count of `win_back` sends since `lastAppointmentAt`, capped at `WIN_BACK_STAGES`=3; thresholds `coldThreshold + [0,60,300]` days realize ~60/120/360 at the floor; a `WIN_BACK_MIN_SPACING_DAYS` guard prevents bursts on late discovery.)*
2. ✅ A customer who got a rebooking nudge and stayed cold still enters the staged win-back sequence — the prior rebooking does not cancel or permanently block win-back. *(Win-back gating counts only `win_back` messages; the cadence-aware cold point starts the sequence right after the rebooking window.)*
3. ✅ In any single cron run, a customer receives either a rebooking nudge or a win-back stage, never both — and the preview reflects the same de-confliction before sending. *(Per-run `rebookedThisRun` exclusion; the staged win-back stays a pure `find*` the "Test my setup" preview dry-runs.)*

**Design note resolved:** win-back was *cadence-blind* (fixed 120–365-day window) while rebooking
was cadence-aware. Phase 3 made win-back cadence-aware — its first touch fires at
`interval × OVERDUE_CEILING` (floored at 60 days), the same seam where rebooking stops — closing
both the long-cadence skip and the thin-history 90–120-day dead zone flagged in
[CONCERNS.md](CONCERNS.md).

## After this milestone

Per the layer-by-layer plan: the **communication layer** (structured inbox for replies / routed
negative feedback / opt-outs) is the next milestone, then **analytics** (ROI dashboard), then
**billing** (Stripe). The **integration layer** (Square/GlossGenius/… + phone events) replaces
the manual/CSV seed as the data source. See `.planning/PROJECT.md` for scope boundaries.
