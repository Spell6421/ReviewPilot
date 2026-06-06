# Roadmap: Backbooked — Automation Layer (Smart)

## Overview

This milestone makes the existing (naive) automation engine intelligent. Today's rebooking
fires on a fixed 60–120 day window off a single `Customer.lastAppointmentAt`; we replace it
with genuine per-customer prediction. The journey is three sequential vertical capabilities,
each end-to-end and visible in the dashboard "Test my setup" dry-run preview: first a real
**Appointment history** model (seeded manually/CSV, since integrations are assumed and piped
in later), then **predictive rebooking** that learns each customer's cadence and nudges them
when *they* are due, then **staged win-back** that recovers customers who stay cold. The
find/send/preview symmetry and shared `sendMessage()` core are preserved throughout — every
new automation is a pure `find*` the preview can dry-run, and the existing review and
missed-call automations keep working unchanged.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Appointment History Foundation** - Store real per-visit `Appointment` records, seed them manually/CSV, derive most-recent visit from them
- [ ] **Phase 2: Predictive Rebooking** - Learn each customer's cadence and nudge when overdue, replacing the fixed window, with symmetry and existing automations preserved
- [ ] **Phase 3: Staged Win-Back** - Multi-touch (~60/120/360 day) recovery of cold customers, sequential after rebooking and never double-touching in one run

## Phase Details

### Phase 1: Appointment History Foundation

**Goal:** The app stores a customer's visits as individual appointment records that an owner can seed manually or via CSV, and existing last-visit behavior keeps working off that history.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** APPT-01, APPT-02, APPT-03
**Success Criteria** (what must be TRUE):

  1. A customer's profile shows a list of individual past visits (date, optional service, optional source), not just a single last-appointment date.
  2. An owner can add an appointment to a customer manually, and import appointment history via CSV, with bad rows surfaced in a preview rather than silently dropped.
  3. The customer's most-recent visit is derived from their appointment records, and the existing rebooking/win-back behavior driven by last-visit still produces correct results (migrated or derived).
  4. Adding/importing appointments is scoped to the owner's business — no appointment leaks across businesses.

**Plans:** 4 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Foundation: Appointment model + [BLOCKING] migration/backfill + recomputeLastAppointment helper

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Slice: customer detail page + manual add/delete visit + clickable table rows
- [x] 01-03-PLAN.md — D-07: customer create/import seed a backing appointment + recompute

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-04-PLAN.md — Slice: appointments-CSV import (parser, action, preview dialog, fixture)

### Phase 2: Predictive Rebooking

**Goal:** Each customer is nudged to rebook when overdue relative to their own learned visit interval (with a default fallback when history is thin), replacing the fixed 60–120 day window — and the dashboard preview shows exactly who will be nudged.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** REBK-01, REBK-02, REBK-03, REBK-04, ENGN-01, ENGN-02, ENGN-03, ENGN-04
**Success Criteria** (what must be TRUE):

  1. The dashboard "Test my setup" preview shows N rebooking nudges due based on each customer's own computed interval (average/median gap), and a dry-run lists the exact customers — matching what the cron would send.
  2. A customer with too few visits to learn a cadence still becomes due based on a configurable default interval, and never silently falls through the cracks.
  3. A customer receives at most one rebooking nudge per dry spell, and booking again (a new appointment) resets their eligibility.
  4. Running the cron sends rebooking nudges only to reachable, opted-in customers, records every attempt before sending, and the review follow-up and missed-call follow-up automations still fire exactly as before.

**Plans:** TBD

### Phase 3: Staged Win-Back

**Goal:** Customers who stay cold receive a staged sequence of win-back messages at multiple intervals (~60/120/360 days), continuing in time after any rebooking nudge, without ever double-touching the same customer in a single cron run.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** WINB-01, WINB-02, WINB-03, WINB-04
**Success Criteria** (what must be TRUE):

  1. A cold customer receives staged win-back messages at multiple intervals (~60/120/360 days), each stage firing at most once per cold spell, and a new booking resets the whole sequence.
  2. A customer who got a rebooking nudge and stayed cold still enters the staged win-back sequence — the prior rebooking does not cancel or permanently block win-back.
  3. In any single cron run, a customer receives either a rebooking nudge or a win-back stage, never both — and the dashboard preview reflects this same de-confliction before sending.

**Plans:** TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Appointment History Foundation | 3/4 | In Progress | - |
| 2. Predictive Rebooking | 0/TBD | Not started | - |
| 3. Staged Win-Back | 0/TBD | Not started | - |
