# Phase 1: Appointment History Foundation - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 11 (5 NEW, 4 EDIT, 2 read-only boundaries)
**Analogs found:** 11 / 11 (every artifact has a concrete in-repo analog)

> This phase is ~90% cloning existing repo files into appointment-shaped siblings plus
> one shared `recomputeLastAppointment` helper. The entire risk is "did the cache hook
> fire on every mutation path." Below, every new file is mapped to the exact analog and
> the concrete excerpt to mirror.
>
> **Hard off-limits (D-05):** do NOT edit `lib/automations/rebooking.ts` or
> `lib/send-message.ts`. `rebooking.ts` is a read-only boundary — it keeps querying
> `Customer.lastAppointmentAt: { lte, gt }` and must return the same due-list after the
> change for unchanged data (regression check).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `prisma/schema.prisma` (EDIT: add `Appointment` model + relation) | model | persistence | `Feedback` / `Customer` models, same file | exact |
| `prisma/migrations/<ts>_add_appointment_model/migration.sql` (NEW) | migration | DDL + raw-SQL backfill | `prisma/migrations/20260603002443_add_feedback/migration.sql` | exact (DDL); backfill is net-new |
| `lib/appointments.ts` (NEW: `recomputeLastAppointment`) | utility/service | transform (read-max → write-cache) | no direct analog; mirrors `deleteCustomerAction` ownership-`where` discipline | role-match |
| `lib/appointments-csv.ts` (NEW: `parseAppointmentsCsv`) | utility | file-I/O / transform | `lib/csv-import.ts` (`parseCustomersCsv`) | exact |
| `app/(app)/customers/[id]/page.tsx` (NEW) | route (RSC) | request-response | `app/feedback/[token]/page.tsx` (async `params`) | exact (route shape); scoped fetch from `requireCurrentBusiness` |
| `app/(app)/customers/[id]/actions.ts` (NEW: add/delete/import appt) | controller (Server Actions) | CRUD | `app/(app)/customers/actions.ts` | exact |
| `app/(app)/customers/[id]/visit-history.tsx` (NEW) | component | event-driven (delete) | `customers-table.tsx` `CustomerRowActions` (AlertDialog + `<form action>`) | role-match |
| `app/(app)/customers/[id]/add-visit-dialog.tsx` (NEW) | component | request-response | `add-customer-dialog.tsx` | exact |
| `app/(app)/customers/[id]/import-appointments-dialog.tsx` (NEW) | component | file-I/O (preview) | `import-customers-dialog.tsx` | exact |
| `app/(app)/customers/actions.ts` (EDIT: seed appt on create/import, D-07) | controller | CRUD | itself (current `createCustomerAction`/`importCustomersAction`) | self |
| `app/(app)/customers/customers-table.tsx` (EDIT: rows link to `/customers/[id]`, D-11) | component | request-response | itself | self |

**Read-only boundaries (DO NOT EDIT):** `lib/automations/rebooking.ts` (D-05),
`lib/send-message.ts`. `lib/phone.ts#normalizePhone` and
`lib/current-business.ts#requireCurrentBusiness` are REUSED verbatim (imported, never copied).

## Shared Patterns

### Scoping gate (apply to EVERY new page + action)
**Source:** `lib/current-business.ts` lines 38-48
```ts
export async function requireCurrentBusiness() {
  const user = await requireCurrentUser();          // redirects /login if no user
  const business = await prisma.business.findFirst({ where: { ownerId: user.id } });
  if (!business) redirect("/onboarding");
  return { user, business };
}
```
**Obligation:** every read AND write filters by `business.id`. `requireCurrentBusiness()`
at the top of the detail page and every appointment action. Server Actions are
POST-reachable — auth/scoping is enforced *inside the action*, never UI-only.

### Phone normalization (apply to appointments-CSV matching + any auto-created customer)
**Source:** `lib/phone.ts` lines 13-28 — import and call verbatim, do NOT re-implement.
```ts
import { normalizePhone } from "@/lib/phone";
const phone = normalizePhone(raw);   // E.164 or null; matching is exact-string
```
Re-implementing diverges from inbound-reply matching and produces duplicate
auto-created customers (D-09 violation). Pitfall 3 in RESEARCH.

### Ownership-safe mutation (apply to delete-visit + recompute)
**Source:** `app/(app)/customers/actions.ts` lines 122-132 (`deleteCustomerAction`)
```ts
export async function deleteCustomerAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.customer.deleteMany({ where: { id, businessId: business.id } });  // re-checks ownership
  revalidatePath("/customers");
}
```
**Obligation:** use `deleteMany` / `updateMany` (plural) with `businessId` in `where`,
never `delete`/`update` (PK-only → crafted POST can hit another business). D-12, Pitfall 5.

### Server Action form-state contract (apply to add-visit + import-appointments)
**Source:** `app/(app)/customers/actions.ts` lines 10-14, 20-23
```ts
export type CustomerFormState = { error?: string; successAt?: number };
export async function createCustomerAction(
  _prev: CustomerFormState, formData: FormData,
): Promise<CustomerFormState> { /* validate → mutate → revalidatePath → return */ }
```
Signature `(_prev, formData) => Promise<State>`; serializable `{ error?; successAt? }`;
inline validation (no validation library); `revalidatePath()` after mutating.

### Dialog success/close snapshot (apply to both new dialogs)
**Source:** `add-customer-dialog.tsx` lines 33-52 / `import-customers-dialog.tsx` lines 51-87
```ts
const [state, formAction, pending] = useActionState(action, initialState);
const [lastSuccessAt, setLastSuccessAt] = useState<number | undefined>(undefined);
if (state.successAt && state.successAt !== lastSuccessAt) {   // store-prior-value, no setState-in-effect
  setLastSuccessAt(state.successAt);
  setOpen(false);
}
useEffect(() => { if (!open) formRef.current?.reset(); }, [open]);  // reset native form/file input
```

## Pattern Assignments

### `prisma/schema.prisma` — add `Appointment` model (EDIT, model, persistence)

**Analogs (same file):** `Customer` lines 58-77, `Feedback` lines 196-220.

**Timestamptz + `@map` + cascade conventions** (from `Customer` L58-77):
```prisma
model Customer {
  id                String    @id @default(uuid()) @db.Uuid
  businessId        String    @map("business_id") @db.Uuid
  lastAppointmentAt DateTime? @map("last_appointment_at") @db.Timestamptz(6)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  @@index([businessId])
  @@map("customers")
}
```

**onDelete convention split (decided):** `Message.customer`/`Feedback.customer` use
`onDelete: SetNull` with a NULLABLE `customerId` (lines 146, 215 — logs survive deletion).
`Customer.business` uses `onDelete: Cascade` (line 71). **Appointments ARE the customer's
history → use `onDelete: Cascade` with a NON-NULL `customerId`** (D-01, RESEARCH confirms).

**New model to add (mirror Cascade family + D-02 fields/index):**
```prisma
model Appointment {
  id         String   @id @default(uuid()) @db.Uuid
  businessId String   @map("business_id") @db.Uuid
  customerId String   @map("customer_id") @db.Uuid       // NON-NULL (differs from logs)
  date       DateTime @db.Timestamptz(6)                  // @map("date") optional; col already snake
  service    String?                                      // optional free-text, NOT a catalog (D-02)
  source     String?                                      // nullable: 'manual'|'csv'|'backfill'|future provider
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@index([customerId, date])          // newest-visit-per-customer + range query (D-02)
  @@map("appointments")
}
```
Also add to `Customer`: `appointments Appointment[]`, and to `Business`:
`appointments Appointment[]` (both back-relations — Prisma requires them).

---

### `prisma/migrations/<ts>_add_appointment_model/migration.sql` (NEW, migration)

**Analog:** `prisma/migrations/20260603002443_add_feedback/migration.sql` (full file).
The generated DDL will look exactly like the feedback one — UUID PK, `TIMESTAMPTZ(6)`,
`CREATE INDEX`, `ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE`:
```sql
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedback_business_id_idx" ON "feedback"("business_id");
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
> Note: the new appointment FK to `customers` must be `ON DELETE CASCADE` (NOT `SET NULL`
> like feedback's customer FK on line 29) — that is the deliberate difference.

**Net-new: hand-append the D-06 backfill block** after CreateTable/indexes/FKs:
```sql
-- Backfill: one seed appointment per customer with a known last visit (D-06).
INSERT INTO "appointments" ("id", "business_id", "customer_id", "date", "service", "source", "created_at")
SELECT gen_random_uuid(), c."business_id", c."id", c."last_appointment_at", NULL, 'backfill', CURRENT_TIMESTAMP
FROM "customers" c
WHERE c."last_appointment_at" IS NOT NULL;
```
> Assumption A1: `gen_random_uuid()` available on Supabase (pgcrypto). After backfill the
> D-04 invariant already holds for legacy rows — no `customers` UPDATE needed.

**Workflow:** `npm run db:migrate -- --name add_appointment_model`. The npm script wraps
Prisma in `dotenv -e .env.local` — RESEARCH corrects AGENTS.md (it reads `.env.local`,
NOT `.env`). Restart `npm run dev` after, so the new `Appointment` type loads.

---

### `lib/appointments.ts` — `recomputeLastAppointment` (NEW, utility)

**No direct analog.** Combines repo prisma usage + the `deleteCustomerAction` ownership
discipline. This is the single hook called by ALL FIVE mutation paths (D-04, Pitfall 1).
```ts
import { prisma } from "@/lib/prisma";
export async function recomputeLastAppointment(customerId: string, businessId: string) {
  const latest = await prisma.appointment.findFirst({
    where: { customerId, businessId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  await prisma.customer.updateMany({                       // updateMany re-checks businessId
    where: { id: customerId, businessId },
    data: { lastAppointmentAt: latest?.date ?? null },     // null when no appointments
  });
}
```
**Current `lastAppointmentAt` write-sites this must replace/augment:**
- `createCustomerAction` (`actions.ts` L54-62) — writes `lastAppointmentAt` directly today → must instead seed an appointment + recompute (D-07).
- `importCustomersAction` (`actions.ts` L100-108) — `createMany` writes `lastAppointmentAt` → seed appointments + single recompute pass per distinct new customer.
- (the rebooking READ site `rebooking.ts` L45-50 stays untouched.)
**Bulk rule:** recompute once per distinct affected `customerId` after the batch, never per-row.

---

### `lib/appointments-csv.ts` — `parseAppointmentsCsv` (NEW, utility)

**Analog:** `lib/csv-import.ts` (whole file). Mirror exactly: `ParsedCustomerRow` shape,
`HEADER_ALIASES`, `normalizeHeader`, Papa.parse options, per-row `errors[]`, result shape.

**Parser skeleton** (`csv-import.ts` L51-128):
```ts
const result = Papa.parse<Record<string, string>>(text, {
  header: true, skipEmptyLines: "greedy", transformHeader: normalizeHeader,
});
const headers = result.meta.fields ?? [];
if (!headers.includes("name")) return { rows: [], validCount: 0, invalidCount: 0, fatal: '...' };
// ... fatal checks ...
const rows = result.data.map((raw, i) => {
  const errors: string[] = [];
  const phone = normalizePhone((raw.phone ?? "").trim());
  if (phoneRaw && !phone) errors.push("Invalid phone number");
  let date: Date | null = null;
  if (raw.date) { const p = new Date(raw.date); if (Number.isNaN(p.getTime())) errors.push("Invalid date"); else date = p; }
  return { rowNumber: i + 2, name, phone, date, service, source, errors };
});
```

**Differences from the customer CSV (D-08/D-09):**
- Columns: `name`, `phone`, `date` REQUIRED (auto-create needs name+phone; visit needs date);
  `service`, `source` optional. Fatal if any of name/phone/date column missing.
- Add appointment header aliases mirroring the L25-44 style:
  `date|appointment_date|visit_date|appointment → date`, `service|treatment|reason → service`, `source`.
- Date error path reuse: `new Date(raw)` + `Number.isNaN(parsed.getTime())` → `"Invalid date"`
  (identical to `csv-import.ts` L106-113). Open Q1: normalize manual/CSV dates to midnight on insert for clean D-13 dedup.

---

### `app/(app)/customers/[id]/page.tsx` — detail RSC (NEW, route)

**Analog:** `app/feedback/[token]/page.tsx` (async `params`, Next.js 16).
```ts
export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const feedback = await prisma.feedback.findUnique({ where: { token }, include: { customer: {...} } });
  if (!feedback) notFound();
}
```
**Apply with scoping (the cross-business isolation guarantee, SC#4):**
```ts
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business } = await requireCurrentBusiness();
  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },                 // scoped → other business returns null
    include: { appointments: { orderBy: { date: "desc" } } },
  });
  if (!customer) notFound();                                 // 404 on miss OR wrong business
}
```
Header (name/phone/email/derived last visit) + `<VisitHistory>` timeline (newest first) +
"+ Add visit". Empty-state copy e.g. "No visits recorded yet" (D-11, Discretion).

---

### `app/(app)/customers/[id]/actions.ts` — appointment Server Actions (NEW, controller)

**Analog:** `app/(app)/customers/actions.ts` (form-state type, validate→mutate→revalidate,
ownership `deleteMany`). Each action: `requireCurrentBusiness` → verify the customer belongs
to this business → mutate → `recomputeLastAppointment` → `revalidatePath`.

**add-visit** (mirror `createCustomerAction` L20-66, add D-13 dedup + recompute hook):
```ts
const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId: business.id } });
if (!customer) return { error: "Customer not found." };
// date validation reuses createCustomerAction L45-52 (new Date + Number.isNaN)
const dupe = await prisma.appointment.findFirst({ where: { customerId, businessId: business.id, date, service } });
if (dupe) return { error: "That visit is already recorded." };   // D-13
await prisma.appointment.create({ data: { businessId: business.id, customerId, date, service, source: "manual" } });
await recomputeLastAppointment(customerId, business.id);          // D-04
revalidatePath(`/customers/${customerId}`); revalidatePath("/customers");
return { successAt: Date.now() };
```
**delete-visit** (mirror `deleteCustomerAction` L122-132 exactly):
```ts
await prisma.appointment.deleteMany({ where: { id, businessId: business.id } });  // ownership re-check (D-12)
await recomputeLastAppointment(customerId, business.id);          // may set null
revalidatePath(`/customers/${customerId}`); revalidatePath("/customers");
```
**import-appointments** (mirror `importCustomersAction` L80-116): server re-parse via
`parseAppointmentsCsv` → for each valid row, `normalizePhone` → match existing customer by
exact E.164 (scoped to business) or auto-create (D-09) → D-10 dedup (skip same date+service,
report count) → insert → one recompute per distinct customer. Return
`{ imported, skipped, successAt }`.

---

### `app/(app)/customers/[id]/add-visit-dialog.tsx` (NEW, component)

**Analog:** `add-customer-dialog.tsx` (whole file). `"use client"`, `useActionState`,
success-snapshot close (L33-52), form reset effect. Fields: date (`<input type="date">`,
like `lastAppointmentAt` L93-105), optional service text, hidden `customerId`.

### `app/(app)/customers/[id]/import-appointments-dialog.tsx` (NEW, component)

**Analog:** `import-customers-dialog.tsx` (whole file). Client preview via
`parseAppointmentsCsv(text)` in `handleFileChange` (L79-87), `PreviewTable` surfacing
per-row `errors` (L163-223) — bad rows shown, not dropped (SC#2). Disable submit unless
`!fatal && validCount > 0` (L89-90). Preview columns: Row / Name / Phone / Date / Service / Status.

### `app/(app)/customers/customers-table.tsx` (EDIT, component)

Make rows link to `/customers/[id]` (D-11) without breaking the existing `CustomerRowActions`
dropdown (L143-222). Wrap the name cell (L117) in a `Link`, or make the row navigable while
keeping the actions cell click from propagating. Keep the derived "Last appointment" column
(L99-101, L124-126) — it now reflects the maintained cache.

### `app/(app)/customers/actions.ts` (EDIT, D-07)

In `createCustomerAction` (L54-62) and `importCustomersAction` (L100-108): when a last-visit
value is provided, stop writing `lastAppointmentAt` directly — instead create the customer,
seed a backing `Appointment` (`source: "manual"` / `"csv"`, `service: null`), then
`recomputeLastAppointment`. For the bulk path: `createMany` customers, `createMany`
appointments, then one recompute per distinct new customerId. No orphaned last-visit values.

## No Analog Found

| File | Role | Reason | Planner guidance |
|------|------|--------|------------------|
| `lib/appointments.ts` (`recomputeLastAppointment`) | utility | No existing derive-cache helper in the repo | Build from the inline excerpt above; enforce `updateMany`+`businessId` ownership discipline borrowed from `deleteCustomerAction` |

Everything else has an exact or near-exact in-repo analog.

## Metadata

**Analog search scope:** `prisma/`, `prisma/migrations/`, `lib/`, `app/(app)/customers/`,
`app/feedback/[token]/`.
**Files read for excerpts:** schema.prisma, latest feedback migration.sql, csv-import.ts,
phone.ts, current-business.ts, customers/actions.ts, customers-table.tsx,
add-customer-dialog.tsx, import-customers-dialog.tsx, feedback/[token]/page.tsx, rebooking.ts.
**Pattern extraction date:** 2026-06-04
