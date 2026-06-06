---
phase: 01-appointment-history-foundation
plan: 03
subsystem: customer-create-import
tags: [next16, server-actions, appointments, derived-cache, d-07, scoping]

# Dependency graph
requires:
  - "01-01 — Appointment model + recomputeLastAppointment(customerId, businessId) helper + lastAppointmentAt cache"
provides:
  - "createCustomerAction seeds a backing Appointment(source='manual') + recompute instead of writing lastAppointmentAt directly (D-07)"
  - "importCustomersAction seeds backing Appointment(source='csv') per last-visit row + one recompute pass per distinct affected customer (D-07)"
  - "All FIVE cache-mutation paths now route through recomputeLastAppointment — no path can orphan a last-visit value"
affects: [predictive-rebooking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-07 seed-then-derive: create the customer WITHOUT lastAppointmentAt; if a last-visit date is provided, create a backing Appointment then recomputeLastAppointment so the cache is derived, never written directly"
    - "Bulk import creates per-row (not createMany) to capture each new customer id for a reliable row→seed-appointment map (no fragile re-fetch / cross-row collision), then recomputes ONCE per distinct affected customer (Pitfall 1) — never per row"

key-files:
  created: []
  modified:
    - app/(app)/customers/actions.ts

key-decisions:
  - "createCustomerAction + importCustomersAction stop writing lastAppointmentAt directly; they seed a backing Appointment (source manual/csv, service null) then recompute — no orphaned last-visit value possible (D-07)"
  - "Customer-CSV import switched from createMany to per-row create to capture ids reliably (chosen over a phone/email re-fetch which could collide across rows); recompute runs once per distinct affected customer, never per row (Pitfall 1)"
  - "APPT-02 still only partial after this plan — dedicated appointments-CSV import (01-04) is the remaining half; this plan completes the D-07 customer-flow seeding only"

patterns-established:
  - "Seed-then-derive on every write path: a customer create/import with a last-visit value inserts a backing appointment and recomputes the cache, so the D-04 invariant (lastAppointmentAt == MAX(appointment.date) | null) holds from every entry point"

requirements-completed: []
requirements-advanced: [APPT-02, APPT-03]

# Metrics
duration: ~2min
completed: 2026-06-06
---

# Phase 01 Plan 03: Customer Create/Import Seed a Backing Appointment (D-07) Summary

**Closes the last two of the five cache-mutation paths: `createCustomerAction` and `importCustomersAction` no longer write `Customer.lastAppointmentAt` directly — they seed a backing `Appointment` (source `manual`/`csv`) and recompute the derived cache, so a last-visit value can never be orphaned and the D-04 invariant holds from every entry point.**

## Performance

- **Duration:** ~2 min
- **Completed:** 2026-06-06
- **Tasks:** 2
- **Files modified:** 1 (0 created, 1 modified)

## Accomplishments
- `createCustomerAction` (D-07) — keeps all existing validation (name required, E.164 phone normalization, phone-or-email rule, date parse). Now creates the customer WITHOUT a `lastAppointmentAt` field; when a valid last-visit date was provided, it captures the new customer id, `prisma.appointment.create({ source: "manual", service: null, date })`, then `recomputeLastAppointment(customer.id, business.id)`. No date provided → no appointment row, cache stays null. The `{ successAt }` return and `revalidatePath("/customers")` are unchanged.
- `importCustomersAction` (D-07) — keeps the server re-parse (`parseCustomersCsv`), the fatal check, the valid-row filter, and the `{ imported, skipped, successAt }` return. Switched from `createMany` (which returns no ids) to a per-row `prisma.customer.create` so each new customer id is captured and a row that carried a `last_appointment_at` maps to exactly one seed `Appointment(source: "csv", service: null)` — no fragile re-fetch and no cross-row collision. Distinct affected customer ids are collected into a `Set`; `recomputeLastAppointment` runs ONCE per distinct id after the inserts, never per row (RESEARCH Pitfall 1).
- Both edited paths now call the single shared `recomputeLastAppointment` helper, completing the all-five-paths invariant: manual add, manual delete, appointments-CSV import (01-04), customer create (this plan), customer import (this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1-03-01: createCustomerAction seeds a backing appointment (D-07)** — `c5f72a2` (feat)
2. **Task 1-03-02: importCustomersAction seeds backing appointments + single recompute pass (D-07)** — `1b0dfa2` (feat)

## Files Created/Modified
- `app/(app)/customers/actions.ts` (modified) — imported `recomputeLastAppointment` from `@/lib/appointments`; rewrote the `createCustomerAction` create block (seed manual appointment + recompute when a date is provided) and the `importCustomersAction` bulk block (per-row create capturing ids, seed csv appointments, one recompute per distinct affected customer). `deleteCustomerAction` and the form-state types are untouched; `rebooking.ts`/`send-message.ts` untouched.

## Verification Results

- `npx tsc --noEmit` → 0 errors (full project, after each task and a final sweep).
- `npx eslint "app/(app)/customers/actions.ts"` → 0 errors after each task.
- Acceptance grep: `lastAppointmentAt` is absent from both `customer.create`/`createMany` data blocks — it now appears only as the parsed local value, the seed-appointment `date`, and comments. `prisma.appointment.create` with `source: "manual"` / `"csv"` is present on the respective seed paths, each followed by `recomputeLastAppointment`.
- Threat-model dispositions implemented: T-03-01 (`requireCurrentBusiness()` retained at the top of both actions), T-03-02 (every `appointment.create` uses `businessId: business.id` + a customerId created within this business in the same action), T-03-03 (server re-parse via `parseCustomersCsv` with per-row validation + E.164 normalization before any insert; invalid rows excluded), T-03-04 (both paths call the single `recomputeLastAppointment`; bulk recomputes once per distinct customer — Pitfall 1). T-03-SC: no packages installed (N/A).
- No test suite exists in this repo (CLAUDE.md), so the `<behavior>` tables are verified by the manual "Try it out" checklist below plus the cache-invariant SQL; automated gates were tsc + eslint per the plan's `<verify>` blocks.

## Decisions Made
See key-decisions in frontmatter. In short: seed-then-derive on both paths (no direct `lastAppointmentAt` write, no orphan possible); per-row create in the import to capture ids reliably (chosen over a phone/email re-fetch that could collide across rows), with a single recompute pass per distinct affected customer; APPT-02 still partial — only the dedicated appointments-CSV import (01-04) remains.

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented per the `<action>` blocks and PATTERNS.md / RESEARCH excerpts; all threat-model `mitigate` dispositions present. 0 auto-fixes.

**TDD note:** Both tasks are tagged `tdd="true"`, but this repo has no test suite or test infrastructure (CLAUDE.md: "there's no test suite yet") and the plan's `<verify>` blocks specify only `tsc` + `eslint` with no test command — matching how Plan 01-02 was executed. The actions were implemented and verified against those gates plus the manual behavior checklist and the cache-invariant SQL; no RED/GREEN test commits were created because there is no harness to run them. The behavior contract (seed-then-recompute, no direct cache write, single recompute pass per distinct customer, business scoping) is fully encoded in the implementation and asserted by the verification checklist.

## Known Stubs
None. No hardcoded empty data, placeholder copy, or unwired components — both actions perform real customer + appointment inserts and a real cache recompute against live scoped data.

## Try it out (manual checklist)
1. **Add customer WITH a last visit:** `/customers` → Add customer → fill name + phone/email + a Last appointment date → save. In Supabase, that customer has exactly ONE `appointments` row with `source='manual'`, and `customers.last_appointment_at` equals the date you entered (derived, not written directly).
2. **Add customer WITHOUT a last visit:** add a customer leaving the date blank → no `appointments` row is created and `last_appointment_at` stays NULL.
3. **Import a CSV with some last_appointment_at values:** upload a customers CSV where a few rows have `last_appointment_at` → import reports `{ imported, skipped }` as before; each such customer gets ONE `appointments` row with `source='csv'` and its `last_appointment_at` equals its seed date; rows without a value get no appointment and a NULL cache.
4. **Invariant (Supabase):** run the APPT-03 cache-invariant query — it returns 0 rows after both a create and an import:
   ```sql
   SELECT c.id FROM customers c
   LEFT JOIN (SELECT customer_id, MAX(date) AS max_date FROM appointments GROUP BY customer_id) a
     ON a.customer_id = c.id
   WHERE c.last_appointment_at IS DISTINCT FROM a.max_date;
   ```
5. **Regression:** the existing customer-CSV import still skips invalid rows (bad phone/date) and the skipped count is unchanged; `rebooking.ts` is untouched and reads the same maintained cache.

## Self-Check: PASSED

- File verified present: `app/(app)/customers/actions.ts` (modified), `01-03-SUMMARY.md`.
- Commits verified in git history: `c5f72a2`, `1b0dfa2`.
- Acceptance verified: `lastAppointmentAt` absent from both customer-insert data blocks; `appointment.create` with `source` "manual"/"csv" + `recomputeLastAppointment` present on the seed paths.

---
*Phase: 01-appointment-history-foundation*
*Completed: 2026-06-06*
