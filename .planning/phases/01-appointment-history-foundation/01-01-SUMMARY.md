---
phase: 01-appointment-history-foundation
plan: 01
subsystem: database
tags: [prisma, postgres, supabase, migration, appointments, cache-invariant]

# Dependency graph
requires: []
provides:
  - "appointments table (Appointment model) — per-visit history: date, optional service, optional source, scoped by business + customer, Cascade FKs, @@index([customerId, date])"
  - "Applied + backfilled migration establishing the D-04 cache invariant (lastAppointmentAt == MAX(appointment.date)) from day one"
  - "lib/appointments.ts recomputeLastAppointment(customerId, businessId) — the single ownership-safe helper all five mutation paths must call to re-derive the cache"
affects: [predictive-rebooking, win-back, appointment-csv-import, customer-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cascade FKs for owned history (appointments ARE the customer's history) — deliberately differs from the SetNull log convention used by Message/Feedback"
    - "Single shared cache-recompute helper using updateMany with businessId in the where (ownership re-check, mirrors deleteCustomerAction) — never singular update"
    - "Create-only-then-edit migration sequence so the D-06 backfill ships in the SAME migration as the CreateTable"

key-files:
  created:
    - prisma/migrations/20260605030803_add_appointment_model/migration.sql
    - lib/appointments.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Appointment.customerId is NON-NULL with onDelete: Cascade (D-01) — appointments are meaningless without their customer; differs from the nullable SetNull log models"
  - "D-06 backfill ships in the same migration via an appended INSERT…SELECT guarded by WHERE last_appointment_at IS NOT NULL, so the D-04 cache invariant holds from day one"
  - "lastAppointmentAt is preserved as a derived cache (D-04), not removed — rebooking.ts (D-05) keeps reading it unchanged"
  - "Worktree isolation disabled for this phase because .env.local (DB creds) is gitignored and absent in worktrees; migration apply was a human-gated blocking checkpoint"

patterns-established:
  - "Owned-history Cascade FK pattern: Appointment cascades from both Business and Customer (vs SetNull logs)"
  - "Cache-invariant helper pattern: one recomputeLastAppointment serving all mutation paths; bulk callers recompute once per distinct customerId after a batch (Pitfall 1)"

requirements-completed: [APPT-01, APPT-03]

# Metrics
duration: ~25min
completed: 2026-06-06
---

# Phase 01 Plan 01: Appointment History Foundation Summary

**Real `Appointment` history model behind `Customer.lastAppointmentAt`, applied + backfilled in one migration so the D-04 cache invariant holds from day one, plus the single ownership-safe `recomputeLastAppointment` helper all mutation paths share.**

## Performance

- **Duration:** ~25 min (implementation) + human-gated migration apply
- **Completed:** 2026-06-06
- **Tasks:** 3
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- `Appointment` model added to the schema with Cascade FKs from both Business and Customer, a `@@index([businessId])`, and the `@@index([customerId, date])` composite index that serves both newest-visit-per-customer and the rebooking range query.
- One migration (`20260605030803_add_appointment_model`) creates the `appointments` table AND backfills legacy rows in the same file, so the D-04 cache invariant (`lastAppointmentAt == MAX(appointment.date)`) is true the moment the migration lands.
- Migration applied cleanly to the live Supabase DB (no drift/reset prompt); Prisma client regenerated to expose `prisma.appointment`.
- `lib/appointments.ts` exports `recomputeLastAppointment(customerId, businessId)` — the single, ownership-safe (`updateMany` with `businessId` in the `where`) helper every future mutation path will call so the cache can never drift.
- `Customer.lastAppointmentAt` preserved as the derived cache; `lib/automations/rebooking.ts` (D-05) untouched and keeps firing off the now-backfilled cache.

## Task Commits

Each task was committed atomically:

1. **Task 1-01-01: Add Appointment model + back-relations to schema** - `3d78c95` (feat)
2. **Task 1-01-02: Generate migration + append D-06 backfill SQL + apply** - `0e2c5b2` (feat)
3. **Task 1-01-03: Create recomputeLastAppointment shared cache helper** - `55f5c83` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added `model Appointment` (`@@map("appointments")`, Cascade FKs, composite index) plus `appointments Appointment[]` back-relations on `Customer` and `Business`; `lastAppointmentAt` preserved.
- `prisma/migrations/20260605030803_add_appointment_model/migration.sql` - `CREATE TABLE "appointments"` + both indexes + two `ON DELETE CASCADE` FKs, with the appended D-06 `INSERT … SELECT … FROM "customers" c WHERE c."last_appointment_at" IS NOT NULL` backfill.
- `lib/appointments.ts` - `recomputeLastAppointment(customerId, businessId)`: `findFirst` newest appointment scoped by both ids, then `prisma.customer.updateMany` (ownership re-check) setting the cache to `latest?.date ?? null`.

## Verification Results

- `npx tsc --noEmit` → 0 errors (generated client includes `prisma.appointment`).
- `npx eslint lib/appointments.ts` → 0 errors.
- `npx prisma format` → schema validates.
- Migration **applied** to the live Supabase DB via `npm run db:migrate -- --name add_appointment_model` — applied cleanly, no drift prompt, Prisma client regenerated.
- `appointments` table exists with the D-02 columns + both indexes.
- **Backfill assertion = 0:** 5 customers total; 0 had a non-null `last_appointment_at`, so the WHERE-guarded backfill inserted 0 rows — correct, nothing to seed yet, and the invariant holds.
- **D-04 global cache-invariant SQL = 0 violations.**

## Decisions Made
See key-decisions in frontmatter. In short: non-null Cascade `customerId` (owned history, not a log); D-06 backfill in the same migration; `lastAppointmentAt` kept as derived cache; one shared `updateMany`-based recompute helper.

## Deviations from Plan

### Process Deviation (not an auto-fix)

**1. Worktree isolation disabled for the phase; migration apply was a human-gated checkpoint**
- **Found during:** Phase setup / Task 1-01-02
- **Issue:** Worktree isolation could not be used because `.env.local` (the Supabase DB credentials) is gitignored and therefore absent in a fresh worktree, so `npm run db:migrate` (which loads creds via `dotenv -e .env.local`) would target the wrong/empty DB. Plan 01-01 is also explicitly `autonomous: false` — the migrate step is a `checkpoint:human-action gate="blocking"`.
- **Resolution:** The phase ran on the main working tree (sequential mode). The migration was applied by the orchestrator with explicit user approval at the blocking checkpoint, against the correct Supabase DB (Pitfall 2 mitigation, threat T-01-03). Post-apply verification confirmed table + indexes, backfill assertion = 0, and cache-invariant = 0 before proceeding.

**Note on the backfill row count:** the D-06 backfill inserted **0 rows** because no legacy customer had a non-null `last_appointment_at` yet. This is correct behavior — the `WHERE … IS NOT NULL` guard simply found nothing to seed — and the D-04 invariant still holds (every customer's cache equals MAX(appointment.date), which is NULL when none).

---

**Total deviations:** 0 code auto-fixes; 1 documented process deviation (worktree disabled + human-gated migration apply).
**Impact on plan:** None. Plan executed exactly as written; the deviation is environmental (creds isolation), not a code change.

## Issues Encountered
None — the migration applied cleanly with no shadow-DB/drift/reset prompt, and `gen_random_uuid()` was available (no fallback to `uuid_generate_v4()` needed, A1/T-01-04 mitigation satisfied).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The shared foundation is in place: `appointments` table (migrated + backfilled), `recomputeLastAppointment` helper, and the preserved `lastAppointmentAt` cache.
- Wave 2 plans (01-02 customer detail page + manual add/delete; 01-03 customer create/import seeding a backing appointment) can now build on the table and call the helper.
- No blockers. Reminder for downstream plans: every mutation path that adds/removes appointments must call `recomputeLastAppointment` (bulk paths once per distinct customerId after the batch) so the cache never drifts.

## Self-Check: PASSED

- Files verified present: `01-01-SUMMARY.md`, `prisma/schema.prisma`, `lib/appointments.ts`, `prisma/migrations/20260605030803_add_appointment_model/migration.sql`.
- Commits verified in git history: `3d78c95`, `0e2c5b2`, `55f5c83`.

---
*Phase: 01-appointment-history-foundation*
*Completed: 2026-06-06*
