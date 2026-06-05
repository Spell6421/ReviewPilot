# Phase 1: Appointment History Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 1-Appointment History Foundation
**Areas discussed:** Visit history surface, Appointment CSV import, Last-visit + existing data, Appointment record shape

---

## Visit history surface

### Where past visits live

| Option | Description | Selected |
|--------|-------------|----------|
| Customer detail page | New `/customers/[id]` profile: contact header + visit timeline + Add visit; rows clickable. Most room for Phase 2/3. | ✓ |
| Expandable table row | Inline expand in the existing flat table; lightest, no new route; gets cramped. | |
| Side drawer / sheet | shadcn Sheet from a row; no route change; transient, not linkable. | |
| You decide | Claude picks. | |

**User's choice:** Customer detail page
**Notes:** Picked the option with the most headroom — Phase 2 cadence and Phase 3 win-back status get a natural home, and it matches "a customer's profile shows a list of past visits."

### Per-visit actions

| Option | Description | Selected |
|--------|-------------|----------|
| Add + delete only | Add visits, delete a mistaken one and re-add; mirrors existing delete-customer pattern; no edit forms. | ✓ |
| Add + edit + delete | Full per-visit CRUD; most forgiving, more UI to build/validate. | |
| Add only | Append-only; least to build, but a bad date lingers and skews cadence. | |

**User's choice:** Add + delete only
**Notes:** Correctability matters (a wrong date corrupts Phase 2 cadence) but full edit forms aren't worth it this phase — delete + re-add covers it with the least new surface.

---

## Appointment CSV import

### Import shape

| Option | Description | Selected |
|--------|-------------|----------|
| Separate appointments CSV | Dedicated import, one row per visit (name, phone, date, service); reuses parse→preview→bad-row pattern as its own file/dialog. | ✓ |
| Extend the customer CSV | One CSV, repeated rows per customer carrying visit dates; fewer files but mixes two concerns and complicates the one-row-per-customer parser. | |
| You decide | Claude picks. | |

**User's choice:** Separate appointments CSV
**Notes:** Clean separation — customer CSV keeps adding people, appointments CSV adds their visits; matches how booking systems export (one row per appointment).

### Matching / unmatched rows

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-create the customer | Match existing by E.164 phone; create the customer (name+phone) when none matches; re-import dedup'd by phone. | ✓ |
| Attach to existing only | Only attach to already-imported customers; surface unmatched rows as bad rows; two ordered steps. | |
| You decide | Claude picks. | |

**User's choice:** Auto-create the customer
**Notes:** Lowest-friction seeding; mirrors how an integration would deliver an appointment for a possibly-new customer. Dedup by phone keeps re-imports safe.

---

## Last-visit + existing data

### lastAppointmentAt strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as synced cache | Keep the column as a derived cache = MAX(appointment date), recomputed on add/delete/import; rebooking.ts unchanged; invariant always holds. | ✓ |
| Derive on read, drop column | Remove the column, compute on demand; purer but forces a rewrite of rebooking.ts's DB range query this phase. | |

**User's choice:** Keep as synced cache
**Notes:** Lowest disruption; preserves find/preview symmetry and leaves the existing automation's query intact (APPT-03 integrity).

### Backfill of existing customers

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill a seed visit | Migration creates one Appointment per existing customer with a lastAppointmentAt (source 'backfill'); invariant holds, profiles non-empty, Phase 2 has a data point. | ✓ |
| Leave them blank | No seed appointments; legacy rows keep the value but show "no visits", breaking the invariant. | |

**User's choice:** Backfill a seed visit
**Notes:** Keeps the cache invariant true for legacy rows from day one and avoids empty profiles. Consequence locked: the customer-CSV / add-customer last-visit field now also writes a backing seed appointment.

---

## Appointment record shape

### Duplicate handling

| Option | Description | Selected |
|--------|-------------|----------|
| Block exact dupes (date+service) | Skip when same customer + same date + same service; same-day different service allowed; skips shown in preview. | ✓ |
| Block by date only | One visit per customer per day; strictest; can't record a real same-day second service. | |
| Allow all | No dedup; simplest, but re-import doubles history and skews cadence. | |

**User's choice:** Block exact dupes (date+service)
**Notes:** Keeps CSV re-import idempotent while still allowing genuine same-day different-service visits; protects Phase 2 cadence from inflated counts.

---

## Claude's Discretion

- Field types confirmed without a question (clear technical/conventions calls): `date` as `Timestamptz`, `service` optional free-text (no services catalog), `source` nullable string seeded `manual`/`csv`/`backfill` (+ future integration names), `(customerId, date)` index, date-input-only UI.
- Prisma model/table naming, `onDelete` behavior, CSV header aliases + accepted date formats, empty-state copy, timeline sort/format, Server-Action form-state wiring and `revalidatePath` paths.

## Deferred Ideas

None — discussion stayed within phase scope. Predictive cadence (Phase 2), staged win-back (Phase 3), real integrations, services catalog, and inline visit editing were explicitly kept out.
