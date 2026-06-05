# Phase 1: Appointment History Foundation - Research

**Researched:** 2026-06-04
**Domain:** Brownfield Next.js 16 (App Router) + Prisma 5.22 → Supabase Postgres schema migration & data backfill, derived-cache invariant maintenance, CSV ingestion
**Confidence:** HIGH (all findings grounded in the actual repo files; no external library guesses required)

## Summary

This phase adds a per-visit `Appointment` model behind the existing single
`Customer.lastAppointmentAt` field, exposes manual add/delete and a dedicated
appointments-CSV import, and keeps the rebooking/win-back automation working by
turning `lastAppointmentAt` into a maintained derived cache. Every locked decision
(D-01 → D-13) is already settled in CONTEXT.md; this research grounds the five RISKY
mechanics the planner must nail: (1) the one-migration model-add-plus-backfill, (2)
the cache-invariant recompute hook on every mutation path, (3) the rebooking
regression boundary, (4) CSV parser reuse + phone matching + dedup, and (5)
Server-Action / ownership-scoping conventions.

Almost everything needed is **already in the repo** and should be cloned, not
invented: `lib/csv-import.ts` is the parser template, `lib/phone.ts#normalizePhone`
is the matcher, `app/(app)/customers/actions.ts` is the Server-Action +
ownership-`deleteMany` template, `lib/current-business.ts#requireCurrentBusiness` is
the scoping gate, `app/feedback/[token]/page.tsx` is the async-`params` dynamic-route
template (Next.js 16 `params: Promise<...>`), and the feedback migration is the
raw-SQL template. No new dependency is needed.

**Primary recommendation:** Implement the schema change as a single Prisma migration
whose generated `migration.sql` gets a hand-appended raw-SQL `INSERT … SELECT`
backfill (D-06), then funnel ALL appointment mutations through one shared
`recomputeLastAppointment(customerId, businessId)` helper so the D-04 invariant
(`lastAppointmentAt == MAX(appointment.date)`, null when none) can never drift. Do
NOT touch `rebooking.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Appointment persistence + relations | Database / Prisma schema | — | `prisma/schema.prisma` is the source of truth; new `appointments` table |
| Legacy backfill | Database (migration SQL) | — | One-time data move; belongs in the migration, not app code |
| Cache invariant recompute | API / Backend (`lib/` helper + Server Actions) | — | Pure server logic; must run inside every mutation transaction |
| Appointment CSV parse | API / Backend (`lib/csv-import.ts` sibling) + Client preview | Browser (preview only) | Same split as customers CSV: client dry-run for UX, server re-parse is authoritative |
| Phone → customer matching | API / Backend (`normalizePhone`) | — | Exact-string E.164 match, server-side |
| Visit-history detail page | Frontend Server (RSC) | Browser (add/delete dialogs) | RSC fetches scoped data; `"use client"` only for interactive dialogs |
| Ownership scoping | API / Backend (`requireCurrentBusiness` + `where: { businessId }`) | — | Server Actions are POST-reachable; auth enforced in the action, never UI-only |

## Standard Stack

No new packages. Everything is already installed and version-pinned in `package.json`.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 | App Router, RSC, Server Actions, dynamic routes | [VERIFIED: package.json] — the backend IS server actions + route handlers (AGENTS.md) |
| `@prisma/client` / `prisma` | ^5.22.0 | Schema, migrations, queries | [VERIFIED: package.json] data-model source of truth |
| `papaparse` | ^5.5.3 | CSV parsing (`header`, `skipEmptyLines: "greedy"`, `transformHeader`) | [VERIFIED: package.json + lib/csv-import.ts] already the customer-CSV parser |
| `react` / `react-dom` | 19.2.4 | `useActionState`, RSC | [VERIFIED: package.json] |
| `radix-ui` + shadcn/ui | ^1.4.3 / shadcn ^4.8.0 | Dialog, Table, AlertDialog, Field, Empty, DropdownMenu | [VERIFIED: import-customers-dialog.tsx imports these] |
| `lucide-react` | ^1.16.0 | Icons | [VERIFIED: package.json] |

**Installation:** None. `npm install` already covers this phase.

**Version verification:** Confirmed against `package.json` (the authoritative manifest
in-repo). No registry lookup needed because no package is being added.

## Package Legitimacy Audit

> No external packages are installed in this phase — every dependency is already
> present and pinned in `package.json`. Package Legitimacy Gate is **N/A**.

## Architecture Patterns

### System Architecture Diagram (data flow)

```
                         ┌──────────────────────────────────────────────┐
  Owner (browser)        │             Next.js 16 (App Router)          │
  ───────────────        │                                              │
                         │  /customers (RSC)                            │
  click row ───────────► │    └─► /customers/[id] (RSC, async params)   │
                         │          fetch: customer + appointments      │
                         │          (scoped where businessId)           │
                         │            │                                 │
  "+ Add visit" ───────► │   addAppointmentAction ─┐                    │
  "[－]" delete ───────► │   deleteAppointmentAction┤                   │
  appts CSV upload ────► │   importAppointmentsAction┤                  │
  add-customer form ───► │   createCustomerAction ──┤  (all server)     │
  customer CSV ────────► │   importCustomersAction ─┤                   │
                         │                          ▼                   │
                         │            mutate appointment rows           │
                         │                          │                   │
                         │                          ▼                   │
                         │   recomputeLastAppointment(customerId, bizId)│
                         │     UPDATE customers SET last_appointment_at │
                         │       = MAX(appointments.date) | NULL        │
                         │                          │                   │
                         │                          ▼                   │
                         │   revalidatePath('/customers' , '/customers/[id]')
                         └──────────────────────────┼───────────────────┘
                                                    │
                          (UNCHANGED — read boundary, D-05)
                                                    ▼
                         lib/automations/rebooking.ts
                           prisma.customer.findMany({
                             where: { businessId, lastAppointmentAt: {lte,gt} }})
                                                    │
                                                    ▼
                              Vercel Cron → sendMessage()  (untouched)
```

The primary use case — owner adds a visit, the cache updates, and the next cron run
reads the new `lastAppointmentAt` — traces left-to-right then down to the unchanged
rebooking read.

### Component Responsibilities

| File (new or edited) | Responsibility |
|----------------------|----------------|
| `prisma/schema.prisma` | Add `Appointment` model + `appointments Appointment[]` on `Customer` (EDIT) |
| `prisma/migrations/<ts>_add_appointment_model/migration.sql` | CreateTable + indexes + FKs + **appended raw-SQL backfill** (NEW) |
| `lib/appointments.ts` (suggested) | `recomputeLastAppointment(customerId, businessId)` shared helper (NEW) |
| `lib/appointments-csv.ts` (suggested) | `parseAppointmentsCsv()` mirroring `parseCustomersCsv` (NEW) |
| `app/(app)/customers/[id]/page.tsx` | RSC detail page (async `params`), scoped fetch (NEW) |
| `app/(app)/customers/[id]/*-dialog.tsx` | add-visit / import dialogs, `"use client"` (NEW) |
| `app/(app)/customers/[id]/actions.ts` (or extend customers/actions.ts) | add/delete/import appointment Server Actions (NEW) |
| `app/(app)/customers/actions.ts` | `createCustomerAction` + `importCustomersAction` now also seed a backing appointment + recompute (EDIT, D-07) |
| `app/(app)/customers/customers-table.tsx` | rows become links to `/customers/[id]` (EDIT, D-11) |

### Recommended Project Structure
```
app/(app)/customers/
├── actions.ts                  # EDIT: D-07 seed appointment on customer create/import
├── customers-table.tsx         # EDIT: clickable rows → /customers/[id]
└── [id]/
    ├── page.tsx                # NEW: RSC detail (async params)
    ├── actions.ts              # NEW: add/delete/import appointment actions
    ├── visit-history.tsx       # NEW: timeline (client, delete buttons)
    ├── add-visit-dialog.tsx    # NEW: client
    └── import-appointments-dialog.tsx  # NEW: client preview
lib/
├── appointments.ts             # NEW: recomputeLastAppointment helper
├── appointments-csv.ts         # NEW: parseAppointmentsCsv
├── csv-import.ts               # TEMPLATE to mirror
└── phone.ts                    # REUSE normalizePhone verbatim
```

### Pattern 1: One-migration model add + raw-SQL backfill (D-06)
**What:** `npm run db:migrate -- --name add_appointment_model` generates the
CreateTable SQL. Before applying to prod, append a raw-SQL backfill block to the
generated `migration.sql` so legacy `lastAppointmentAt` values get a seed appointment
in the *same* migration. The feedback migration shows the exact DDL style to expect.

**⚠️ CRITICAL workflow correction:** `package.json` defines
`"db:migrate": "dotenv -e .env.local -- prisma migrate dev"`. The script reads
**`.env.local`**, NOT `.env` as AGENTS.md states. The npm script is authoritative —
always use `npm run db:migrate -- --name <x>`; do not call `prisma migrate` bare.

**When to use:** This phase's single schema change.
**Example (append to the generated migration.sql, after CreateTable + indexes + FKs):**
```sql
-- Backfill: one seed appointment per customer with a known last visit (D-06).
-- source = 'backfill', service = NULL, date = the legacy last_appointment_at.
INSERT INTO "appointments" ("id", "business_id", "customer_id", "date", "service", "source", "created_at")
SELECT gen_random_uuid(), c."business_id", c."id", c."last_appointment_at", NULL, 'backfill', CURRENT_TIMESTAMP
FROM "customers" c
WHERE c."last_appointment_at" IS NOT NULL;
```
> `gen_random_uuid()` is available on Supabase Postgres (pgcrypto/pg ≥13 built-in).
> [VERIFIED: feedback migration uses UUID PKs; Supabase ships pgcrypto] After
> backfill, the D-04 invariant already holds for legacy rows (their existing
> `last_appointment_at` equals MAX of their single seed appointment), so no UPDATE of
> `customers` is required in the migration.

**onDelete decision (D-01 / Claude's Discretion):** Read of `schema.prisma` confirms
the convention split:
- `Message.customer` and `Feedback.customer` use **`onDelete: SetNull`** (nullable
  `customerId`) — logs must survive customer deletion. [VERIFIED: schema.prisma L146, L215]
- `Customer.business`, `MessageTemplate.business`, etc. use **`onDelete: Cascade`**.
  [VERIFIED: schema.prisma L71, L96]

Appointments ARE the customer's history (meaningless without the customer), so use
**`onDelete: Cascade`** with a **non-null** `customerId` — matching the Cascade family,
deliberately differing from the SetNull logs. This is exactly what CONTEXT D-01 calls
for; the schema evidence confirms it is the correct, consistent choice.

### Pattern 2: Shared recompute helper enforcing the D-04 invariant
**What:** A single function every mutation path calls, so the cache can't drift.
**When to use:** After ANY appointment insert/delete.
**Example:**
```ts
// lib/appointments.ts (suggested) — pseudocode grounded in repo prisma usage
import { prisma } from "@/lib/prisma";

/** Re-derive Customer.lastAppointmentAt = MAX(appointment.date) | null. Scoped. */
export async function recomputeLastAppointment(customerId: string, businessId: string) {
  const latest = await prisma.appointment.findFirst({
    where: { customerId, businessId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  await prisma.customer.updateMany({
    where: { id: customerId, businessId },          // updateMany re-checks businessId (ownership-safe)
    data: { lastAppointmentAt: latest?.date ?? null },
  });
}
```
> Use `updateMany` (not `update`) so `businessId` is in the `where` — same
> ownership-recheck discipline as `deleteCustomerAction`'s `deleteMany`. For bulk CSV
> import, recompute **once per affected customer** after all rows are inserted (collect
> the distinct customerIds), not per row.

### Pattern 3: Dynamic detail route with async params (Next.js 16)
**What:** `/customers/[id]` is an RSC whose `params` is a Promise that must be awaited.
**Verified twice:** repo already does this in `app/feedback/[token]/page.tsx`
(`params: Promise<{ token: string }>; const { token } = await params`)
[VERIFIED: app/feedback/[token]/page.tsx L13-18] AND Next.js 16 docs
[CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md].
```ts
// app/(app)/customers/[id]/page.tsx
export default async function CustomerDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business } = await requireCurrentBusiness();
  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },          // scoped — prevents cross-business leak (SC#4)
    include: { appointments: { orderBy: { date: "desc" } } },
  });
  if (!customer) notFound();                          // 404 on miss OR wrong business
  // …
}
```
> The `findFirst({ where: { id, businessId } })` + `notFound()` pattern is the
> cross-business isolation guarantee for the detail page: a customer from another
> business returns null → 404, never leaks.

### Anti-Patterns to Avoid
- **Editing `rebooking.ts`.** D-05 forbids it. The phase only maintains the cache it
  already reads. Touching it breaks find/send/preview symmetry (ENGN).
- **Using `prisma.update`/`prisma.delete` (singular) for scoped mutations.** They
  target by PK only and can hit another business's row from a crafted POST. Always
  `updateMany`/`deleteMany` with `businessId` in `where`.
- **Recomputing the cache per-row in a bulk import.** O(n) extra round-trips and a
  drift window; recompute once per distinct customer after the batch insert.
- **Overloading the customer CSV parser** for appointments. D-08: build a separate
  `parseAppointmentsCsv`. Different columns (one row per visit), different matching.
- **Branching on a sentiment model / changing send-core.** Out of scope; `sendMessage()`
  stays untouched.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | A custom splitter | `papaparse` via a `parseAppointmentsCsv` clone of `parseCustomersCsv` | Quoted fields, `skipEmptyLines: "greedy"`, header aliasing all already solved |
| Phone normalization | Regex in the new parser | `normalizePhone()` verbatim | Inbound-reply matching is exact-string E.164; any divergence breaks matching |
| Per-row error UX | New preview component | Mirror `import-customers-dialog.tsx` PreviewTable | Bad-row surfacing (SC#2) pattern exists |
| Ownership re-check | Manual checks | `requireCurrentBusiness()` + `where: { businessId }` on every query | Established gate; Server Actions are POST-reachable |
| Backfill in app code | A startup script | Raw SQL inside the migration | One-time, transactional, runs on `db:deploy` in every environment |
| Success/close form state | Custom signals | `{ error?; successAt? }` + `useActionState` snapshot pattern | Both dialogs already use it |

**Key insight:** This phase is ~90% cloning four existing files into appointment-shaped
siblings and wiring one recompute helper. The risk is not "what library" — it's
"did the cache-invariant hook fire on every mutation path." That is the whole game.

## Runtime State Inventory

> Rename/migration-adjacent phase (adds a table + backfills data). Inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `customers.last_appointment_at` (existing values that must be preserved + seeded as backfill appointments). New `appointments` table. | Data migration (raw-SQL backfill, D-06) |
| Live service config | None — no external service stores appointment data yet (integrations are a future milestone; data is manual/CSV now). Verified by CONTEXT.md "NOT in this phase" + REQUIREMENTS Out-of-Scope. | None |
| OS-registered state | None — Vercel Cron route is config-gated by `CRON_SECRET`; no task names embed appointment identifiers. | None |
| Secrets/env vars | `DATABASE_URL` (port 6543 pooler, runtime) and `DIRECT_URL` (direct, migrations) read from **`.env.local`** by the `db:migrate` script. No new secret needed; no key renamed. | None — confirm `.env.local` present before running migration |
| Build artifacts | Prisma client (`@prisma/client`) must be regenerated after the schema change; `db:migrate` runs `prisma generate`, but **restart `npm run dev`** so new `Appointment` types load (AGENTS.md). | `npm run db:generate` + dev restart |

**The canonical question — after every file is updated, what runtime state still has the
old shape?** Only the in-memory Prisma client types and the dev server — handled by the
regenerate + restart step. No external system caches appointment data.

## Common Pitfalls

### Pitfall 1: Cache drift — a mutation path that forgets to recompute
**What goes wrong:** A visit is added/deleted/imported but `lastAppointmentAt` isn't
re-derived, so rebooking nudges fire (or don't) on stale data — silently breaking APPT-03.
**Why it happens:** Five distinct write paths (D-04): manual add, manual delete,
appointments-CSV import, customer-CSV import (`parseCustomersCsv` path in
`importCustomersAction`), and the add-customer form (`createCustomerAction`). Each is a
separate place the hook must be inserted.
**How to avoid:** One `recomputeLastAppointment` helper; call it from all five. For the
two D-07 paths, the customer-create now also inserts a seed appointment (source `manual`/`csv`)
THEN recomputes — never write `lastAppointmentAt` directly anymore.
**Warning signs:** A `lastAppointmentAt` value with no matching `appointments` row, or
vice-versa. (This is also a validation assertion — see Validation Architecture.)

### Pitfall 2: `.env` vs `.env.local` migration failure
**What goes wrong:** Running `prisma migrate dev` bare (or following AGENTS.md's "`.env`"
claim) connects to the wrong/empty DB or fails to find `DIRECT_URL`.
**Why it happens:** AGENTS.md says Prisma CLI reads `.env`; the actual
`db:migrate` script wraps it in `dotenv -e .env.local`. The script is authoritative.
**How to avoid:** Always `npm run db:migrate -- --name add_appointment_model`. Never bare `prisma`.
**Warning signs:** "Environment variable not found: DIRECT_URL" or a migration applied to the wrong database.

### Pitfall 3: Phone-match divergence between the two CSV parsers
**What goes wrong:** Appointments CSV uses a slightly different phone normalization →
fails to match an existing customer that the customer CSV would have matched → duplicate
auto-created customers (violates D-09 "matched, not duplicated").
**Why it happens:** Re-implementing instead of importing `normalizePhone`.
**How to avoid:** Import and call `normalizePhone()` verbatim; match by the normalized
E.164 exact string (same as inbound-reply matching).
**Warning signs:** Two customers with the same person's phone in different formats.

### Pitfall 4: Dedup gap inflates Phase-2 cadence math
**What goes wrong:** Re-importing the same appointments CSV creates duplicate visits →
Phase 2's interval learning counts the same visit twice.
**Why it happens:** Skipping the D-10/D-13 dedup check (same customer + same `date` +
same `service` → skip; report as skipped, not silently dropped).
**How to avoid:** Before insert, check existing appointments for that customer with equal
`date` AND `service`. Allow a same-day visit with a *different* service. Surface skipped
dupes in the preview/result counts (SC#2 — don't silently drop).
**Warning signs:** Visit count grows on a no-op re-import.

### Pitfall 5: Cross-business leak on the detail page or delete
**What goes wrong:** `/customers/[id]` or `deleteAppointmentAction` fetches/mutates by
`id` alone → another business's appointment is visible/deletable.
**Why it happens:** Forgetting `businessId` in the `where`.
**How to avoid:** `findFirst({ where: { id, businessId } })` → `notFound()`; delete via
`deleteMany({ where: { id, businessId } })`, mirroring `deleteCustomerAction` (D-12).
**Warning signs:** A crafted POST with another business's appointment id succeeds.

## Code Examples

### Appointments CSV parser (mirror parseCustomersCsv)
```ts
// lib/appointments-csv.ts — shape mirrors lib/csv-import.ts exactly
import Papa from "papaparse";
import { normalizePhone } from "@/lib/phone";

export interface ParsedAppointmentRow {
  rowNumber: number;               // i + 2 (row 2 = first data row)
  name: string;
  phone: string | null;
  date: Date | null;
  service: string | null;
  source: string | null;
  errors: string[];
}
export interface AppointmentParseResult {
  rows: ParsedAppointmentRow[];
  validCount: number;
  invalidCount: number;
  fatal?: string;
}

const HEADER_ALIASES: Record<string, string> = {
  name: "name", customer: "name", client: "name", customer_name: "name",
  phone: "phone", phone_number: "phone", mobile: "phone", cell: "phone",
  date: "date", appointment_date: "date", visit_date: "date", appointment: "date",
  service: "service", treatment: "service", reason: "service",
  source: "source",
};
// normalizeHeader, Papa.parse with { header, skipEmptyLines:"greedy", transformHeader }
// fatal if "name" missing OR "phone" missing OR "date" missing (phone+date required for matching/visit).
// per-row: trim name; phone = normalizePhone(raw) (err "Invalid phone number" if raw && !phone);
//   date via new Date(raw), err "Invalid date" on NaN (reuse existing parse path, D-Discretion);
//   service/source → trimmed || null.
```
> Required columns differ from the customer CSV: appointments need `name` + `phone`
> (D-09 auto-create needs both) + `date`. `service`/`source` optional.

### Add-visit Server Action (mirror createCustomerAction)
```ts
// app/(app)/customers/[id]/actions.ts
"use server";
export async function addAppointmentAction(
  _prev: AppointmentFormState, formData: FormData,
): Promise<AppointmentFormState> {
  const { business } = await requireCurrentBusiness();
  const customerId = String(formData.get("customerId") ?? "");
  // verify the customer belongs to this business BEFORE inserting
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId: business.id } });
  if (!customer) return { error: "Customer not found." };
  const dateRaw = String(formData.get("date") ?? "").trim();
  const parsed = new Date(dateRaw);
  if (!dateRaw || Number.isNaN(parsed.getTime())) return { error: "Enter a valid date." };
  const service = String(formData.get("service") ?? "").trim() || null;
  // D-13 dedup: same customer + same date + same service → reject
  const dupe = await prisma.appointment.findFirst({ where: { customerId, businessId: business.id, date: parsed, service } });
  if (dupe) return { error: "That visit is already recorded." };
  await prisma.appointment.create({ data: { businessId: business.id, customerId, date: parsed, service, source: "manual" } });
  await recomputeLastAppointment(customerId, business.id);   // D-04 hook
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");                              // table "Last visit" column
  return { successAt: Date.now() };
}
```

### Delete-visit Server Action (mirror deleteCustomerAction, D-12)
```ts
export async function deleteAppointmentAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  if (!id) return;
  await prisma.appointment.deleteMany({ where: { id, businessId: business.id } }); // ownership re-check
  await recomputeLastAppointment(customerId, business.id);   // D-04 hook (may set null)
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
```

### D-07: customer create/import now seeds a backing appointment
```ts
// In createCustomerAction / importCustomersAction, when lastAppointmentAt is provided:
//   1. create the customer (without writing lastAppointmentAt directly), then
//   2. create a seed appointment { date: lastAppointmentAt, source: "manual"|"csv", service: null }, then
//   3. recomputeLastAppointment(customerId, businessId)
// → no orphaned last-visit value; invariant holds. For importCustomersAction use a
//   transaction / createMany then a single recompute pass over the distinct new customerIds.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sync `params` object in pages | `params: Promise<...>` + `await` | Next 15→16 | New detail page must await `params`; repo already does this in `feedback/[token]` |
| Single `lastAppointmentAt` field as truth | `Appointment[]` history + derived cache | This phase | Field becomes a maintained cache, never user-written directly |

**Deprecated/outdated:** AGENTS.md's claim that the Prisma CLI reads `.env` — the actual
`db:migrate` npm script reads `.env.local`. Follow the script.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gen_random_uuid()` is available on the target Supabase Postgres for the backfill INSERT | Pattern 1 | Backfill SQL fails; mitigated by Supabase shipping pgcrypto by default, but verify with `db:studio`/a probe before deploy. Alternative: `uuid_generate_v4()` or generate ids app-side in a code backfill. |
| A2 | Suggested new file paths (`lib/appointments.ts`, `lib/appointments-csv.ts`, `[id]/actions.ts`) | Project Structure | Cosmetic only — planner may co-locate differently; no functional risk. |

> All other claims are VERIFIED against repo files or CITED from in-repo Next.js docs.

## Open Questions

1. **Date-only vs full-timestamp equality for dedup (D-13).**
   - What we know: `date` stored as `Timestamptz(6)`; UI uses a date input; dedup is
     "same date + same service."
   - What's unclear: a `<input type="date">` yields midnight UTC, but a backfilled
     value carries the original time-of-day — so "same date" comparisons across sources
     may not be byte-equal.
   - Recommendation: Define dedup equality on the **calendar date** (truncate to day) OR
     normalize all manual/CSV dates to midnight on insert. Planner should pick one and
     state it; midnight-normalization on insert is simplest and matches the
     date-granularity intent (D-03). Backfilled rows keep their timestamp but are
     `source: 'backfill'` and won't be re-imported.

2. **Transaction boundary for bulk import + recompute.**
   - What we know: `importCustomersAction` uses `createMany` today (no per-row tx).
   - Recommendation: For appointments import, insert valid rows then recompute once per
     distinct affected customerId. Wrapping in `prisma.$transaction` is nice-to-have but
     not required given the cache is idempotently recomputable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `.env.local` with `DATABASE_URL` + `DIRECT_URL` | `db:migrate` | Assumed (gitignored) | — | Migration cannot run without it — confirm before planning execution |
| Prisma CLI | migration/generate | ✓ (devDep ^5.22) | 5.22 | — |
| Supabase Postgres | runtime + migration target | Assumed reachable | 15.x | — |
| Node + npm scripts | all commands | ✓ | — | — |

**Missing dependencies with no fallback:** `.env.local` must exist locally for the
migration step; it is gitignored, so a fresh checkout needs it provisioned. Not a code
blocker, but the execution agent must have it.

## Validation Architecture

> Nyquist validation ENABLED for this phase. No automated test suite exists yet
> (AGENTS.md: "there's no test suite yet"; verify via `npx tsc --noEmit`, `npx eslint`,
> and the manual "Try it out" checklist). Validation here is observable-behavior +
> query assertions + manual steps. **Wave 0 gap: no test framework — all checks below
> are manual/query-based unless the planner elects to add one.**

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no suite in repo) |
| Config file | none — see Wave 0 |
| Type/lint gate | `npx tsc --noEmit` + `npx eslint <files>` |
| Manual harness | Browser + Supabase (`npm run db:studio`); Twilio Virtual Phone for SMS round-trip |

### Requirement / Success-Criterion → Validation Map
| ID | Behavior | Validation Type | Concrete check |
|----|----------|-----------------|----------------|
| APPT-01 | Visits stored as individual `Appointment` rows | DB query | `db:studio` → `appointments` table exists; add 2 visits for one customer → 2 rows |
| APPT-02 (manual) | Owner adds a visit via UI | Manual + query | Detail page "+ Add visit" → row appears newest-first; row in DB with `source='manual'` |
| APPT-02 (CSV) | Owner imports appointments CSV | Manual + query | Upload sample CSV (repeated phone for multiple visits) → preview shows valid/skip counts → rows inserted; new customer auto-created when phone unmatched (D-09) |
| APPT-03 (cache) | last-visit derived; legacy behavior correct | DB assertion | After backfill: `SELECT count(*) FROM customers c WHERE c.last_appointment_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id=c.id)` → **0** |
| APPT-03 (invariant, add) | adding a newer visit updates cache | query | add visit dated after current last → `customers.last_appointment_at` now equals it |
| APPT-03 (invariant, delete) | deleting the newest visit recomputes (incl. → null) | query | delete the only/newest visit → `last_appointment_at` = MAX of remaining, or NULL if none |
| APPT-03 (rebooking regression) | rebooking still fires off the cache | behavior | dashboard "Test my setup" preview before/after migration returns the same due-list for unchanged data; a customer whose last visit is 90 days old still appears in `rebooking_reminder` pass |
| SC#4 (cross-business isolation) | no appointment leaks across businesses | manual/security | Business B's `/customers/<A's id>` → 404; crafted delete POST with A's appointment id from B's session deletes nothing (`deleteMany` where `businessId=B` matches 0) |
| SC#2 (bad-row surfacing) | invalid CSV rows shown, not dropped | manual | CSV with a bad date / unparseable phone → preview lists those rows with errors; import count excludes them |
| Dedup (D-10/D-13) | re-import idempotent | query | import same CSV twice → second run reports rows skipped; appointment count unchanged; same-day **different**-service row IS added |
| D-07 | customer create/import with last-visit seeds an appointment | query | add customer with a last-appointment date → an `appointments` row (source `manual`/`csv`) exists AND `last_appointment_at` matches it (no orphan) |

### The cache invariant — single global assertion (run after any mutation)
```sql
-- Must always return 0 rows. The core APPT-03 / D-04 safety net.
SELECT c.id
FROM customers c
LEFT JOIN (
  SELECT customer_id, MAX(date) AS max_date FROM appointments GROUP BY customer_id
) a ON a.customer_id = c.id
WHERE c.last_appointment_at IS DISTINCT FROM a.max_date;
```

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` + `npx eslint <changed files>`.
- **Per mutation-path task:** run the invariant SQL above + the relevant row of the map.
- **Phase gate:** all map rows pass + invariant SQL returns 0 + "Try it out" checklist
  green (browser + Supabase), per the manual-test-suite memory.

### Wave 0 Gaps
- [ ] No automated test framework installed. Planner decides: add a lightweight runner
  (e.g. for the parser + recompute helper, both pure functions) OR keep
  manual/query-based validation. The two highest-value unit targets if a framework is
  added: `parseAppointmentsCsv` (row errors, dedup-eligible shape) and
  `recomputeLastAppointment` semantics.
- [ ] Sample `appointments.csv` fixture (repeated phones, one bad date, one bad phone,
  one exact-dupe, one same-day-different-service) for manual import validation.

## Project Constraints (from AGENTS.md / CLAUDE.md)

- **Modified Next.js 16** — read `node_modules/next/dist/docs/` before writing; async
  `params` for dynamic routes (verified). Middleware is `proxy.ts` (not relevant here, but
  do NOT create `middleware.ts`).
- **No `src/`** — `app/`, `components/`, `lib/`, `prisma/` at root; `@/*` maps to root.
- **Scope every read AND write by `business.id`;** re-check ownership in `where` of
  destructive actions; enforce auth inside the Server Action, not just UI.
- **Server Actions** return serializable `{ error?; successAt? }`, signature
  `(_prev, formData) => Promise<State>`, `revalidatePath()` after mutating, inline
  validation (no validation library).
- **Phones** normalized to E.164 via `normalizePhone()` at every entry point.
- **Migrations** via the npm scripts (`npm run db:migrate -- --name x`) — wraps Prisma in
  dotenv-cli reading **`.env.local`**. Restart `npm run dev` after a schema change.
- **Timestamps** `@db.Timestamptz(6)` + `@map(snake_case)`; new model follows suit.
- **Don't add dependencies** unless solving an immediate problem (none needed here).
- **Don't touch `sendMessage()` / find-send-preview symmetry / `rebooking.ts` query.**
- **After shipping:** give a 3–5 item "Try it out" checklist (browser + Supabase).
- **Out of scope (do not build):** services catalog, inline visit edit, cadence math,
  staged win-back, real integrations, inbox, analytics, billing.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPT-01 | Visits stored as individual `Appointment` records (date, optional service/source) | Schema add (Pattern 1), onDelete: Cascade verified against schema conventions |
| APPT-02 | Seed/import history manually + via CSV | Add-visit action (mirror createCustomerAction), `parseAppointmentsCsv` (mirror csv-import.ts), phone-match + auto-create (D-09) |
| APPT-03 | Most-recent visit derived; existing `lastAppointmentAt` behavior stays correct | `recomputeLastAppointment` helper + D-06 backfill + rebooking left untouched (D-05); invariant SQL assertion |

## Sources

### Primary (HIGH confidence — in-repo, verified)
- `prisma/schema.prisma` — Customer/Message/Feedback onDelete conventions, Timestamptz mapping
- `prisma/migrations/20260603002443_add_feedback/migration.sql` — raw-SQL DDL template
- `lib/csv-import.ts`, `lib/phone.ts` — parser + normalization templates
- `lib/automations/rebooking.ts` — the read boundary that must stay unchanged (D-05)
- `app/(app)/customers/actions.ts` — Server-Action + ownership `deleteMany` pattern
- `lib/current-business.ts` — `requireCurrentBusiness` scoping gate
- `app/feedback/[token]/page.tsx` — async-`params` dynamic-route template
- `app/(app)/customers/import-customers-dialog.tsx`, `add-customer-dialog.tsx`,
  `customers-table.tsx`, `page.tsx` — UI patterns to mirror
- `package.json` — versions + the authoritative `db:migrate` script (reads `.env.local`)

### Primary (CITED)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
  — async `params` convention for Next.js 16

### Secondary / Tertiary
- None required — phase is fully groundable in the repo; no external WebSearch was needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json; nothing new added
- Architecture/patterns: HIGH — every pattern cloned from an existing, working repo file
- Migration/backfill: HIGH on mechanics; A1 (gen_random_uuid availability) is a low-risk assumption to confirm pre-deploy
- Pitfalls: HIGH — derived from the actual mutation paths and schema conventions
- Validation: MEDIUM — no test framework exists; checks are manual/query-based by necessity

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stable; repo-grounded, low churn)
