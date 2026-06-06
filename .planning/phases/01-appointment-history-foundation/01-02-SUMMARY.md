---
phase: 01-appointment-history-foundation
plan: 02
subsystem: customer-detail-page
tags: [next16, rsc, server-actions, appointments, scoping, dedup]

# Dependency graph
requires:
  - "01-01 — Appointment model + recomputeLastAppointment(customerId, businessId) helper + lastAppointmentAt cache"
provides:
  - "/customers/[id] scoped RSC detail page: header (name/phone/email/derived last visit) + newest-first visit timeline"
  - "addAppointmentAction + deleteAppointmentAction (ownership-gated, D-13 dedup, recompute the D-04 cache on every mutation)"
  - "Customers table name cell links to the detail page (D-11); row actions + derived Last-appointment column intact"
affects: [appointment-csv-import, predictive-rebooking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js 16 dynamic route: async params typed `Promise<{ id: string }>`, awaited; scoped `findFirst({ where: { id, businessId } })` → notFound() for cross-business isolation (vs findUnique-by-id)"
    - "Midnight-UTC date normalization on insert so same-day D-13 dedup is byte-clean against `<input type=\"date\">` values; same-date DIFFERENT-service is a distinct row"
    - "Per-row delete control mirrors CustomerRowActions (AlertDialog + `<form action={deleteAppointmentAction}>` with hidden id + customerId)"
    - "Name cell wrapped in next/link, actions cell left outside the link so the dropdown never navigates"

key-files:
  created:
    - app/(app)/customers/[id]/actions.ts
    - app/(app)/customers/[id]/page.tsx
    - app/(app)/customers/[id]/visit-history.tsx
    - app/(app)/customers/[id]/add-visit-dialog.tsx
  modified:
    - app/(app)/customers/customers-table.tsx

key-decisions:
  - "Dates normalized to midnight UTC on insert (Open-Q1) so D-13 dedup compares byte-clean calendar days"
  - "Detail fetch uses findFirst scoped by businessId → notFound() (T-02-01); delete uses deleteMany scoped by businessId (T-02-02) — a foreign id reads/deletes nothing"
  - "addAppointmentAction verifies customer ownership BEFORE insert (T-02-03) and writes source='manual'"
  - "APPT-02 only partially complete here (manual add/delete); CSV import (Plan 01-04) completes it"

patterns-established:
  - "Scoped Next.js 16 dynamic-route RSC: async params + requireCurrentBusiness + findFirst-by-(id,businessId) + notFound()"
  - "Mutation action template: requireCurrentBusiness → ownership gate → validate → mutate → recomputeLastAppointment → revalidatePath(detail + list)"

requirements-completed: []
requirements-advanced: [APPT-02]

# Metrics
duration: ~7min
completed: 2026-06-06
---

# Phase 01 Plan 02: Customer Detail Page + Manual Add/Delete Visit Summary

**The first user-facing vertical slice: an owner can open `/customers/[id]`, see a scoped newest-first visit timeline, and add/delete individual visits — every mutation re-derives the `lastAppointmentAt` cache (D-04) and every read/write is scoped to their business.**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-06-06
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `addAppointmentAction` / `deleteAppointmentAction` — both gate on `requireCurrentBusiness()`, scope every query by `business.id`, and call `recomputeLastAppointment(customerId, business.id)` so the cache can never drift. Add verifies customer ownership before inserting (`source: "manual"`), normalizes the date to midnight UTC, and rejects an exact same-date+same-service dupe (D-13). Delete uses `deleteMany` (D-12) so a crafted foreign id matches 0 rows; recompute may set the cache to null.
- `/customers/[id]` detail page — Next.js 16 RSC with async `params: Promise<{ id: string }>`, scoped `findFirst({ where: { id, businessId }, include: { appointments: { orderBy: { date: "desc" } } } })` → `notFound()` on miss (cross-business isolation, T-02-01). Renders a header (name / phone / email / derived last visit) plus the visits timeline and the "Add visit" trigger.
- `visit-history.tsx` (client) — newest-first table of visits (formatted date + service ?? "—"), each row with an AlertDialog-gated delete submitting `deleteAppointmentAction` with hidden `id` + `customerId`; "No visits recorded yet" empty state.
- `add-visit-dialog.tsx` (client) — mirrors `AddCustomerDialog`: `useActionState(addAppointmentAction, {})`, success-snapshot close, form-reset-on-close; hidden `customerId`, required `date` input, optional `service`, `role="alert"` error.
- `customers-table.tsx` (edit) — name cell wrapped in `next/link` → `/customers/[id]`; the actions cell stays outside the link so the dropdown (send/delete) never navigates; the derived Last-appointment column is unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1-02-01: Add/delete appointment Server Actions (scoped, recompute, dedup)** — `60dd864` (feat)
2. **Task 1-02-02: Detail page RSC + visit timeline + add/delete UI** — `89ed3f5` (feat)
3. **Task 1-02-03: Make customers table rows link to the detail page** — `04bb5f2` (feat)

## Files Created/Modified
- `app/(app)/customers/[id]/actions.ts` (created) — `AppointmentFormState`, `addAppointmentAction`, `deleteAppointmentAction`; `toMidnightUtc` helper; ownership gates + D-13 dedup + recompute on both paths.
- `app/(app)/customers/[id]/page.tsx` (created) — scoped RSC detail page (async params, header, Visits card).
- `app/(app)/customers/[id]/visit-history.tsx` (created) — client timeline with per-row AlertDialog delete + empty state.
- `app/(app)/customers/[id]/add-visit-dialog.tsx` (created) — client add-visit dialog.
- `app/(app)/customers/customers-table.tsx` (modified) — name cell links to detail page; actions cell untouched; derived column intact.

## Verification Results

- `npx tsc --noEmit` → 0 errors (full project, after each task and final sweep).
- `npx eslint` → 0 errors on all five changed files.
- Threat-model dispositions implemented: T-02-01 (scoped findFirst → notFound), T-02-02 (deleteMany scoped by businessId), T-02-03 (ownership gate before insert), T-02-04 (requireCurrentBusiness inside each action), T-02-05 (D-13 dedup + midnight-normalized date). T-02-SC: no packages installed (N/A).
- `prisma.appointment.delete(` / `prisma.customer.findUnique(` by id-alone — absent from the new code (deleteMany / findFirst used throughout).
- No test suite exists in this repo (CLAUDE.md), so the behavior table is verified by the manual "Try it out" checklist below; automated gates were tsc + eslint per the plan's `<verify>` blocks.

## Decisions Made
See key-decisions in frontmatter. In short: midnight-UTC date normalization for byte-clean D-13 dedup; `findFirst`/`deleteMany` scoped by `businessId` for cross-business isolation; ownership-gate-before-insert with `source: "manual"`; APPT-02 only partially complete here (manual half) — CSV import in Plan 01-04 closes it.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1-02-01/02/03 implemented per the `<action>` blocks and PATTERNS.md excerpts; all threat-model `mitigate` dispositions present. 0 auto-fixes.

**TDD note:** Task 1-02-01 is tagged `tdd="true"`, but this repo has no test suite or test infrastructure (CLAUDE.md: "there's no test suite yet") and the plan's `<verify>` block specifies only `tsc` + `eslint` with no test command. The action was implemented and verified against those gates plus the manual behavior checklist; no RED/GREEN test commits were created because there is no harness to run them. The behavior contract (ownership gate, D-13 dedup, recompute, deleteMany scoping) is fully encoded in the implementation and asserted by the verification checklist.

## Known Stubs
None. No hardcoded empty data, placeholder copy, or unwired components — the detail page reads live scoped data and both actions perform real mutations + cache recompute.

## Try it out (manual checklist)
1. **View timeline:** open `/customers` → click a customer name → lands on `/customers/[id]` with header (name/phone/email/last visit) and a newest-first Visits list (or "No visits recorded yet").
2. **Add a visit:** click "Add visit", pick a date (+ optional service), submit → the dialog closes and the row appears newest-first; the header's "Last visit" updates if it's the newest.
3. **Dedup (D-13):** add the exact same date + same service again → "That visit is already recorded."; add the same date with a DIFFERENT service → a second row is created.
4. **Delete + recompute:** delete the only/newest visit → the row disappears and the header "Last visit" recomputes to the next-newest (or "—" / Supabase `customers.last_appointment_at` = NULL when none remain).
5. **Isolation (Supabase):** confirm `select * from appointments where customer_id = '<id>'` only shows your business's rows; opening another business's customer id in the URL returns 404; the customers-table row dropdown (Send/Delete) still opens without navigating.

## Self-Check: PASSED

- Files verified present: `app/(app)/customers/[id]/actions.ts`, `app/(app)/customers/[id]/page.tsx`, `app/(app)/customers/[id]/visit-history.tsx`, `app/(app)/customers/[id]/add-visit-dialog.tsx`, `app/(app)/customers/customers-table.tsx` (modified), `01-02-SUMMARY.md`.
- Commits verified in git history: `60dd864`, `89ed3f5`, `04bb5f2`.

---
*Phase: 01-appointment-history-foundation*
*Completed: 2026-06-06*
