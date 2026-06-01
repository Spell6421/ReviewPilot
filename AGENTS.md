<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository. `CLAUDE.md` just imports this file via `@AGENTS.md`, so this is the single source of truth — keep it current as the app evolves.

## Project

ReviewPilot — a small SaaS for local service businesses that turns completed appointments, missed calls, and inactive customers into review requests, follow-ups, and rebooking nudges.

Target users: barbers, med spas, dentists, tattoo shops, cleaners, auto detailers, photographers, tutors, and similar appointment-based local businesses.

Core promise:

> Get more Google reviews and recover lost leads automatically.

The product is mid-build. Phases 1–4 (skeleton → local loop → Supabase persistence/auth → SMS messaging) are working; automation and billing are not. Prefer simple, readable implementations over abstraction.

## Tech stack (actual)

- **Framework:** Next.js **16.2.6** (App Router) + React **19.2** + TypeScript 5
- **Styling:** Tailwind **v4** + shadcn/ui (`radix-ui` primitives, `radix-nova` style) + `lucide-react` icons
- **ORM:** Prisma **5.22** → Supabase Postgres
- **Auth:** Supabase Auth via `@supabase/ssr` (email/password)
- **SMS:** Twilio **v6** — **fully wired** (send + delivery webhook + inbound/reply webhook + opt-out)
- **Email:** Resend **v6** — **wired** (send path; delivery webhooks not yet)
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
    settings/                # /settings — business profile + template editor
    billing/page.tsx         # /billing — plans (UI only)
  api/twilio/
    status/route.ts          # Twilio delivery status callback (POST)
    inbound/route.ts         # Twilio inbound SMS / replies + STOP handling (POST)
lib/
  prisma.ts                  # singleton PrismaClient
  supabase/{server,client,middleware}.ts   # Supabase SSR clients
  current-business.ts        # getCurrentUser / requireCurrentUser / requireCurrentBusiness
  twilio.ts                  # sendSms, webhook parse/verify, status map, opt-out keywords
  phone.ts                   # normalizePhone() → E.164
  csv-import.ts              # CSV parse + per-row validation (papaparse)
  render-template.ts         # {{businessName}} / {{customerName}} / {{reviewLink}}
  default-templates.ts       # seed templates + label/variant maps for badges
  utils.ts                   # cn() class-merge helper
components/app-sidebar.tsx   # primary nav;  components/ui/ = shadcn components
hooks/use-mobile.ts          # used by the sidebar
proxy.ts                     # request middleware (see note below)
prisma/schema.prisma         # source of truth for the data model
```

The `(app)` route-group parentheses don't appear in the URL. Marketing/auth pages (`/`, `/login`, `/onboarding`) sit outside it, with no sidebar.

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

Enums: `MessageChannel{sms,email}`, `MessageType` / `MessageTemplateType` `{review_request, review_follow_up, rebooking_reminder, missed_call_recovery, win_back}`, `MessageStatus{draft,queued,sent,failed,replied}`, `MissedLeadStatus{new,contacted,booked,lost}`, `BillingPlan{starter,pro,scale}`.

## Messaging system (as built)

The full SMS loop works. When extending it, stay conservative.

**Send flow** (`messages/actions.ts`, `missed-leads/actions.ts`):
1. Validate; block SMS to a customer with no phone or `smsOptedOut = true`.
2. Insert the `Message` as `queued`.
3. Send via `sendSms()` (`lib/twilio.ts`) or `sendEmail()` (`lib/resend.ts`) → on success flip to `sent` + store the provider id in `providerSid`; on failure flip to `failed` and surface the provider's error. SMS normalizes the number to E.164 as a safety net; email derives a subject from the message type (`messageEmailSubjects`) prefixed with the business name.

**Templates:** `renderTemplate(body, vars)` fills `{{businessName}}`, `{{customerName}}`, `{{reviewLink}}`. Editable per-business in Settings.

**Webhooks (`app/api/twilio/`):**
- `status/route.ts` — delivery callbacks (`queued→sent→delivered`/`failed`), mapped onto our enum and matched by `providerSid`. Wired via the `TWILIO_STATUS_CALLBACK_URL` env (passed as `statusCallback` on each send). Never downgrades a `replied` row.
- `inbound/route.ts` — incoming replies. Attributes the text by finding the most recent outbound SMS to that `From` number, then stores a new `replied` Message (this is what the dashboard's "replies" counts; the outbound `sent` row is untouched). A bare `STOP`/`UNSUBSCRIBE`/etc. sets `Customer.smsOptedOut`; `START`/`YES`/`UNSTOP` clears it.
- Both verify the `X-Twilio-Signature` (enforced in production; dev logs a warning and proceeds so tunnels work).

**Phone numbers:** always normalize to E.164 via `normalizePhone()` at entry (manual add, CSV import, missed-lead create). It's US-default and dependency-free; swap in `libphonenumber-js` if international is ever needed. Inbound matching is exact-string, so normalization keeps replies matchable.

**Rules of the road:** store every attempt; one-at-a-time manual sends (no bulk blasting); at most one follow-up after a review request; include business identity; honor opt-out before any production sending.

**Testing without A2P approval:** see `docs/twilio-testing.md`. A2P 10DLC is unapproved, so test the real round-trip via the Twilio **Virtual Phone** (`+18777804236`) over a `cloudflared`/ngrok tunnel; set a test customer's phone to that number.

## CSV import

`lib/csv-import.ts` (papaparse). Canonical columns `name,phone,email,last_appointment_at`, with header aliases (e.g. `mobile`→phone, `last_visit`→date). Each row needs a name and either a phone or email; phones normalize to E.164, and a provided-but-unparseable phone is flagged "Invalid phone number" in the preview rather than silently dropped. Never crash on imperfect files; surface a fatal file-level error for a missing required column.

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
DATABASE_URL=                      # Supabase pooler (6543, pgbouncer=true)
DIRECT_URL=                        # direct/session — migrations
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=               # E.164, e.g. +18557743033
TWILIO_STATUS_CALLBACK_URL=        # optional; public URL of /api/twilio/status
RESEND_API_KEY=                    # email send
RESEND_FROM_EMAIL=                 # optional; verified-domain sender. Defaults to
                                   # onboarding@resend.dev (sandbox; owner-only delivery)
```

Only `NEXT_PUBLIC_*` vars reach the browser; everything else is server-only. `.env.local` is gitignored — never commit it.

## Roadmap status

- **Phase 1 — App skeleton:** ✅ done
- **Phase 2 — Local product loop** (forms, tables, templates, message log): ✅ done
- **Phase 3 — Supabase** (auth, Prisma persistence, per-user scoping): ✅ done
- **Phase 4 — Messaging:** SMS send ✅, status + inbound webhooks ✅, missed-call form ✅, opt-out + E.164 ✅, Resend email send ✅ (delivery webhooks ⛔)
- **Phase 5 — Automation & billing** (review automation, 2-day follow-up, rebooking/win-back scheduling, Stripe subscriptions, plan/message limits): ⛔ not started — **next up**

## Product principles

Keep the product focused on outcomes owners already understand: more Google reviews, faster missed-call follow-up, more repeat bookings, less manual admin. Don't build a generic AI app — the value should be obvious without AI.

Every feature should answer one of: (1) more reviews? (2) recover a lost lead? (3) bring back a customer? (4) save the owner time? If not, defer it.

## Implementation principles

**Do:** prefer the simplest working version; build clickable UI before deep integrations; store records before sending; keep components readable and boring; keep business logic in small `lib/` functions; type domain objects.

**Don't (yet):** team roles, complex permissions, multi-location, AI-generated conversations, appointment-platform integrations, usage-based billing before basic subscriptions, or premature abstraction.

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
- After a shipping change, give a short "try it out" checklist (browser + Supabase) so the user can verify.
- When uncertain, choose the simplest implementation that can be improved later.
