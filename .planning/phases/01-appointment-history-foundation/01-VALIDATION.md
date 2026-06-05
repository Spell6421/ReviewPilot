---
phase: 1
slug: appointment-history-foundation
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-04
task_ids_mapped: 2026-06-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` §Validation Architecture. No automated test suite exists in
> the repo yet (AGENTS.md), so validation is observable-behavior + SQL query assertions
> + the manual "Try it out" checklist. Task IDs assigned by the planner (4 plans, waves 1–3).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test suite in repo (AGENTS.md) |
| **Config file** | none — see Wave 0 Requirements |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && npx eslint .` |
| **Manual harness** | Browser + Supabase (`npm run db:studio`); Twilio Virtual Phone for any SMS round-trip |
| **Estimated runtime** | ~20–40s (type + lint) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` + `npx eslint <changed files>`
- **After every mutation-path task:** Run the cache-invariant SQL (below) + the matching row of the verification map
- **After every plan wave:** `npx tsc --noEmit && npx eslint .`
- **Before `/gsd-verify-work`:** Type + lint green, invariant SQL returns 0 rows, "Try it out" checklist green
- **Max feedback latency:** ~40 seconds (type/lint); manual checks per mutation path

---

## Plan / Wave Map

| Wave | Plan | Scope | Autonomous |
|------|------|-------|------------|
| 1 | 01-01 | Foundation: Appointment model + [BLOCKING] migration/backfill + recompute helper | no (migration prompt) |
| 2 | 01-02 | Slice: detail page + manual add/delete visit + clickable rows | yes |
| 2 | 01-03 | D-07: customer create/import seed a backing appointment | yes |
| 3 | 01-04 | Slice: appointments-CSV import (parser, action, dialog, fixture) | yes |

## Per-Task Verification Map

> Task IDs use `1-PP-TT` (phase-plan-task). The five cache-mutation paths (D-04): manual
> add (1-02-01), manual delete (1-02-01), customer create (1-03-01), customer import
> (1-03-02), appointments-CSV import (1-04-02) — each must call `recomputeLastAppointment`.

| Task ID | Requirement / SC | Secure Behavior | Test Type | Command / Concrete Check | Status |
|---------|------------------|-----------------|-----------|--------------------------|--------|
| 1-01-01 / 1-01-02 | APPT-01 | scoped by business.id | query | `db:studio` → `appointments` table exists; 2 visits for one customer → 2 rows | ⬜ pending |
| 1-02-01 / 1-02-02 | APPT-02 (manual) | action enforces `requireCurrentBusiness()` | manual + query | "+ Add visit" → row appears newest-first; DB row `source='manual'` | ⬜ pending |
| 1-04-01 / 1-04-02 / 1-04-03 | APPT-02 (CSV) | phone normalized E.164; auto-create scoped to business | manual + query | Upload CSV (repeated phone) → preview valid/skip counts → rows inserted; unmatched phone auto-creates customer (D-09) | ⬜ pending |
| 1-01-02 | APPT-03 (backfill) | legacy rows hold invariant | DB assertion | `SELECT count(*) FROM customers c WHERE c.last_appointment_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id=c.id)` → **0** | ⬜ pending |
| 1-02-01 | APPT-03 (invariant, add) | — | query | add visit newer than current last → `customers.last_appointment_at` equals it | ⬜ pending |
| 1-02-01 | APPT-03 (invariant, delete) | delete re-checks `businessId` in `where` | query | delete newest visit → cache = MAX of remaining, or NULL if none | ⬜ pending |
| 1-01-02 (regression) | APPT-03 (rebooking regression) | `rebooking.ts` query unchanged (D-05) | behavior | dashboard "Test my setup" returns same due-list pre/post migration for unchanged data | ⬜ pending |
| 1-02-01 / 1-02-02 / 1-04-02 | SC#4 (cross-business isolation) | `findFirst({where:{id,businessId}})` → 404; `deleteMany` where `businessId` matches 0 | manual / security | Business B's `/customers/<A's id>` → 404; crafted delete POST of A's appointment from B's session deletes nothing | ⬜ pending |
| 1-04-01 / 1-04-03 | SC#2 (bad-row surfacing) | invalid rows shown, not dropped | manual | CSV with a bad date / unparseable phone → preview lists rows with errors; import count excludes them | ⬜ pending |
| 1-02-01 / 1-04-02 | Dedup (D-10/D-13) | re-import idempotent | query | import same CSV twice → 2nd run reports skipped; count unchanged; same-day **different**-service row IS added | ⬜ pending |
| 1-03-01 / 1-03-02 | D-07 (no orphan last-visit) | — | query | add customer with a last-appointment date → backing `appointments` row (source `manual`/`csv`) exists AND `last_appointment_at` matches it | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Cache invariant — single global assertion (run after any mutation)

```sql
-- Must always return 0 rows. The core APPT-03 / D-04 safety net.
SELECT c.id
FROM customers c
LEFT JOIN (
  SELECT customer_id, MAX(date) AS max_date FROM appointments GROUP BY customer_id
) a ON a.customer_id = c.id
WHERE c.last_appointment_at IS DISTINCT FROM a.max_date;
```

---

## Wave 0 Requirements

> Planner decision: NO test framework added. The repo has no suite (AGENTS.md), and the
> two pure-function targets (`parseAppointmentsCsv`, `recomputeLastAppointment`) are
> covered by `<behavior>` blocks on their producing tasks (1-04-01, 1-01-03, 1-02-01,
> 1-03-01/02) plus the type/lint gate and the global invariant SQL. Validation stays
> manual/query-based by necessity (MEDIUM confidence — acknowledged in RESEARCH.md).
> Adding a runner is deferred (not required to ship this phase; revisit in Phase 2 where
> cadence math has richer pure-function surface).

- [x] **Test-framework decision made:** none added; behavior blocks + invariant SQL + type/lint gate substitute (see above).
- [ ] **Sample `appointments.csv` fixture** — created by Task 1-04-01 at `lib/fixtures/appointments.sample.csv`: repeated phones (multi-visit), one bad date, one unparseable phone, one exact-dupe, one same-day-different-service row.

*`wave_0_complete` flips to true once Task 1-04-01 lands the fixture.*

---

## Manual-Only Verifications

| Behavior | Requirement | Covering Task(s) | Why Manual | Test Instructions |
|----------|-------------|------------------|------------|-------------------|
| Visit timeline renders newest-first with per-row delete | APPT-01 / APPT-02 | 1-02-02 | UI rendering, no test harness | Open `/customers/[id]` → visits sorted newest-first, each with a delete control |
| CSV preview surfaces bad rows | SC#2 | 1-04-03 | UI + file upload | Upload CSV with bad date/phone → preview lists those rows with errors; they are excluded from import count |
| Cross-business isolation | SC#4 | 1-02-01 / 1-02-02 / 1-04-02 | requires two business sessions | Sign in as Business B, open A's customer/appointment id → 404 / no-op delete |
| Rebooking still fires post-migration | APPT-03 / ENGN | 1-01-02 | requires cron/preview run | Dashboard "Test my setup" preview returns correct due-list off the derived cache |

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify (type/lint/query) or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has `npx tsc --noEmit` + eslint)
- [x] Wave 0 covers the framework decision + the CSV fixture (decision = no runner; fixture = Task 1-04-01)
- [x] No watch-mode flags
- [x] Feedback latency < 40s for type/lint gate
- [x] `nyquist_compliant: true` set in frontmatter (task IDs mapped)

**Approval:** task IDs mapped 2026-06-05; ready for `/gsd-execute-phase 1`.
