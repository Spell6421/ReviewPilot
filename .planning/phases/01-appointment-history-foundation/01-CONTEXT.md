# Phase 1: Appointment History Foundation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the single `Customer.lastAppointmentAt` field with a real per-visit
`Appointment` model, and give owners ways to populate and view that history.
This phase delivers:

1. An `Appointment` data model (date, optional service, optional source), scoped
   by business, with each appointment belonging to a `Customer`.
2. A `/customers/[id]` detail page showing a customer's visit history, plus
   manual add/delete of individual visits.
3. A separate **appointments CSV** import (one row per visit) with preview and
   bad-row surfacing.
4. Continuity: `Customer.lastAppointmentAt` is preserved as a derived cache so the
   existing rebooking/win-back automation keeps working unchanged; existing
   customers are backfilled with a seed appointment.

**Covers requirements:** APPT-01, APPT-02, APPT-03 (+ business-scoping per
Success Criteria #4).

**NOT in this phase (belongs to later phases — do not build):**
- Per-customer cadence learning / predictive interval math → **Phase 2 (REBK)**.
- Staged win-back sequencing → **Phase 3 (WINB)**.
- Real booking/phone integrations that auto-populate appointments → future
  milestone (data is seeded manually/CSV now and coded against as if it arrives
  automatically).
- A services catalog / structured service picker, in-text sentiment, inbox,
  analytics, billing.

</domain>

<decisions>
## Implementation Decisions

### Data model — Appointment
- **D-01:** Add a new `Appointment` model. Each row belongs to one `Customer`
  (and therefore one `Business`); scope every read/write by `business.id`, never
  let an appointment leak across businesses (Success Criteria #4). Cascade-delete
  with the customer is acceptable (history is meaningless without the customer),
  but confirm against the `Message`/`Feedback` `SetNull` convention during
  planning — those keep logs after row deletion; appointments are different (they
  ARE the customer's history).
- **D-02:** Fields: `date` stored as `Timestamptz(6)` (consistent with
  `lastAppointmentAt` / other timestamps); `service` optional free-text string
  (NOT a structured catalog — that would be its own scope); `source` a **nullable
  string** seeded with `manual` / `csv` / `backfill`, left as a plain string so a
  future integration can write its own provider name (`square`, `glossgenius`, …)
  without a schema migration. Add an index supporting "newest visit per customer"
  and the rebooking range query (e.g. `(customerId, date)`).
- **D-03:** Date granularity — capture/store a full timestamp, but the UI only
  needs a date input (time optional). Cadence math in Phase 2 works off the date.

### last-visit derivation & existing data (APPT-03)
- **D-04:** Keep `Customer.lastAppointmentAt` as a **derived cache**, not a
  user-entered field. Invariant: `lastAppointmentAt == MAX(appointment.date)` for
  that customer (null when no appointments). Recompute it on **every** path that
  mutates appointments: manual add, manual delete, appointments-CSV import, and
  the customer-CSV / add-customer last-visit field.
- **D-05:** `rebooking.ts` stays essentially unchanged — it keeps querying
  `Customer.lastAppointmentAt: { lte, gt }` directly. This preserves the
  `find*`/preview symmetry and the `sendMessage()` core untouched (ENGN intent).
  Phase 2 will read the full `Appointment` table for interval learning; this
  phase must NOT rewrite the rebooking query.
- **D-06:** Migration **backfills** a seed `Appointment` for every existing
  customer that has a non-null `lastAppointmentAt` (`date` = that value,
  `source: 'backfill'`, `service: null`). Guarantees the D-04 invariant holds for
  legacy rows and that detail pages aren't blank.
- **D-07:** The existing **customer CSV** (`parseCustomersCsv`) and the
  **add-customer form** keep their `last_appointment_at` input, BUT when a value
  is provided they now also create a backing seed `Appointment` (source `csv` /
  `manual`) so the invariant holds — no orphaned last-visit values. (Removing the
  column outright was considered and rejected to avoid breaking the existing flow.)

### Appointments CSV import (APPT-02)
- **D-08:** A **separate, dedicated appointments CSV** — one row per visit
  (`name`, `phone`, `date`, `service`, optional `source`). Reuse the existing
  `lib/csv-import.ts` approach: header aliases, `skipEmptyLines`, per-row error
  collection, server re-parse on submit, and a client preview that surfaces bad
  rows rather than silently dropping them (Success Criteria #2). Build it as its
  own parser/dialog — do NOT overload the customer CSV.
- **D-09:** Matching: match an appointment row to an existing customer by
  **normalized E.164 phone** (`normalizePhone()`, exact-string match — same
  convention as inbound reply matching). If no customer matches, **auto-create**
  the customer from the row (`name` + `phone` required for creation). Existing
  customers are matched, not duplicated.
- **D-10:** Re-import is **dedup'd**: an appointment row is skipped when the
  matched/created customer already has an appointment with the same `date` AND
  same `service` (see D-12). Skipped dupes are reported in the preview/result, not
  silently dropped.

### Visit history UI
- **D-11:** New **`/customers/[id]` detail page**: contact header (name, phone,
  email, derived last-visit) + a visit timeline (newest first) + an "Add visit"
  button. Make `/customers` table rows clickable to reach it. The table keeps its
  derived "Last visit" column.
- **D-12:** Per-visit actions are **add + delete only** (no inline edit this
  phase). Delete mirrors `deleteCustomerAction`: `deleteMany` re-checking
  `businessId` in the `where` so a crafted POST can't touch another business's
  appointment. Correcting a mistake = delete + re-add.

### Duplicate handling
- **D-13:** Block **exact dupes** — same customer + same `date` + same `service`
  is skipped (manual add and CSV re-import alike). A genuine same-day visit with a
  **different** service is allowed. This keeps CSV re-import idempotent and
  protects Phase 2 cadence math from inflated visit counts. (Date-only dedup and
  allow-all were both considered and rejected.)

### Claude's Discretion
- Exact Prisma model name / table name (`appointments`), index definitions, and
  the `onDelete` behavior — plan against the schema conventions; remember the
  rename is `reviewpilot` → `Backbooked` (opportunistic, never break a
  migration/identifier for a label).
- CSV header alias spellings for the appointments file (mirror the existing
  `HEADER_ALIASES` style for `date`/`service`/`source`), accepted date formats
  (reuse the existing `new Date()` parse + "Invalid date" error path), empty-state
  copy ("No visits recorded yet"), and timeline formatting/sort.
- Whether add/import use Server Actions returning the standard
  `{ error?; successAt? }` form-state (they should — match the existing pattern)
  and which paths call `revalidatePath`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 1: Appointment History Foundation" — goal,
  success criteria, requirement IDs.
- `.planning/REQUIREMENTS.md` §"Appointment History (APPT)" — APPT-01/02/03 text;
  also ENGN-03/04 (existing automations + opt-out/record-before-send rules must
  keep holding) for downstream awareness.
- `.planning/PROJECT.md` §"Key Decisions" / §"Constraints" — the "real
  Appointment model; integrations populate it later, seed manually/CSV now"
  decision and the find/send/preview-symmetry constraint.

### Data model (source of truth)
- `prisma/schema.prisma` — `Customer` (the `lastAppointmentAt` field at
  `customers.last_appointment_at`), `Business` scoping, `Message`/`Feedback`
  `onDelete` conventions to follow for the new model.

### Code to extend / preserve
- `lib/csv-import.ts` (`parseCustomersCsv`, `HEADER_ALIASES`, `ParsedCustomerRow`)
  — the parse→preview→per-row-error pattern the appointments CSV reuses.
- `lib/automations/rebooking.ts` — queries `Customer.lastAppointmentAt` directly;
  must keep working unchanged (D-05). This is the integrity check for APPT-03.
- `app/(app)/customers/actions.ts` (`createCustomerAction`,
  `importCustomersAction`, `deleteCustomerAction`) — Server Action form-state
  pattern + the ownership-rechecking `deleteMany` to mirror.
- `lib/phone.ts` (`normalizePhone`) — E.164 normalization for CSV phone matching
  (D-09).
- `lib/current-business.ts` (`requireCurrentBusiness`) — per-business scoping gate
  for the new page/actions.

### Engineering guidance
- `AGENTS.md` — phones normalized to E.164 at every entry point; Server Action
  conventions; `db:migrate` via the `dotenv-cli`-wrapped npm scripts (Prisma CLI
  reads `.env`, not `.env.local`); restart `npm run dev` after schema change.
- `.planning/codebase/ARCHITECTURE.md` — layered-monolith + shared-send-core +
  find/send/preview symmetry the new model must not disturb.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/csv-import.ts` — clone the parser shape for `appointments.csv`: header
  normalization/aliases, greedy empty-skip, `rowNumber`-tagged per-row `errors[]`,
  `{ rows, validCount, invalidCount, fatal }` result. Preview UX already exists in
  `import-customers-dialog.tsx` to mirror.
- `app/(app)/customers/actions.ts` — Server Action pattern
  (`(_prev, formData) => Promise<State>`, validate → mutate → `revalidatePath`),
  plus the ownership-safe `deleteMany({ where: { id, businessId } })` to copy for
  delete-visit.
- `lib/phone.ts#normalizePhone` — reuse verbatim for matching CSV rows to
  customers and for any auto-created customer's phone.
- `requireCurrentBusiness()` — gate the new `/customers/[id]` page and all
  appointment actions; scope every query by `business.id`.

### Established Patterns
- Server Components by default; `"use client"` only for the add/delete/import
  dialogs and interactive bits (the customers table is already a client component).
- Discriminated/serializable form-state results, no validation library, inline
  validation.
- Timestamps are `@db.Timestamptz(6)` with `@map(snake_case)`; new model follows
  suit. Migrations via `npm run db:migrate -- --name add_appointment_model`.

### Integration Points
- `Customer` model gains an `appointments Appointment[]` relation;
  `lastAppointmentAt` becomes a maintained cache (D-04).
- `/customers` table rows link to the new detail route; "Last visit" column now
  reflects the derived cache.
- `rebooking.ts` is the contract boundary: it must read the same
  `lastAppointmentAt` semantics after the change (regression-check it).

</code_context>

<specifics>
## Specific Ideas

- Detail page mock the owner approved (visit timeline, newest first, per-row
  delete, "+ Add visit"):
  ```
  /customers/[id]
  ┌─ Jane Doe ───────────┐
  │ +1 555…  jane@…       │
  │ Last visit: Apr 12    │
  ├─ Visits ──────[+ Add]─┤
  │ • Apr 12  Haircut  [－]│
  │ • Feb 02  Haircut  [－]│
  │ • Dec 14  Color    [－]│
  └───────────────────────┘
  ```
- Appointments CSV exemplar: `name,phone,date,service` with repeated phones for a
  customer's multiple visits; auto-create when the phone matches no existing
  customer.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Predictive cadence, staged
win-back, real integrations, services catalog, and inline visit editing were all
explicitly kept out and belong to Phase 2 / Phase 3 / future milestones.)

</deferred>

---

*Phase: 1-Appointment History Foundation*
*Context gathered: 2026-06-04*
