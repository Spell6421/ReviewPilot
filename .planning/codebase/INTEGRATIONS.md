# External Integrations

**Analysis Date:** 2026-06-03

## APIs & External Services

**SMS Messaging:**
- Twilio - SMS send, delivery status tracking, inbound SMS reply handling, carrier opt-out compliance
  - SDK/Client: `twilio` v6.0.2 (`lib/twilio.ts`)
  - Auth: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (env vars)
  - Outbound: `TWILIO_PHONE_NUMBER` (E.164, e.g. +18557743033)
  - Status Callback: `TWILIO_STATUS_CALLBACK_URL` (optional public webhook)
  - Webhook Endpoints:
    - `POST /api/twilio/status` - Delivery status updates (queued → sent → delivered / failed)
    - `POST /api/twilio/inbound` - Inbound SMS replies + STOP/START opt-out handling

**Email Messaging:**
- Resend - Email send via verified domain or sandbox
  - SDK/Client: `resend` v6.12.4 (`lib/resend.ts`)
  - Auth: `RESEND_API_KEY` (env var, server-only)
  - From Address: `RESEND_FROM_EMAIL` (optional; defaults to `onboarding@resend.dev` sandbox, owner-only delivery)
  - Status: Delivery webhooks not yet wired (send path only)

**Authentication & Identity:**
- Supabase Auth - Email/password authentication
  - Implementation: OAuth-less custom email/password via Supabase `auth.users` table
  - Clients: `@supabase/supabase-js` v2.46.1 (browser), `@supabase/ssr` v0.5.2 (server)
  - Browser Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, safe in browser)
  - URL: `NEXT_PUBLIC_SUPABASE_URL`
  - Session Management: Cookie-based via `lib/supabase/middleware.ts` (refreshed on every request)
  - Protected Routes: `/dashboard`, `/customers`, `/missed-leads`, `/messages`, `/settings`, `/billing`, `/onboarding`

## Data Storage

**Databases:**
- PostgreSQL (Supabase Postgres) - Primary data store
  - Connection: `DATABASE_URL` (transaction pooler, port 6543, pgbouncer=true) for runtime queries
  - Migrations: `DIRECT_URL` (direct/session connection) for schema changes
  - Client: Prisma 5.22.0 ORM
  - Schema: `prisma/schema.prisma`
  - Tables (models):
    - `businesses` (Business) - business account (one per Supabase auth user)
    - `customers` (Customer) - contacts with phone/email + SMS opt-out tracking
    - `message_templates` (MessageTemplate) - editable message bodies per business
    - `messages` (Message) - sent/received message log (SMS & email, outbound & inbound replies)
    - `missed_leads` (MissedLead) - manually entered leads after missed calls
    - `feedback` (Feedback) - feedback requests (pending/answered) for review gating

**File Storage:**
- Local filesystem only (for uploads within Next.js public/ or temp storage)
- CSV import: Parsed in memory via papaparse, data inserted into `customers` + `missed_leads`

**Caching:**
- None (no Redis, Memcached, or distributed cache layer)
- Next.js default ISR/SWR for static/dynamic rendering

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (custom email/password, no OAuth providers wired yet)
  - Email/Password Sign-Up: `app/auth/actions.ts` (custom form)
  - Sign-In: `app/login/{page,actions}.tsx`
  - Sign-Out: `app/auth/actions.ts` (server action)
  - Session Refresh: Middleware on every request (`lib/supabase/middleware.ts` calls `getUser()`)
  - Scope: One user owns exactly one business (`Business.ownerId` = `auth.users.id`)
  - No team roles, multi-location, or granular permissions (MVP model)

**Data Scoping:**
- Every query scoped by `business.id` (never expose one business's data to another)
- Prisma relations: `Customer`, `Message`, `MissedLead`, `Feedback` all have `businessId`
- Destructive actions re-check ownership in the `where` clause to prevent CSRF
- Server Actions enforce auth at the action boundary (not just UI)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Rollbar, or error service)
- Errors logged to `console.error` (Node.js stdout/Vercel logs)

**Logs:**
- Twilio webhook signature validation: `console.warn` in dev, `403 Forbidden` in prod
- Automation engine failures: `console.error` with recipient + reason
- No structured logging library (plain `console.*`)

## CI/CD & Deployment

**Hosting:**
- Vercel (primary target)
  - Cron trigger: `/api/cron/automations` via `vercel.json` schedule
  - Auto-deploys on git push to main
  - Environment variables via Vercel dashboard

**Alternative Hosting:**
- Any Node.js host (Heroku, Railway, self-hosted)
- Requires external cron scheduler (e.g., EasyCron, AWS Lambda, custom scheduled task)

**CI Pipeline:**
- None built-in (Vercel auto-builds on push)
- Manual checks: `npm run lint` (ESLint), `npx tsc --noEmit` (TypeScript)

## Automation Trigger

**Cron Job:**
- Vercel Cron (`vercel.json`): Daily at `0 14 * * *` (14:00 UTC)
- Manual trigger: `curl -X POST /api/cron/automations -H "Authorization: Bearer ${CRON_SECRET}"`
- Handler: `app/api/cron/automations/route.ts` (shared GET/POST handler)
- Gate: Bearer token `CRON_SECRET` (fails closed if unset)
- Runs: `lib/automations/run.ts` → `runAutomations()`
  - Enumerates all businesses
  - Executes: review follow-up, rebooking/win-back, missed-call follow-up
  - Uses: `lib/send-message.ts` core (reuses same send path as manual UI)

## Environment Configuration

**Required env vars (to function):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `DATABASE_URL` - Postgres pooler connection
- `DIRECT_URL` - Postgres direct connection (migrations)

**Required for SMS (Twilio):**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (E.164)

**Required for Email (Resend):**
- `RESEND_API_KEY`

**Required for Automation Gate:**
- `CRON_SECRET` - Automation endpoint bearer token

**Optional env vars:**
- `NEXT_PUBLIC_APP_URL` - Base URL for public links (feedback pages); defaults to `http://localhost:3000`
- `TWILIO_STATUS_CALLBACK_URL` - Webhook for Twilio delivery status (auto-wired on send if set)
- `RESEND_FROM_EMAIL` - Verified sender domain; defaults to `onboarding@resend.dev`

**Secrets location:**
- `.env.local` (gitignored) for development
- Vercel dashboard environment variables for production
- Never commit secrets to git

## Webhooks & Callbacks

**Incoming (from external services):**
- Twilio → `POST /api/twilio/status` (delivery status: queued/sent/delivered/failed)
  - Query param: `MessageSid`, `MessageStatus` (or `SmsSid`, `SmsStatus`)
  - Signature validation: `X-Twilio-Signature` header
  - Response: `204 No Content` (even on no-op, so Twilio doesn't retry)
- Twilio → `POST /api/twilio/inbound` (incoming SMS reply)
  - Query param: `From` (sender phone E.164), `Body`, `MessageSid`
  - Signature validation: `X-Twilio-Signature` header
  - Response: `200 OK` (empty TwiML so Twilio doesn't auto-reply)
  - Logic: Find most recent outbound SMS to that `From` number, link as reply, handle STOP/START opt-out

**Outgoing (to external services):**
- `lib/send-message.ts` → Twilio `messages.create()` (SMS send)
  - Includes `statusCallback` if `TWILIO_STATUS_CALLBACK_URL` is set
- `lib/send-message.ts` → Resend `emails.send()` (email send)
  - No outbound webhooks currently wired

**Webhook Verification:**
- Twilio: `parseTwilioWebhook()` validates `X-Twilio-Signature` header
  - Production: `403 Forbidden` on invalid signature
  - Dev: `console.warn` and proceed (tunnel proxies can break signature)

## Billing & Payments

**Stripe:**
- Not yet implemented
- Schema fields present but unused: `Business.stripeCustomerId`, `stripeSubscriptionId`, `plan`, `messageQuotaLimit`
- `/billing` page stub exists but non-functional

## Integration Patterns

**Message Send Core:**
- Single unified path: `lib/send-message.ts` → `sendMessage()`
- Used by: Manual UI sends (`messages/actions.ts`, `missed-leads/actions.ts`) + automation cron
- Flow:
  1. Resolve recipient: `resolveRecipient()` (guards opt-out, missing phone/email)
  2. Insert `Message` as `queued`
  3. Send via `sendSms()` (Twilio) or `sendEmail()` (Resend)
  4. Update `Message` to `sent` + `providerSid` or `failed`
  5. For feedback-linked templates: `fillFeedbackLink()` mints a `Feedback` token

**Automation Find/Send Symmetry:**
- Pure `find*` functions return `DueSend[]` (no side effects)
- Same `find*` used by: automation cron + dashboard preview ("Test my setup")
- Guarantees dry-run counts === actual cron counts
- Never sends outside this symmetry

**CSV Import:**
- `lib/csv-import.ts` (papaparse)
- Columns: `name`, `phone`, `email`, `last_appointment_at`
- Aliases: `mobile`→phone, `last_visit`→date
- Validation: E.164 phone normalization, name + (phone OR email) required
- Response: Preview with pass/skip/error counts, surface fatal file errors

---

*Integration audit: 2026-06-03*
