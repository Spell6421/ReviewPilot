<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository. `CLAUDE.md` just imports this file via `@AGENTS.md`, so this is the single source of truth — keep it current as the app evolves. For the *product* vision and the reasoning behind the pivot, see [`docs/product-vision.md`](docs/product-vision.md); this file is the engineering source of truth.

## Project

**Backbooked** (formerly *ReviewPilot*) — a small SaaS for local service businesses.

> **Backbooked connects to your booking and phone systems to automatically recover missed
> calls, bring back inactive customers, and turn happy appointments into more reviews.**

Target users: barbers, med spas, dentists, tattoo shops, cleaners, auto detailers,
photographers, tutors, and similar appointment-based local businesses.

The product positioning is **"stay backbooked"** — keep the calendar full by recovering
the revenue an owner never sees: the missed call, the regular who quietly stopped coming,
the happy client who never left a review.

> **Naming note:** the rename from ReviewPilot → Backbooked is *in progress*. The repo
> directory, package name, DB tables, and many code identifiers still say `reviewpilot`/
> review-centric names. Don't do a mass rename yet — rename opportunistically as you touch
> files, and never break a migration or env var just to change a label.

### The four layers

The whole app is organized as four stacked layers. Use these names when discussing scope:

1. **Integration layer** — connect to the systems owners already use (Square, GlossGenius,
   Booksy, Vagaro, Acuity, Fresha, …) and their phone/SMS provider, to pull customers +
   appointment history and receive events (appointment completed, missed call) without
   manual CSVs. CSV/manual entry stays as the universal fallback. **Not built yet.**
2. **Automation layer** — the meat. Four unattended automations:
   - **Review request + feedback gating** — after an appointment, ask for feedback; happy
     replies → route to a Google review; unhappy replies → route *privately* to the owner
     (the inbox), protecting the public rating.
   - **Predictive rebook reminders** — learn each customer's visit cadence and nudge them
     when due (start from a default interval, then per-customer frequency).
   - **Missed-call follow-up** — text/email after a missed call.
   - **Win-back** — staged messages (~60/120/360 days) to recover cold customers.
   - *Built: rebooking is now per-customer predictive; review + missed-call follow-ups and the
     feedback-gated rating page work. Remaining: staged win-back (today's win-back is a single
     fixed-window touch). See "Automation engine".*
3. **Communication layer** — a single, structured, sortable inbox for everything inbound
   (replies, routed negative feedback, opt-outs). **Not built yet** (replies are currently
   only counted on the dashboard).
4. **Analytics layer** — a down-to-earth ROI dashboard (reviews generated, calls recovered,
   customers rebooked, revenue brought back) — not generic SaaS charts. **Not built yet.**

### Current state (honest)

The app is the bare foundation of layers 2–3:

- Customers added **manually or via CSV** (E.164 normalization + validation).
- **SMS (Twilio) + email (Resend)** sending works, with the full SMS loop: delivery-status
  webhook, inbound-reply webhook, STOP/opt-out.
- An **automation engine** (`lib/automations/`) — review follow-up, predictive rebooking,
  win-back, missed-call follow-up — runs via a cron route with a dry-run preview. Rebooking
  now learns each customer's cadence from real `Appointment` history; the feedback-gated rating
  page routes off the 1–5 score (happy → Google, unhappy → owner). Still naive: win-back is a
  single fixed-window touch (not yet staged), and in-text reply routing into an inbox isn't built.

**Not built:** any integration, staged multi-touch win-back, in-text reply routing into a
structured inbox, the analytics/ROI dashboard, and billing (Stripe). Prefer simple,
readable implementations over abstraction.

## Tech stack (actual)

- **Framework:** Next.js **16.2.6** (App Router) + React **19.2** + TypeScript 5
- **Styling:** Tailwind **v4** + shadcn/ui (`radix-ui` primitives, `radix-nova` style) + `lucide-react` icons
- **ORM:** Prisma **5.22** → Supabase Postgres
- **Auth:** Supabase Auth via `@supabase/ssr` (email/password)
- **SMS:** Twilio **v6** — **fully wired** (send + delivery webhook + inbound/reply webhook + opt-out)
- **Email:** Resend **v6** — **wired** (send path; delivery webhooks not yet)
- **Automation:** in-app engine (`lib/automations/`) triggered by a **Vercel Cron** job hitting a secret-gated route — review follow-up, **predictive** rebooking, win-back (still fixed-window), missed-call follow-up
- **Integrations:** booking/phone platforms (Square, GlossGenius, …) — **not yet implemented**
- **Billing:** Stripe — **not yet implemented**
- **Hosting:** Vercel (intended)

Don't add a separate backend framework (NestJS, etc.) — Next.js server actions + route handlers are the backend. Don't add dependencies unless they solve an immediate problem.

## Project layout

**No `src/` directory.** `app/`, `components/`, `lib/`, `hooks/`, `prisma/` all live at the repo root. The `@/*` import alias maps to the root (`@/lib/twilio`, `@/components/ui/button`).

```text
app/
  layout.tsx                 # root layout: fonts, metadata, <TooltipProvider>
  globals.css                # Tailwind v4 + shadcn theme tokens
  page.tsx                   # / — landing page
  login/{page,actions}.tsx   # /login — email/password sign in + sign up
  onboarding/{page,actions}  # /onboarding — first-run business setup
  auth/actions.ts            # sign-out action
  (app)/                     # authed route group — shares the sidebar shell
    layout.tsx               # sidebar + header; gates on requireCurrentBusiness()
    dashboard/page.tsx       # /dashboard — stat cards + recent messages
    customers/               # /customers — table, add dialog, CSV import, send dialog
    messages/                # /messages — message history + send action
    missed-leads/            # /missed-leads — manual lead log + recovery send
    dashboard/{actions,automation-check}.tsx  # "Test my setup" preview (dry run)
    settings/                # /settings — business profile + template editor
    billing/page.tsx         # /billing — plans (UI only)
  api/twilio/
    status/route.ts          # Twilio delivery status callback (POST)
    inbound/route.ts         # Twilio inbound SMS / replies + STOP handling (POST)
  api/cron/automations/route.ts  # secret-gated automation trigger (GET=Vercel cron, POST=manual)
lib/
  prisma.ts                  # singleton PrismaClient
  supabase/{server,client,middleware}.ts   # Supabase SSR clients
  current-business.ts        # getCurrentUser / requireCurrentUser / requireCurrentBusiness
  twilio.ts                  # sendSms, webhook parse/verify, status map, opt-out keywords
  resend.ts                  # sendEmail
  send-message.ts            # shared send core: resolveRecipient + sendMessage (UI + cron)
  automations/               # the automation engine (see "Automation engine")
    run.ts                   #   findDueSends (preview) + runAutomations (cron sends)
    preview.ts               #   buildAutomationPreview — connection checks + dry-run counts
    review-follow-up.ts | rebooking.ts | missed-call.ts  # per-automation find* lookups
    types.ts                 #   DueSend / AutomationKind
  phone.ts                   # normalizePhone() → E.164
  csv-import.ts              # CSV parse + per-row validation (papaparse)
  render-template.ts         # {{businessName}} / {{customerName}} / {{reviewLink}}
  default-templates.ts       # seed templates + label/variant maps for badges
  utils.ts                   # cn() class-merge helper
components/app-sidebar.tsx   # primary nav;  components/ui/ = shadcn components
hooks/use-mobile.ts          # used by the sidebar
proxy.ts                     # request middleware (see note below)
vercel.json                  # Vercel Cron schedule for /api/cron/automations
prisma/schema.prisma         # source of truth for the data model
docs/product-vision.md       # the pivot brief / product vision
```

The `(app)` route-group parentheses don't appear in the URL. Marketing/auth pages (`/`, `/login`, `/onboarding`) sit outside it, with no sidebar.

> As the four layers get built, expect new top-level homes: integrations under
> `lib/integrations/` + `app/(app)/integrations/`, the inbox under `app/(app)/inbox/`, and
> analytics queries under `lib/analytics/`. Keep business logic in small `lib/` functions
> and pages thin.

### `proxy.ts` is the middleware

This Next.js renames `middleware.ts` → **`proxy.ts`** (exports a `proxy()` function, not `middleware()`). It runs `updateSession()` from `lib/supabase/middleware.ts` on every non-asset request to refresh the Supabase auth cookie. If you need request-level logic, edit `proxy.ts` — don't create `middleware.ts`.

## Auth & data scoping

- **One user owns exactly one business** (`Business.ownerId` = Supabase `auth.users.id`). No team roles, no multi-location.
- Prisma does **not** model `auth.users` — it just stores `ownerId` as a UUID and scopes every query by it.
- Every page under `app/(app)/` and every mutating action calls one of the helpers in `lib/current-business.ts`:
  - `requireCurrentUser()` → redirects to `/login` if signed out.
  - `requireCurrentBusiness()` → also redirects to `/onboarding` if the user has no business yet; returns `{ user, business }`.
- **Always scope reads and writes by `business.id`.** Never expose one business's customers/messages/leads to another. Destructive actions (`delete*`) re-check ownership in the `where` clause so a crafted POST can't touch another business's row.
- Server Actions are reachable by direct POST — auth/ownership must be enforced *inside* the action, not just in the UI.
- **Integration credentials** (OAuth tokens, webhook secrets) will be per-business and server-only secret — when that layer lands, scope and store them with the same discipline; never leak another business's tokens or events.

## Database & migrations

- Two connection strings in `.env.local`: `DATABASE_URL` (Supabase transaction pooler, port 6543, `pgbouncer=true`) for the runtime client, and `DIRECT_URL` (session/direct) for migrations.
- **Gotcha:** the Prisma CLI reads `.env`, **not** `.env.local`. Run migrations through the npm scripts, which wrap Prisma in `dotenv-cli -e .env.local`:

  ```bash
  npm run db:migrate -- --name your_migration_name   # create + apply in dev
  npm run db:deploy                                   # apply in prod/CI
  npm run db:studio                                   # Prisma Studio
  npm run db:generate                                 # regenerate client
  ```

  Running `npx prisma migrate` directly fails with "Environment variable not found: DIRECT_URL".
- After a schema change + migrate, the client is regenerated automatically; **restart `npm run dev`** so new types load.

## Server Action conventions

Mutations are server actions (`"use server"`) used with React's `useActionState`. The established shape:

- Return a serializable **form-state object**, not a thrown error: `{ error?: string; successAt?: number }` (some add `imported`/`skipped`). The dialog watches `successAt` to close/reset.
- Signature is `(_prev: State, formData: FormData) => Promise<State>`.
- Read fields with `String(formData.get("x") ?? "").trim()`, validate, then mutate, then `revalidatePath(...)` for every affected route.
- Inline validation with clear user-facing messages — no validation library.
- `redirect()` (auth/onboarding flows) throws control-flow, so call it *after* any cleanup.

## Data model

`prisma/schema.prisma` is the source of truth. Current models (snake_case tables via `@@map`):

- **Business** — `ownerId`, `name`, `phone`, `googleReviewLink`, plus billing fields not yet active (`plan`, `messageQuotaLimit`, `currentPeriodStart`, `stripeCustomerId`, `stripeSubscriptionId`).
- **Customer** — `name`, `phone` (E.164), `email`, `lastAppointmentAt`, `smsOptedOut` + `smsOptedOutAt` (STOP handling).
- **MessageTemplate** — `type` + `body`, unique per `(businessId, type)`. Seeded from `DEFAULT_TEMPLATES` on business creation.
- **Message** — `channel` (sms/email), `type`, `body`, `status`, `sentAt`, `providerSid` (Twilio SID, for webhook mapping); links to a `Customer` *or* `MissedLead` (both nullable, `SetNull` on delete) so the log survives row deletion.
- **MissedLead** — `name`, `phone`, `notes`, `status`.
- **Feedback** — `token` (the public rating-page credential), `rating` (1–5; null = pending),
  `comment`, `submittedAt`, `resolvedAt` (inbox triage); links to `Customer` (SetNull). Minted
  per review-request send; drives `/feedback/[token]` and the non-gating happy/unhappy routing.
- **Appointment** — `customerId` (NON-null, Cascade — owned visit history), `date`, optional
  `service`/`source`. The per-visit history behind `Customer.lastAppointmentAt` (a derived cache
  kept correct by `recomputeLastAppointment` in `lib/appointments.ts`); drives predictive rebooking.

Enums: `MessageChannel{sms,email}`, `MessageType` / `MessageTemplateType` `{review_request, review_follow_up, rebooking_reminder, missed_call_recovery, missed_call_follow_up, win_back}`, `MessageStatus{draft,queued,sent,failed,replied}`, `MissedLeadStatus{new,contacted,booked,lost}`, `BillingPlan{starter,pro,scale}`.

> **Model gaps remaining** (don't add speculatively — add when you build the layer):
> integration/connection rows (provider, tokens, sync cursors) for the integration layer; an
> inbox/thread shape for the communication layer. *(The `Appointment` and `Feedback` models now
> exist — see above — so predictive rebooking and rating-page gating are no longer blocked on schema.)*

## Messaging system (as built)

The full SMS loop works. When extending it, stay conservative.

**Send flow** — all sends (manual UI *and* automation) go through **`lib/send-message.ts`**: `sendMessage()` resolves the recipient via `resolveRecipient()` (guards opt-out / missing phone / missing email → returns a `skipped` reason instead of a row), inserts the `Message` as `queued`, sends via `sendSms()` (`lib/twilio.ts`) or `sendEmail()` (`lib/resend.ts`), then flips to `sent` (+ `providerSid`) or `failed`. SMS normalizes to E.164 as a safety net; email derives a subject from the type (`messageEmailSubjects`) prefixed with the business name. The UI actions (`messages/actions.ts`, `missed-leads/actions.ts`) just validate input, look up the customer/lead, call `sendMessage()`, and map its result to form-state copy.

**Templates:** `renderTemplate(body, vars)` fills `{{businessName}}`, `{{customerName}}`, `{{reviewLink}}`. A variable the caller doesn't supply is left as a *literal* placeholder — that's how `{{feedbackLink}}` survives rendering and is minted + substituted at send time by `sendMessage` (`lib/feedback.ts` → `fillFeedbackLink`), keeping the pure `find*`/preview path side-effect-free. Editable per-business in Settings.

**Feedback-gated reviews (built):** the `review_request` / `review_follow_up` seed copy points at `{{feedbackLink}}`, not straight at Google. Each send mints a `Feedback` row (token) and the public page `app/feedback/[token]/` lets the customer rate 1–5. Routing is intentionally **non-gating** (Google policy + FTC): high ratings (≥ `POSITIVE_RATING_THRESHOLD`, =4) lead with the Google CTA; low ratings lead with a private comment box that lands in the owner's `/feedback` inbox — but the public path stays reachable for everyone. Branch on the rating, never on a sentiment model. `findReviewFollowUps` excludes anyone who already rated. Existing businesses keep their old saved templates until they edit them in.

**Webhooks (`app/api/twilio/`):**
- `status/route.ts` — delivery callbacks (`queued→sent→delivered`/`failed`), mapped onto our enum and matched by `providerSid`. Wired via the `TWILIO_STATUS_CALLBACK_URL` env (passed as `statusCallback` on each send). Never downgrades a `replied` row.
- `inbound/route.ts` — incoming replies. Attributes the text by finding the most recent outbound SMS to that `From` number, then stores a new `replied` Message (this is what the dashboard's "replies" counts; the outbound `sent` row is untouched). A bare `STOP`/`UNSUBSCRIBE`/etc. sets `Customer.smsOptedOut`; `START`/`YES`/`UNSTOP` clears it.
- Both verify the `X-Twilio-Signature` (enforced in production; dev logs a warning and proceeds so tunnels work).
- **Feedback gating (future, communication layer):** today an inbound reply just becomes a `replied` row and a count. The review automation's "happy → Google / unhappy → owner" routing will hook in here — classify the reply, then either surface the review link or route the message into the inbox. Build it *on top of* this attribution logic, don't replace it.

**Phone numbers:** always normalize to E.164 via `normalizePhone()` at entry (manual add, CSV import, missed-lead create). It's US-default and dependency-free; swap in `libphonenumber-js` if international is ever needed. Inbound matching is exact-string, so normalization keeps replies matchable.

**Rules of the road:** store every attempt; one-at-a-time manual sends (no bulk blasting); at most one follow-up after a review request; include business identity; honor opt-out before any production sending.

**Testing without A2P approval:** see `docs/twilio-testing.md`. A2P 10DLC is unapproved, so test the real round-trip via the Twilio **Virtual Phone** (`+18777804236`) over a `cloudflared`/ngrok tunnel; set a test customer's phone to that number.

## Automation engine (the automation layer, as built)

Unattended, schedule-driven sends. Lives in `lib/automations/` and reuses the same `sendMessage()` core as the UI. This is the **current, naive seed** of the automation layer — it works, but it dedups by querying the `Message` log and uses fixed time windows. The vision adds per-customer cadence learning and feedback gating on top.

**Trigger:** `app/api/cron/automations/route.ts` — a route handler gated by a `CRON_SECRET` bearer token (fails closed if unset). **Vercel Cron** (`vercel.json`, daily) hits it with **GET** and Vercel attaches the `Authorization: Bearer ${CRON_SECRET}` header automatically; **POST** is the same handler for manual/local triggering (`curl -X POST … -H "Authorization: Bearer <secret>"`). There's no logged-in user, so `runAutomations()` enumerates **all** businesses and each automation scopes its own queries by `business.id`.

**Find/send split:** every automation is a pure **`find*`** lookup returning `DueSend[]` (the exact messages it would send) plus the shared send step in `run.ts`. This lets the dashboard **preview** (`buildAutomationPreview` → the "Test my setup" card) count *exactly* what the cron will send without sending — the two can't drift. `find*` filters to reachable recipients via `resolveRecipient()` so counts are honest. Failed sends are `console.error`'d with recipient + reason (automation runs unattended). **Preserve this find/send/preview symmetry** when you make the automations smarter — predictive rebooking should still be a `find*` that the preview can dry-run.

**The three automations** (all dedup query-only against the `Message` log — no scheduling columns):
- **review follow-up** (`review-follow-up.ts`): a `review_request` that went `sent` 2–30 days ago, to a customer with no `review_follow_up` yet and who hasn't `replied`. One per request (the 30-day ceiling stops a first-run blast). Follows up on the original request's channel.
- **rebooking / win-back** (`rebooking.ts`): two passes off the customer's `Appointment` history (summarized by the `lastAppointmentAt` cache). **Predictive `rebooking_reminder`** — nudges a customer once they pass *their own* learned cadence (median gap between past visits; 45-day default when history is thin; clamped 14–365 days; an overdue ceiling of 2× hands the very-late off to win-back). **`win_back`** — still a fixed 120–365-day window, single touch. Win-back runs after rebooking and excludes anyone rebooked in the same run, so a customer never gets both in one pass. Dedup = no nudge of that type since the last appointment; a new booking recomputes cadence and re-arms eligibility. Prefers SMS, falls back to email. *(Remaining: staged multi-touch win-back — Phase 3.)*
- **missed-call follow-up** (`missed-call.ts`): a lead still in `contacted` whose `missed_call_recovery` went `sent` 2–30 days ago, with no `missed_call_follow_up` yet and no reply. Sends as its own `missed_call_follow_up` type (SMS-only; leads have no email).

**Rules of the road** still apply: at most one follow-up per anchor, honor opt-out (the send core does), store every attempt. When adding an automation: write a `find*` returning `DueSend[]`, register it in `run.ts` (`findDueSends` + the send tally), add a preview line in `preview.ts`, and reuse `sendMessage()` — never send directly.

## CSV import

`lib/csv-import.ts` (papaparse). Canonical columns `name,phone,email,last_appointment_at`, with header aliases (e.g. `mobile`→phone, `last_visit`→date). Each row needs a name and either a phone or email; phones normalize to E.164, and a provided-but-unparseable phone is flagged "Invalid phone number" in the preview rather than silently dropped. Never crash on imperfect files; surface a fatal file-level error for a missing required column. CSV stays the **universal fallback** even once integrations exist.

## UI (shadcn/ui)

Configured in `components.json` (`radix-nova` style, lucide icons, Tailwind v4 tokens in `app/globals.css`). Add components with the CLI — don't hand-write them:

```bash
npx shadcn@latest add <component>
```

Use semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-sidebar`) — never raw colors. Reuse existing `components/ui/*` before writing custom markup. Status badges use the `*StatusVariant()` helpers in `lib/default-templates.ts`.

## Commands

```bash
npm run dev        # http://localhost:3000
npm run build      # prisma generate && next build
npm run lint       # eslint
# DB: see "Database & migrations" above (db:migrate / db:deploy / db:studio)
```

Verify changes with `npx tsc --noEmit` and `npx eslint <files>`; there's no automated test suite yet.

## Environment variables (`.env.local`)

```text
NEXT_PUBLIC_SUPABASE_URL=          # browser-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # browser-safe
NEXT_PUBLIC_APP_URL=               # absolute base for public links (the /feedback/[token]
                                   # rating page). Defaults to http://localhost:3000; MUST be
                                   # the real domain in prod or cron-sent links point at localhost.
DATABASE_URL=                      # Supabase pooler (6543, pgbouncer=true)
DIRECT_URL=                        # direct/session — migrations
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=               # E.164, e.g. +18557743033
TWILIO_STATUS_CALLBACK_URL=        # optional; public URL of /api/twilio/status
RESEND_API_KEY=                    # email send
RESEND_FROM_EMAIL=                 # optional; verified-domain sender. Defaults to
                                   # onboarding@resend.dev (sandbox; owner-only delivery)
CRON_SECRET=                       # bearer token gating /api/cron/automations.
                                   # Vercel auto-sends it on cron runs; route fails closed if unset.
# Integration-layer secrets (Square / GlossGenius / … OAuth + webhook keys) will be added
# here per provider as that layer is built — all server-only, all per-business at runtime.
```

Only `NEXT_PUBLIC_*` vars reach the browser; everything else is server-only. `.env.local` is gitignored — never commit it.

## Roadmap

Framed by the four layers. The first three phases (skeleton → local loop → Supabase) and the
messaging loop are done; the pivot work is layers 1, 3, 4 plus making layer 2 smart.

- **Foundation — ✅ done:** app skeleton, local product loop (forms, tables, templates,
  message log), Supabase auth + Prisma persistence + per-user scoping.
- **Messaging — ✅ done:** SMS send + delivery/inbound webhooks + opt-out + E.164; Resend
  email send (email delivery webhooks ⛔).
- **Automation layer — 🟡 mostly built:** cron engine with dry-run preview for review
  follow-up, **predictive per-customer rebooking** (learned cadence off `Appointment` history),
  win-back, and missed-call follow-up; the feedback-gated rating page routes happy → Google /
  unhappy → owner. **Next up:** staged multi-touch win-back (~60/120/360); then in-text reply
  routing into the communication-layer inbox.
- **Integration layer — ⛔ not started:** customer-usable connect flows for Square,
  GlossGenius, and peers; pull customers + appointment history; ingest appointment-completed
  and missed-call events. CSV/manual stays as fallback.
- **Communication layer — ⛔ not started:** a structured, sortable inbox for all inbound
  signal (replies, routed negative feedback, opt-outs).
- **Analytics layer — ⛔ not started:** an owner-grade ROI dashboard (reviews generated,
  calls recovered, customers rebooked, revenue recovered).
- **Billing (Stripe) — ⛔ not started:** subscriptions + plan/message-quota enforcement.

Build clickable UI for a layer before the deep integration behind it. Don't start a new
layer while the one in front of users is half-wired.

## Product principles

Keep the product focused on outcomes owners already understand: **more Google reviews,
faster missed-call follow-up, more repeat bookings, less manual admin** — i.e. *staying
backbooked*. Don't build a generic AI app — the value should be obvious without AI.

Every feature should answer one of: (1) more reviews? (2) recover a lost lead? (3) bring
back a customer? (4) save the owner time? If not, defer it.

## Implementation principles

**Do:** prefer the simplest working version; build clickable UI before deep integrations; store records before sending; keep components readable and boring; keep business logic in small `lib/` functions; type domain objects; preserve the automation find/send/preview symmetry.

**Don't (yet):** team roles, complex permissions, multi-location, AI-generated conversations, usage-based billing before basic subscriptions, or premature abstraction. Don't speculatively add integration/inbox/analytics models — add them with the layer that uses them.

## Conventions

- TypeScript everywhere; Tailwind for styling; semantic domain names (`Customer`, `Business`, `Message`, `MessageTemplate`, `MissedLead`).
- Server Components by default; `"use client"` only for state/events/browser APIs.
- No global state libraries until clearly needed.
- **Git:** small, focused commits ("Add inbound Twilio webhook", "Normalize phones to E.164"). Don't mix UI + DB + auth + billing in one commit. Branch off `main` for non-trivial work.

## Notes for AI assistants

- Ask fewer architecture questions; give concrete next steps and code.
- Stay MVP-focused; don't jump ahead to advanced SaaS features.
- Preserve the current simple structure unless there's a clear reason to refactor.
- Read the relevant `node_modules/next/dist/docs/` guide before writing framework code (this is Next 16, not your training-data Next).
- The rename to **Backbooked** is in progress — rename opportunistically, never break a migration/env/identifier just to change a label.
- After a shipping change, give a short "try it out" checklist (browser + Supabase) so the user can verify.
- When uncertain, choose the simplest implementation that can be improved later.
