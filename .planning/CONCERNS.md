# Concerns & Technical Debt

**Last updated:** 2026-06-06

A living, honest map of known debt, risk, and fragility. Most of it is **deliberate MVP
scope** (see `AGENTS.md` "Don't build yet"), not accidental — flagged here so it's tracked,
not so it's fixed prematurely. Severity = potential impact. Update this when debt is taken on
or paid down; it's the first doc to read during a "what should I worry about?" state eval.

## Technical Debt (intentional MVP shortcuts)

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Win-back is cadence-blind while rebooking is cadence-aware** | `lib/automations/rebooking.ts` | Medium | Rebooking now fires off each customer's *learned* interval, but win-back still uses a fixed 120–365-day window. So a customer whose own cadence is long (e.g. learned 200 days) and who's only ~150 days out is **not yet overdue** by rebooking, yet the fixed win-back window grabs them — they skip the gentle "you're due" nudge and jump to "we miss you." Also a thin-history customer (45-day default × 2 ceiling = 90) has a ~30-day **dead zone** (90–120 days) where neither pass fires. **Phase 3 (staged win-back) should make win-back cadence-aware to close this.** |
| **Query-based automation dedup** | `lib/automations/*.ts` | Medium | Dedup is done by querying the `Message` log (rebooking also reads `Appointment` history) — no scheduling columns. Correct and cheap now; gets harder to reason about and slower as the log grows. |
| **No retry / backoff on failed sends** | `lib/send-message.ts`, `lib/automations/run.ts` | Low–Medium | A failed Twilio/Resend call flips the row to `failed` and `console.error`s; nothing retries. Acceptable while volume is low. |
| **Single shared Twilio number** | `lib/twilio.ts`, `app/api/twilio/inbound/route.ts` | Medium | Inbound replies are attributed to the most-recent outbound SMS to that `From` number. With many businesses sharing one number, attribution can collide. Per-business numbers fix it but aren't built. |
| **Synchronous, all-businesses cron pass** | `lib/automations/run.ts` | Medium | `runAutomations()` enumerates every business and sends inline within one request. Fine at MVP scale; will outgrow a single serverless invocation (timeout / no concurrency control). |
| **Rename half-done** | repo-wide | Low | DB tables, package name, and many identifiers still say `reviewpilot`. Intentional — rename opportunistically, never break a migration/env. |

## Security

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Bearer token compared non-constant-time** | `app/api/cron/automations/route.ts` | Low | `header === \`Bearer ${secret}\`` is a plain string compare (timing side-channel). Low risk for a cron secret; a constant-time compare would harden it. The route otherwise **fails closed** when `CRON_SECRET` is unset. |
| **Webhook signature dev-bypass** | `app/api/twilio/{status,inbound}/route.ts` | Low (by design) | In dev, an invalid `X-Twilio-Signature` logs a warning and proceeds (so tunnels work); production enforces 403. Correct trade-off — just ensure `NODE_ENV` is genuinely `production` in prod. |
| **No app-level auth rate limiting** | `app/login/`, Supabase Auth | Low | Brute-force protection is delegated to Supabase Auth. No additional in-app throttling. |
| **Public feedback token is the only credential** | `app/feedback/[token]/`, `Feedback.token` | Low (by design) | The unguessable token gates the public rating page (no auth). Fine as long as the token is high-entropy and minted server-side (`lib/feedback.ts`). |
| **Integration secrets not yet modeled** | future | N/A | When OAuth tokens/webhook secrets land, they must be per-business + server-only, scoped with the same discipline as today's queries. Flagged so it isn't forgotten. |

## Performance & Scaling

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Index coverage for automation queries** | `prisma/schema.prisma` | Low–Medium | `appointments` has `@@index([customerId, date])` (serves the cadence/range reads) and `messages` is indexed for `businessId`, `(businessId, createdAt)`, `providerSid`, `customerId`, `missedLeadId`. But automation dedup also filters `messages` on `type` + `status` + `sentAt` with **no composite index** covering those, so dedup scans grow with log size. Add a targeted index when the log is large. |
| **List views hard-capped** | dashboard / table pages | Low | Tables fetch a fixed cap (~100 rows) with no pagination. Fine for early customers; revisit before a business has thousands of rows. |
| **Unbounded `messages` growth** | `messages` table | Low | Every attempt is stored (correct), but there's no archival/partition strategy. Long-horizon only. |
| **Console-only logging** | repo-wide | Low | Unattended cron failures go only to `console.error`. No structured logging / alerting — a silently failing nightly run could go unnoticed. |

## Fragile Areas (handle with care)

- **Find/send/preview symmetry** (`lib/automations/`) — the preview dry-run and the cron send
  share the same `find*`. A strength, but fragile: any new automation that sends without a
  matching `find*` (or whose `find*` diverges from what it sends) silently breaks the "Test my
  setup" guarantee. Always add `find*` → register in `run.ts` → add a `preview.ts` line → reuse
  `sendMessage()`.
- **`lastAppointmentAt` is a derived cache** (`lib/appointments.ts`) — it must always equal
  `MAX(appointment.date)`. Every appointment mutation path MUST call `recomputeLastAppointment`
  (bulk paths once per distinct customerId after the batch). A new path that writes
  `lastAppointmentAt` directly, or adds/removes appointments without recomputing, drifts the
  cache and corrupts cadence math.
- **Literal-placeholder feedback link** (`lib/render-template.ts` + `lib/feedback.ts`) —
  `{{feedbackLink}}` deliberately survives `renderTemplate()` as a literal so the pure
  find/preview path stays side-effect-free; it's minted only at send time. A change that
  "helpfully" resolves all placeholders in `renderTemplate` would break preview purity or
  double-mint tokens. Keep the mint at the send boundary.
- **Inbound reply attribution** (`app/api/twilio/inbound/route.ts`) — exact-string match on the
  `From` number depends on every stored phone being E.164-normalized at entry. `normalizePhone()`
  at every entry point is load-bearing.
- **Status webhook never downgrades `replied`** — the delivery-status handler must preserve a
  `replied` row; a refactor that blindly maps Twilio status → enum could clobber it.

## Dependency / External Risks

- **Twilio A2P 10DLC unapproved** — production SMS at scale is blocked until registration clears;
  testing goes through the Twilio Virtual Phone (`+18777804236`) over a tunnel (see
  `docs/twilio-testing.md`).
- **Resend in sandbox** — defaults to `onboarding@resend.dev` (owner-only delivery) until a
  verified domain sender is set via `RESEND_FROM_EMAIL`. Real customer email won't deliver until then.
- **Email delivery webhooks not wired** — Resend send works, but there's no delivery-status
  callback (unlike SMS), so email `Message` rows never advance past `sent`.
- **Prisma 5.22 + Supabase pooler coupling** — runtime uses the transaction pooler
  (`pgbouncer=true`, port 6543); migrations need `DIRECT_URL`. The Prisma CLI reads `.env` not
  `.env.local`, so migrations must go through the `dotenv-cli`-wrapped npm scripts.

## Missing Capabilities (planned, not bugs)

- No staged multi-touch win-back (today's win-back is one fixed-window touch) — **next milestone work**.
- No in-text reply routing into a structured inbox (communication layer). Low-rating `Feedback`
  rows (`resolvedAt == null`) are the seed, surfaced on `/feedback`, but there's no unified inbox.
- No integration layer (Square, GlossGenius, …) — CSV/manual is the only ingest.
- No analytics/ROI dashboard.
- No message-quota enforcement (the `messageQuotaLimit` / billing fields exist but are inert).
- No Stripe billing.

## Test Coverage

- **No automated test suite exists.** Validation is `npx tsc --noEmit` + `npm run lint` + manual
  browser/Supabase testing.
- Highest-value untested logic: automation dedup + cadence math (`computeIntervalDays`,
  `findRebookingNudges`), `resolveRecipient()` opt-out/missing-contact guards, inbound keyword
  classification (STOP/START), Twilio status mapping, and CSV import edge cases — all pure
  functions that would be cheap to unit test first.
