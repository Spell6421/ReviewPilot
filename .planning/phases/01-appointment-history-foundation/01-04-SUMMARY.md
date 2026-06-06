---
phase: 01-appointment-history-foundation
plan: 04
subsystem: appointments-csv-import
tags: [next16, server-actions, csv, appointments, phone-match, auto-create, dedup, derived-cache, scoping]

# Dependency graph
requires:
  - "01-01 — Appointment model + recomputeLastAppointment(customerId, businessId) helper + lastAppointmentAt cache"
  - "01-02 — customer detail page + actions.ts (AppointmentFormState, toMidnightUtc, dedup pattern) to extend"
provides:
  - "parseAppointmentsCsv — dedicated one-row-per-visit CSV parser (name+phone+date required; service/source optional), bad rows surfaced (D-08)"
  - "importAppointmentsAction — server re-parse, exact-E.164 phone match-or-auto-create (D-09), customer+date+service dedup (D-10/D-13), one recompute per distinct affected customer"
  - "ImportAppointmentsDialog — client preview dialog (Row/Name/Phone/Date/Service/Status) wired into the customer detail page"
  - "lib/fixtures/appointments.sample.csv — manual-validation fixture (multi-visit, bad date, bad phone, exact dupe, same-day different-service)"
affects: [predictive-rebooking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated CSV parser mirrors lib/csv-import.ts (HEADER_ALIASES, normalizeHeader, Papa.parse header:true/skipEmptyLines greedy, rowNumber=i+2, retain bad rows with errors) — D-08, NOT an overload of the customer CSV"
    - "Phone-match-or-auto-create: server re-parse → exact E.164 string match scoped by businessId (same key as inbound-reply matching, Pitfall 3) → else customer.create (D-09); a per-import phone→id Map dedups repeated-phone rows so multi-visit rows don't re-query or double-create"
    - "Bulk dedup + single recompute: midnight-UTC normalized date, skip same customer+date+service (D-10/D-13) and report the count; recompute ONCE per distinct affected customer (Pitfall 1)"

key-files:
  created:
    - lib/appointments-csv.ts
    - app/(app)/customers/[id]/import-appointments-dialog.tsx
    - lib/fixtures/appointments.sample.csv
  modified:
    - app/(app)/customers/[id]/actions.ts
    - app/(app)/customers/[id]/page.tsx

key-decisions:
  - "Dedicated appointments parser/dialog (D-08), mirroring the customer CSV stack rather than overloading it; phone is REQUIRED here (the match/auto-create key) unlike the customer CSV's phone-OR-email rule"
  - "Unmatched phone auto-creates the customer from name+phone (D-09, email null); matched phone attaches the visit — both scoped by business.id, auto-created customer owned by the current business"
  - "Re-import is idempotent via customer+date+service dedup on a midnight-UTC date (D-10/D-13); a same-day DIFFERENT-service row is a distinct visit and inserts; skips are counted and reported, never silently dropped"
  - "A per-import phone→customerId Map avoids re-querying / double-auto-creating for repeated-phone (multi-visit) rows within one file"

patterns-established:
  - "CSV bulk path on the appointment history: parse → server re-parse → per-row match/auto-create + dedup'd insert scoped by business.id → one recomputeLastAppointment per distinct affected customer; the D-04 invariant holds across the bulk path"

requirements-completed: [APPT-02]
requirements-advanced: [APPT-03]

# Metrics
duration: ~2min
completed: 2026-06-06
---

# Phase 01 Plan 04: Appointments-CSV Import Summary

**The second user-facing vertical slice: an owner can bulk-seed visit history from a dedicated one-row-per-visit CSV — preview surfaces bad rows (not dropped), each row matches an existing customer by exact E.164 phone or auto-creates one (D-09), re-import is idempotent via customer+date+service dedup (D-10/D-13), and each affected customer's derived last-visit cache recomputes once (D-04). APPT-02 (manual + CSV) is now fully satisfied.**

## Performance

- **Duration:** ~2 min
- **Completed:** 2026-06-06
- **Tasks:** 3
- **Files:** 5 (3 created, 2 modified)

## Accomplishments
- **`lib/appointments-csv.ts` (new, D-08)** — `parseAppointmentsCsv(text)` mirrors `lib/csv-import.ts` exactly: `HEADER_ALIASES` collapsing name/phone/date/service/source spellings, `normalizeHeader`, `Papa.parse({ header: true, skipEmptyLines: "greedy", transformHeader })`, `rowNumber = i + 2`. Fatal if the `name`, `phone`, OR `date` canonical column is missing, or zero rows. Per row: trim name (`Missing name`); `normalizePhone` (imported verbatim from `@/lib/phone`, not re-implemented) with `Invalid phone number` for a provided-but-unparseable number and `Missing phone` when absent — phone is REQUIRED here because it's the match/auto-create key (unlike the customer CSV's phone-OR-email); `new Date(raw)` + `Number.isNaN(getTime())` → `Invalid date`, `Missing date` when absent; service/source trimmed-or-null. Bad rows are RETAINED in `rows` with populated `errors` (surfaced, not dropped). Exports `ParsedAppointmentRow`, `AppointmentParseResult`, `parseAppointmentsCsv`.
- **`lib/fixtures/appointments.sample.csv` (new)** — header `name,phone,date,service` with rows exercising the Wave-0 spec: a customer with multiple visits (repeated phone), a same-day-but-different-service row (distinct visit), an exact duplicate of an earlier row (skipped on import), a bad-date row, a bad-phone row, and a single clean valid row.
- **`importAppointmentsAction` (extends `app/(app)/customers/[id]/actions.ts`)** — `requireCurrentBusiness()` (T-04-01); reads the uploaded `file` (`{ error }` if missing/empty); `parseAppointmentsCsv(await file.text())`; returns `parsed.fatal` as an error; filters zero-error rows (`{ error: "No valid rows to import." }` if none). Per valid row: the parser already guaranteed an E.164 `row.phone`; `prisma.customer.findFirst({ where: { businessId, phone } })` (exact-string match, Pitfall 3) → else `prisma.customer.create` auto-create from name+phone, email null (D-09); a per-import `phone → customerId` Map prevents re-query/double-create on repeated-phone rows. Date normalized via the existing `toMidnightUtc`; D-10/D-13 dedup skips `findFirst({ customerId, businessId, date, service })` matches (skip counter, reported), otherwise `appointment.create({ businessId, customerId, date, service, source: row.source ?? "csv" })`. Distinct affected customer ids → `recomputeLastAppointment` ONCE each (Pitfall 1) + `revalidatePath` per detail page and `/customers`. Returns `{ imported, skipped, successAt }`.
- **`ImportAppointmentsDialog` (new, `"use client"`)** — mirrors `import-customers-dialog.tsx`: `useActionState(importAppointmentsAction, {})`, success-snapshot close, clear-preview-on-close + reset-form-on-close effects, `handleFileChange` running a client `parseAppointmentsCsv` dry-run into `AppointmentParseResult | null`, a `PreviewTable` with columns Row / Name / Phone / Date / Service / Status surfacing each row's `errors` (bad rows visible — SC#2), and `canImport = preview && !preview.fatal && preview.validCount > 0` gating submit. `DialogDescription` documents the `name, phone, date, service` columns (one row per visit).
- **Detail page wiring (`page.tsx`)** — mounts `<ImportAppointmentsDialog />` beside the existing "Add visit" trigger in a flex group in the header; the dialog posts to the business-scoped action, so no extra props are needed.

## Task Commits

Each task was committed atomically:

1. **Task 1-04-01: parseAppointmentsCsv parser + sample fixture** — `6cf8616` (feat)
2. **Task 1-04-02: importAppointmentsAction (match/auto-create, dedup, recompute)** — `517d9c4` (feat)
3. **Task 1-04-03: import-appointments dialog + wire trigger into detail page** — `b6c47c3` (feat)

## Files Created/Modified
- `lib/appointments-csv.ts` (created) — dedicated appointments-CSV parser.
- `lib/fixtures/appointments.sample.csv` (created) — manual-validation fixture.
- `app/(app)/customers/[id]/import-appointments-dialog.tsx` (created) — client preview/import dialog.
- `app/(app)/customers/[id]/actions.ts` (modified) — added `parseAppointmentsCsv` import, `ImportAppointmentsFormState`, and `importAppointmentsAction`; `addAppointmentAction`/`deleteAppointmentAction`/`toMidnightUtc` untouched.
- `app/(app)/customers/[id]/page.tsx` (modified) — imported and mounted `<ImportAppointmentsDialog />` next to "Add visit".
- `rebooking.ts` / `send-message.ts` — untouched (per success criteria).

## Verification Results

- `npx tsc --noEmit` → 0 errors (full project, after each task and a final sweep).
- `npx eslint` → 0 errors on all four changed code files (per-task and a final combined sweep).
- Threat-model `mitigate` dispositions implemented: **T-04-01** (`requireCurrentBusiness()` at the top of the action — auth in the action, not the UI), **T-04-02** (authoritative SERVER re-parse via `parseAppointmentsCsv`; only zero-error rows inserted; bad rows surfaced; service stored as plain text, React-escaped on render), **T-04-03** (every `customer.findFirst` / `customer.create` / `appointment.create` scoped by `businessId: business.id`; auto-created customer owned by the current business), **T-04-04** (match on the parser's verbatim `normalizePhone` E.164 — exact string, same as inbound-reply — Pitfall 3), **T-04-05** (D-10/D-13 dedup on midnight-UTC `customer+date+service`, skips reported), **T-04-06** (one `recomputeLastAppointment` per distinct affected customer — Pitfall 1). **T-04-SC:** no packages installed (papaparse already pinned) — N/A.
- No test suite exists in this repo (CLAUDE.md), so the `<behavior>` tables are verified by the manual "Try it out" checklist below plus the cache-invariant SQL; automated gates were tsc + eslint per the plan's `<verify>` blocks.

## Decisions Made
See key-decisions in frontmatter. In short: a dedicated parser/dialog (D-08, not an overload); phone is required as the match/auto-create key; unmatched phone auto-creates the customer (D-09); idempotent re-import via midnight-UTC customer+date+service dedup with reported skips (D-10/D-13); a per-import phone→id Map to avoid re-query/double-create on multi-visit rows; one recompute per distinct affected customer. **APPT-02 is now fully complete** (manual add/delete from 01-02, customer-flow seeding from 01-03, and this dedicated appointments-CSV import).

## Deviations from Plan

None — plan executed exactly as written. All three tasks implemented per their `<action>` blocks and the mirrored analog files; every threat-model `mitigate` disposition is present. 0 auto-fixes.

**Minor implementation choice (within scope, not a deviation):** added a per-import `phone → customerId` Map so repeated-phone (multi-visit) rows in one file don't re-query the DB or risk a double auto-create. This is a correctness/consistency refinement of the specified flow (find-or-create per row), not a structural change.

**TDD note:** Tasks 1 and 2 are tagged `tdd="true"`, but this repo has no test suite or test infrastructure (CLAUDE.md: "there's no test suite yet"), `tdd_mode` is `false` in `.planning/config.json`, and the plan's `<verify>` blocks specify only `tsc` + `eslint` with no test command — matching how Plans 01-02 and 01-03 were executed. No RED/GREEN test commits were created because there is no harness to run them; the behavior contract is encoded in the implementation and asserted by the verification checklist plus the cache-invariant SQL.

## Known Stubs
None. No hardcoded empty data, placeholder copy, or unwired components — the parser, action, and dialog operate on real uploaded CSV content and perform real scoped customer/appointment inserts and a real cache recompute. The sample CSV is an intentional manual-validation fixture, not a stub.

## Try it out (manual checklist)
1. **Import the fixture:** open a customer's detail page → **Import CSV** → choose `lib/fixtures/appointments.sample.csv`. The preview lists every row; the bad-date and bad-phone rows show their errors in red and are excluded from the import count (SC#2). Click Import.
2. **Verify inserts + auto-create (Supabase):** the multi-visit customer (repeated phone) has multiple `appointments` rows; the same-day different-service row is its own row; the exact-duplicate row was skipped. Any phone with no existing customer was **auto-created** (D-09) — a new `customers` row owned by your business with `email` NULL.
3. **Idempotent re-import (D-10/D-13):** Import the same file again → the result reports all valid rows skipped, and the `appointments` count is unchanged.
4. **Cache invariant (APPT-03 / D-04):** run the invariant query — it returns 0 rows after import, i.e. every customer's `last_appointment_at` equals MAX of their visit dates:
   ```sql
   SELECT c.id FROM customers c
   LEFT JOIN (SELECT customer_id, MAX(date) AS max_date FROM appointments GROUP BY customer_id) a
     ON a.customer_id = c.id
   WHERE c.last_appointment_at IS DISTINCT FROM a.max_date;
   ```
5. **Cross-business scoping (SC#4):** the import only ever reads/creates/inserts under your `business.id`; auto-created customers belong to your business — no rows leak across businesses.

## Self-Check: PASSED

- Files verified present: `lib/appointments-csv.ts`, `lib/fixtures/appointments.sample.csv`, `app/(app)/customers/[id]/import-appointments-dialog.tsx` (created); `app/(app)/customers/[id]/actions.ts`, `app/(app)/customers/[id]/page.tsx` (modified); `01-04-SUMMARY.md`.
- Commits verified in git history: `6cf8616`, `517d9c4`, `b6c47c3`.
- Acceptance verified: parser imports `normalizePhone` (no inline phone regex) and retains bad rows with errors; action calls `requireCurrentBusiness()` and scopes every match/create/insert by `business.id`, auto-creates on unmatched phone, dedups customer+date+service, recomputes once per distinct customer; dialog is `"use client"`, runs a client `parseAppointmentsCsv` dry-run, renders per-row errors, gates submit on `!fatal && validCount > 0`; page mounts the dialog. tsc + eslint exit 0.

---
*Phase: 01-appointment-history-foundation*
*Completed: 2026-06-06*
