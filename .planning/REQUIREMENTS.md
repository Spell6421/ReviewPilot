# Requirements: Backbooked — Automation Layer (Smart)

**Defined:** 2026-06-03
**Core Value:** Bring customers back at the right time, automatically — predictive, per-customer rebooking.

> **Milestone scope:** make the existing (naive) automation engine intelligent. Integrations
> are *assumed* — appointment history, phone numbers, and missed-call events are piped in by a
> future layer; we seed manually/CSV for now and code against that data as if it arrives
> automatically. Communication inbox, analytics, and billing are separate future milestones.

## v1 Requirements

### Appointment History (APPT)

- [x] **APPT-01**: Customer visit history is stored as individual `Appointment` records (date, optional service, optional source) — not just a single `lastAppointmentAt`. *(Phase 1, Plan 01-01)*
- [ ] **APPT-02**: Owner can seed/import appointment history manually and via CSV, so cadence works before integrations exist. *(Manual add/delete landed in Plan 01-02; CSV import remains in Plan 01-04 — complete once both ship.)*
- [x] **APPT-03**: A customer's most-recent visit is derived from their `Appointment` records; existing `lastAppointmentAt`-driven behavior stays correct (migrated or derived). *(Phase 1, Plan 01-01)*

### Predictive Rebooking (REBK)

- [ ] **REBK-01**: System computes each customer's typical visit interval (average/median gap) from their appointment history.
- [ ] **REBK-02**: A customer becomes due for a rebooking nudge when overdue relative to *their own* learned interval, replacing the fixed 60–120 day window.
- [ ] **REBK-03**: When a customer's history is too thin to learn a cadence, the system falls back to a configurable default interval.
- [ ] **REBK-04**: A customer receives at most one rebooking nudge per dry spell; booking again resets eligibility.

### Staged Win-Back (WINB)

- [ ] **WINB-01**: Cold customers receive *staged* win-back messages at multiple intervals (~60/120/360 days), not a single message.
- [ ] **WINB-02**: Each win-back stage fires at most once per cold spell; a new booking resets the sequence.
- [ ] **WINB-03**: A customer who received a rebooking nudge and stayed cold still enters the staged win-back sequence — rebooking does not cancel win-back; win-back follows it in time.
- [ ] **WINB-04**: Rebooking and win-back never fire to the same customer in the same cron run (no same-day double-touch), but a prior rebooking nudge never blocks a later win-back stage.

### Engine Integrity (ENGN)

- [ ] **ENGN-01**: Predictive rebooking and staged win-back remain pure `find*` lookups the dashboard "Test my setup" preview can dry-run (find/send/preview symmetry preserved).
- [ ] **ENGN-02**: The dashboard preview accurately reflects what the cron will send under the new logic.
- [ ] **ENGN-03**: Existing review follow-up and missed-call follow-up automations continue working unchanged.
- [ ] **ENGN-04**: Opt-out, record-before-send, and one-touch-per-anchor rules continue to hold for the new automations.

## v2 Requirements

Deferred to future milestones. Tracked but not in this roadmap.

### Communication Inbox

- **INBX-01**: Structured, sortable inbox for all inbound signal (replies, routed negative feedback, opt-outs).

### Analytics

- **ANLY-01**: Owner-grade ROI dashboard (reviews generated, calls recovered, customers rebooked, revenue recovered).

### Billing

- **BILL-01**: Stripe subscriptions + plan/message-quota enforcement.

## Out of Scope

Explicitly excluded this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Integration layer (Square, GlossGenius, Booksy, Vagaro, Acuity, Fresha, phone/SMS event ingest) | Assumed — data is piped in by a future milestone; coding against assumed data keeps this milestone focused |
| In-text reply sentiment gating (happy/unhappy reply → route) | Misclassification risk on short SMS; a smarter conversational loop is a differentiator, not MVP; deterministic `/feedback` page gating already works |
| Richer cadence modeling (trend/variance/seasonality, confidence intervals) | Per-customer average is explainable and accurate enough for MVP; revisit if needed |
| Per-business Twilio numbers, send retry/backoff, email delivery webhooks, structured logging | Known debt; not required to make automations smart |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| APPT-01 | Phase 1 (01-01) | Complete |
| APPT-02 | Phase 1 (01-02 manual / 01-04 CSV) | Partial — manual add/delete done (01-02) |
| APPT-03 | Phase 1 (01-01) | Complete |
| REBK-01 | Phase 2 | Pending |
| REBK-02 | Phase 2 | Pending |
| REBK-03 | Phase 2 | Pending |
| REBK-04 | Phase 2 | Pending |
| WINB-01 | Phase 3 | Pending |
| WINB-02 | Phase 3 | Pending |
| WINB-03 | Phase 3 | Pending |
| WINB-04 | Phase 3 | Pending |
| ENGN-01 | Phase 2 | Pending |
| ENGN-02 | Phase 2 | Pending |
| ENGN-03 | Phase 2 | Pending |
| ENGN-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15 ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-03*
*Last updated: 2026-06-06 — APPT-02 manual add/delete landed (Phase 1, Plan 01-02); CSV import (01-04) completes APPT-02*
