# Concerns & Technical Debt

**Analysis Date:** 2026-06-03

This is an honest map of known debt, risk, and fragility. Most of it is **deliberate
MVP scope** (see AGENTS.md "Don't build yet"), not accidental — flagged here so it's tracked,
not so it's fixed prematurely. Severity = potential impact; Confidence = how sure the analysis
is given a read-only pass (no runtime profiling, no tests exist).

## Technical Debt (intentional MVP shortcuts)

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Query-based automation dedup** | `lib/automations/*.ts` | Medium | Dedup is done by querying the `Message` log with fixed time windows — no scheduling columns. Correct for now; gets expensive and harder to reason about as the log grows. The pivot replaces fixed windows with per-customer learned cadence. |
| **No `Appointment` model** | `prisma/schema.prisma` | Medium | Rebooking is driven by a single `Customer.lastAppointmentAt`. Predictive cadence needs a real appointment history. Add with the integration layer. |
| **No retry / backoff on failed sends** | `lib/send-message.ts`, `lib/automations/run.ts` | Low–Medium | A failed Twilio/Resend call flips the row to `failed` and `console.error`s; nothing retries. Acceptable while volume is low. |
| **Single shared Twilio number** | `lib/twilio.ts`, `app/api/twilio/inbound/route.ts` | Medium | Inbound replies are attributed to the most-recent outbound SMS to that `From` number. With many businesses sharing one number, attribution can collide. Per-business numbers fix it but aren't built. |
| **Synchronous, all-businesses cron pass** | `lib/automations/run.ts` | Medium | `runAutomations()` enumerates every business and sends inline within one request. Fine at MVP scale; will outgrow a single serverless invocation (timeout / no concurrency control). |
| **Rename half-done** | repo-wide | Low | DB tables, package name, and many identifiers still say `reviewpilot`. Intentional — rename opportunistically, never break a migration/env. |

## Security

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Bearer token compared non-constant-time** | `app/api/cron/automations/route.ts:24` | Low | `header === \`Bearer ${secret}\`` is a plain string compare (timing side-channel). Low risk for a cron secret; a constant-time compare would harden it. The route otherwise **fails closed** when `CRON_SECRET` is unset (verified). |
| **Webhook signature dev-bypass** | `app/api/twilio/{status,inbound}/route.ts` | Low (by design) | In dev, an invalid `X-Twilio-Signature` logs a warning and proceeds (so tunnels work); production enforces 403. Correct trade-off — just ensure `NODE_ENV` is genuinely `production` in prod. |
| **No app-level auth rate limiting** | `app/login/`, Supabase Auth | Low | Brute-force protection is delegated to Supabase Auth. No additional throttling in-app. Acceptable if Supabase limits are relied on intentionally. |
| **Public feedback token is the only credential** | `app/feedback/[token]/`, `Feedback.token` | Low (by design) | The unguessable token gates the public rating page (no auth). Fine as long as the token is high-entropy and minted server-side (`lib/feedback.ts`). |
| **Integration secrets not yet modeled** | future | N/A | When OAuth tokens/webhook secrets land, they must be per-business + server-only and scoped with the same discipline as today's queries. Flagged now so it isn't forgotten. |

## Performance & Scaling

| Item | Where | Severity | Notes |
|------|-------|----------|-------|
| **Index coverage for automation queries** | `prisma/schema.prisma` | Low–Medium | `messages` is well-indexed for `businessId`, `(businessId, createdAt)`, `providerSid`, `customerId`, `missedLeadId`. But automation dedup also filters on `type` + `status` + `sentAt`; there's **no composite index** covering those, so dedup scans grow with log size. Add a targeted index when the log is large. |
| **List views hard-capped** | dashboard / table pages | Low | Tables fetch a fixed cap (~100 rows) with no pagination. Fine for early customers; revisit before a business has thousands of customers/messages. |
| **Unbounded `messages` growth** | `messages` table | Low | Every attempt is stored (correct), but there's no archival/partition strategy. Long-horizon concern only. |
| **Console-only logging** | repo-wide | Low | Unattended cron failures go only to `console.error`. No structured logging / alerting — a silently failing nightly run could go unnoticed. |

## Fragile Areas (handle with care)

- **Find/send/preview symmetry** (`lib/automations/`) — the preview dry-run and the cron send
  share the same `find*`. This is a *strength*, but it's also fragile: any new automation that
  sends without a matching `find*` (or whose `find*` diverges from what it sends) silently breaks
  the "Test my setup" guarantee. Always add `find*` → register in `run.ts` → add a `preview.ts`
  line → reuse `sendMessage()`.
- **Literal-placeholder feedback link** (`lib/render-template.ts` + `lib/feedback.ts`) — `{{feedbackLink}}`
  deliberately survives `renderTemplate()` as a literal so the pure find/preview path stays
  side-effect-free; it's minted and substituted only at send time. A future change that
  "helpfully" resolves all placeholders in `renderTemplate` would either break the preview's
  purity or double-mint tokens. Keep the mint at the send boundary.
- **Inbound reply attribution** (`app/api/twilio/inbound/route.ts`) — exact-string match on the
  `From` number depends on every stored phone being E.164-normalized at entry. A path that stores
  a non-normalized number would make replies unmatchable. `normalizePhone()` at every entry point
  is load-bearing.
- **Status webhook never downgrades `replied`** — the delivery-status handler must preserve a
  `replied` row; a refactor that blindly maps Twilio status → enum could clobber it.

## Dependency / External Risks

- **Twilio A2P 10DLC unapproved** — production SMS at scale is blocked until registration clears;
  testing currently goes through the Twilio Virtual Phone (`+18777804236`) over a tunnel
  (see `docs/twilio-testing.md`).
- **Resend in sandbox** — defaults to `onboarding@resend.dev` (owner-only delivery) until a
  verified domain sender is set via `RESEND_FROM_EMAIL`. Real customer email won't deliver until then.
- **Email delivery webhooks not wired** — Resend send works, but there's no delivery-status
  callback (unlike SMS), so email `Message` rows never advance past `sent`.
- **Prisma 5.22 + Supabase pooler coupling** — runtime uses the transaction pooler
  (`pgbouncer=true`, port 6543); migrations need `DIRECT_URL`. The Prisma CLI reads `.env` not
  `.env.local`, so migrations must go through the `dotenv-cli`-wrapped npm scripts. Easy footgun
  for a new contributor.

## Missing Capabilities (planned, not bugs)

- No message-quota enforcement (the `messageQuotaLimit` / billing fields exist but are inert).
- No Stripe billing.
- No structured inbox (communication layer) — low-rating `Feedback` rows (`resolvedAt == null`)
  are the seed, surfaced on `/feedback`, but there's no unified inbound inbox yet.
- No per-customer predictive rebook cadence.
- No integration layer (Square, GlossGenius, …) — CSV/manual is the only ingest.
- No analytics/ROI dashboard.

## Test Coverage

- **No automated test suite exists.** Validation is `npx tsc --noEmit` + `npm run lint` + manual
  browser/Supabase testing. See `TESTING.md` for the gap list and a proposed test roadmap.
- Highest-value untested logic: automation dedup correctness, `resolveRecipient()` opt-out/missing-
  contact guards, inbound keyword classification (STOP/START), Twilio status mapping, and CSV
  import edge cases — all pure functions that would be cheap to unit test first.

## Notes on Confidence

This pass was read-only: no code was executed, no queries profiled, and there is no test suite to
corroborate behavior. Items marked Low confidence elsewhere by the mapper (e.g. a "feedback link
double-substitution edge case" and a "review follow-up race condition") were **not reproduced** in
this analysis and are listed only as areas to verify — treat them as leads, not confirmed bugs.
