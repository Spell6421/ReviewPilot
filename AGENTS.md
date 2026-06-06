<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Backbooked

Always-on guidance for agents in this repo. Kept lean on purpose. The **full engineering
reference** — complete file tree, data model, per-system deep dives, env vars, roadmap —
lives in [`docs/engineering-guide.md`](docs/engineering-guide.md); read it when you need
detail (it's a fuller snapshot and may lag this file). Product vision:
[`docs/product-vision.md`](docs/product-vision.md).

## What it is

**Backbooked** (formerly *ReviewPilot*) — a small SaaS that connects to local service
businesses' booking/phone systems to **recover missed calls, win back inactive customers,
and turn happy appointments into reviews**. Users: barbers, med spas, dentists, tattoo
shops, cleaners, detailers, tutors. Positioning: *"stay backbooked"* — recover revenue the
owner never sees.

> **Rename in progress:** ReviewPilot → Backbooked. The repo dir, package name, DB tables,
> and many identifiers still say `reviewpilot`. Rename opportunistically as you touch files;
> never break a migration/env/identifier just to change a label.

## The four layers

Use these names when discussing scope:

1. **Integration** — connect Square / GlossGenius / Booksy / … + the phone provider; pull
   customers + appointment history; ingest events. CSV/manual stays the fallback. **⛔ not built.**
2. **Automation** — the meat: review request + feedback gating, predictive rebook reminders,
   missed-call follow-up, win-back. **🟡 mostly built** (`lib/automations/`): rebooking is now
   per-customer predictive (learned cadence off real `Appointment` history); review + missed-call
   follow-ups and the feedback-gated rating page work; win-back is still a single fixed-window
   touch (staged win-back is the remaining piece).
3. **Communication** — one structured inbox for all inbound (replies, routed negative
   feedback, opt-outs). **⛔ not built** (replies are only counted today).
4. **Analytics** — owner-grade ROI dashboard. **⛔ not built.**

Build clickable UI for a layer before the deep integration behind it. Don't start a new
layer while the one in front of users is half-wired.

## Tech stack

- **Next.js 16.2.6** (App Router) + React 19.2 + TypeScript 5 — server actions + route
  handlers ARE the backend; don't add a separate backend framework.
- **Tailwind v4** + shadcn/ui (`radix-nova` style, lucide icons) — add components via
  `npx shadcn@latest add <c>`; use semantic tokens (`bg-primary`, …), never raw colors.
- **Prisma 5.22** → Supabase Postgres. **Supabase Auth** (`@supabase/ssr`, email/password).
- **Twilio v6** — SMS, fully wired (send + delivery/inbound webhooks + opt-out).
  **Resend v6** — email send.
- **Vercel Cron** → a `CRON_SECRET`-gated route runs the automation engine.
- **Not yet:** booking/phone integrations, Stripe billing.

Don't add dependencies unless they solve an immediate problem.

## Layout & critical conventions

- **No `src/`.** `app/`, `components/`, `lib/`, `hooks/`, `prisma/` at the repo root; `@/*`
  maps to root. Full tree in the engineering guide. `prisma/schema.prisma` is the data-model
  source of truth.
- **Middleware is `proxy.ts`** (exports `proxy()`, not `middleware()`) — this Next renames it.
  Don't create `middleware.ts`.
- **Auth/scoping:** one user owns one business (`Business.ownerId` = Supabase user id). Every
  authed page/action calls `requireCurrentBusiness()` / `requireCurrentUser()`
  (`lib/current-business.ts`). **Always scope reads AND writes by `business.id`**; re-check
  ownership in the `where` of destructive actions. Server Actions are POST-reachable — enforce
  auth inside the action, not just the UI.
- **Server Actions** return a serializable form-state (`{ error?; successAt? }`), signature
  `(_prev, formData) => Promise<State>`, `revalidatePath()` after mutating. Inline validation,
  no validation library.
- **DB migrations:** always use the npm scripts (`npm run db:migrate -- --name x`, `db:deploy`,
  `db:studio`) — they wrap Prisma in `dotenv-cli` as `dotenv -e .env.local -- prisma …`, so they
  load credentials from **`.env.local`**. A bare `prisma migrate`/`studio` would read `.env` by
  default and miss the (gitignored) `.env.local` creds — that's why the scripts exist. Note
  `db:generate`/`build`/`postinstall` call `prisma generate` directly (no dotenv — codegen needs
  no DB connection). Restart `npm run dev` after a schema change so new types load.
- **Phones:** normalize to E.164 via `normalizePhone()` at every entry point (manual add, CSV,
  missed-lead) — inbound reply matching is exact-string.
- **Env:** only `NEXT_PUBLIC_*` reaches the browser; everything else is server-only.
  `.env.local` is gitignored.

## Messaging & automation (stay conservative)

- **All sends go through `sendMessage()` (`lib/send-message.ts`)** — UI and cron alike. It
  resolves the recipient (guards opt-out / missing contact → `skipped`), stores the `Message`
  row before sending, then flips status to `sent`/`failed`. Never call Twilio/Resend directly.
- **Feedback-gated reviews are non-gating** (Google policy + FTC): branch on the 1–5 rating
  (≥4 → Google CTA, low → private owner inbox), never on a sentiment model. The public path
  stays reachable for everyone.
- **Automation = find/send/preview symmetry.** Each automation is a pure `find*` returning
  `DueSend[]`; the dashboard "Test my setup" preview dry-runs the exact lookup the cron sends,
  so the two can't drift. Preserve this when making automations smarter.
- **Rules of the road:** store every attempt; honor opt-out before sending; at most one
  follow-up per anchor; no bulk blasting; include business identity.
- A2P 10DLC is unapproved — test the SMS round-trip via the Twilio Virtual Phone; see
  [`docs/twilio-testing.md`](docs/twilio-testing.md).

## Working principles

- Every feature should answer one of: more reviews? recover a lost lead? bring back a
  customer? save the owner time? If not, defer it. Don't build a generic AI app.
- Prefer the simplest working version; store records before sending; keep business logic in
  small `lib/` functions and pages thin; readable over clever.
- **Don't (yet):** team roles, multi-location, AI-generated conversations, speculative
  integration/inbox/analytics models, usage-based billing, premature abstraction.
- TypeScript everywhere; Server Components by default (`"use client"` only for
  state/events/browser APIs); no global state libs until clearly needed.
- **Git:** small, focused commits (don't mix UI + DB + auth in one); branch off `main` for
  non-trivial work.
- After a shipping change, give a short "try it out" checklist (browser + Supabase).

## Commands

```bash
npm run dev        # http://localhost:3000
npm run build      # prisma generate && next build
npm run lint       # eslint
npm run db:migrate -- --name your_change   # create+apply migration (see engineering guide)
```

Verify changes with `npx tsc --noEmit` and `npx eslint <files>`; there's no test suite yet.
