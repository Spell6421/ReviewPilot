# Backbooked

**Backbooked connects to your booking and phone systems to automatically recover missed calls, bring back inactive customers, and turn happy appointments into more reviews.**

A SaaS for local service businesses — barbers, med spas, dentists, tattoo shops, cleaners, auto detailers, photographers, tutors — that turns lost revenue (the missed call, the regular who quietly stopped coming, the happy client who never left a review) into recovered bookings and reviews, automatically.

> **Status:** mid-build, private. Formerly *ReviewPilot*; the rename to Backbooked is in progress, so some identifiers, the repo dir, and DB tables still read `reviewpilot`. Billing is not yet wired.

## Architecture: four layers

| Layer | What it does | Status |
| --- | --- | --- |
| **Integration** | Connect to the booking/phone systems owners already use (Square, GlossGenius, Booksy, Vagaro, …) to pull customers + appointment history and ingest events. CSV/manual is the fallback. | ⛔ Not started |
| **Automation** | Review request + feedback gating, predictive rebook reminders, missed-call follow-up, win-back. | 🟡 Naive engine running |
| **Communication** | A structured, sortable inbox for everything inbound — replies, routed negative feedback, opt-outs. | ⛔ Not started |
| **Analytics** | An owner-grade ROI dashboard (reviews generated, calls recovered, customers rebooked, revenue recovered). | ⛔ Not started |

See [`docs/product-vision.md`](docs/product-vision.md) for the full pivot brief, and [`AGENTS.md`](AGENTS.md) for the engineering source of truth.

## Tech stack

- **Framework:** Next.js 16 (App Router) · React 19 · TypeScript 5
- **Styling:** Tailwind v4 · shadcn/ui (`radix-nova`) · lucide icons
- **Data:** Prisma 5 → Supabase Postgres
- **Auth:** Supabase Auth (`@supabase/ssr`, email/password)
- **SMS:** Twilio v6 (send + delivery/inbound webhooks + opt-out)
- **Email:** Resend v6
- **Automation:** in-app engine triggered by Vercel Cron hitting a secret-gated route
- **Hosting:** Vercel (intended)

## What works today

- Customers added manually or via CSV import (E.164 normalization + validation)
- SMS + email sending through a shared send core, with per-business templates
- Full SMS loop: delivery-status webhook, inbound-reply attribution, STOP/opt-out handling
- A first-pass automation engine (review follow-up, rebooking/win-back, missed-call follow-up) with a dashboard dry-run preview — fixed time windows, not yet predictive

## Getting started

**Prerequisites:** Node 20+, a Supabase project, and (optional, for messaging) Twilio + Resend accounts.

```bash
# 1. Install
npm install

# 2. Configure — create .env.local with the variables below

# 3. Apply migrations (creates tables + generates the Prisma client)
npm run db:migrate

# 4. Run
npm run dev          # http://localhost:3000
```

### Environment variables

Set these in `.env.local` (gitignored). Only `NEXT_PUBLIC_*` vars reach the browser; everything else is server-only.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key (browser-safe) |
| `DATABASE_URL` | Supabase transaction pooler (6543, `?pgbouncer=true&connection_limit=1`) — runtime |
| `DIRECT_URL` | Supabase session/direct connection (5432) — migrations |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS send (phone in E.164) |
| `TWILIO_STATUS_CALLBACK_URL` | optional — public URL of `/api/twilio/status` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | email send (from defaults to the Resend sandbox sender) |
| `CRON_SECRET` | bearer token gating `/api/cron/automations`; the route fails closed if unset |

> The Prisma CLI reads `.env`, **not** `.env.local` — always run migrations through the `db:*` npm scripts, which wrap Prisma in `dotenv-cli`. After a schema change, restart the dev server so regenerated types load.

## Scripts

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build
npm run lint         # eslint
npm run db:migrate   # create + apply a migration in dev (-- --name <name>)
npm run db:deploy    # apply migrations in prod/CI
npm run db:studio    # Prisma Studio
npm run db:generate  # regenerate the Prisma client
```

There's no automated test suite yet — verify with `npx tsc --noEmit` and `npx eslint <files>`.

## Project structure

```text
app/
  (app)/            # authed route group (shared sidebar): dashboard, customers,
                    #   messages, missed-leads, settings, billing
  api/twilio/       # delivery-status + inbound-reply webhooks
  api/cron/         # secret-gated automation trigger
  login/ onboarding/ page.tsx   # auth + marketing (no sidebar)
lib/
  send-message.ts   # shared send core (UI + cron)
  automations/      # the automation engine (find* lookups + run + preview)
  twilio.ts resend.ts phone.ts csv-import.ts render-template.ts
  supabase/ current-business.ts # auth + per-business scoping
prisma/schema.prisma  # data model: Business, Customer, Message, MessageTemplate, MissedLead
proxy.ts            # request middleware (this Next renames middleware.ts → proxy.ts)
docs/               # product-vision.md, twilio-testing.md
```

One user owns exactly one business; every query is scoped by `business.id`. Full conventions, the data model, and the automation engine internals live in [`AGENTS.md`](AGENTS.md).

## Deployment

Targets Vercel. Set the environment variables above in the project settings, and configure the automation cron via [`vercel.json`](vercel.json) (a daily GET to `/api/cron/automations` — Vercel attaches the `CRON_SECRET` automatically). Run `npm run db:deploy` against the production database on release.

## Docs

- [`AGENTS.md`](AGENTS.md) — engineering source of truth (conventions, data model, automation engine)
- [`docs/product-vision.md`](docs/product-vision.md) — the pivot brief and four-layer vision
- [`docs/twilio-testing.md`](docs/twilio-testing.md) — testing the SMS round-trip before A2P approval
