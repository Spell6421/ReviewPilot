# Directory Structure

**Analysis Date:** 2026-06-03

## Top-Level Layout

**No `src/` directory.** `app/`, `components/`, `lib/`, `hooks/`, `prisma/` all live at the
repo root. The `@/*` import alias maps to the root (`@/lib/twilio`, `@/components/ui/button`).

```text
app/                  # Next.js App Router (pages, layouts, actions, routes)
components/           # React components — app-sidebar + shadcn/ui primitives
lib/                  # Domain logic (send core, automations, templates, auth, integrations-to-be)
hooks/                # React hooks (use-mobile)
prisma/               # schema.prisma + migrations
docs/                 # product-vision, twilio-testing, gsd-setup
proxy.ts              # request middleware (renamed from middleware.ts)
vercel.json           # Vercel Cron schedule for /api/cron/automations
components.json        # shadcn/ui config (radix-nova style, lucide icons)
.planning/            # GSD planning artifacts (this codebase map)
```

## `app/` — Routes

```text
app/
  layout.tsx                   # root layout: fonts, metadata, <TooltipProvider>
  globals.css                  # Tailwind v4 + shadcn theme tokens (OKLch)
  page.tsx                     # /            — landing page
  login/{page,actions}.tsx     # /login       — email/password sign in + sign up
  onboarding/{page,actions}    # /onboarding  — first-run business setup
  auth/actions.ts              # sign-out action
  feedback/[token]/            # /feedback/[token] — PUBLIC 1–5 rating page (page/actions/form)
  (app)/                       # authed route group — shares the sidebar shell
    layout.tsx                 #   sidebar + header; gates on requireCurrentBusiness()
    dashboard/                 #   /dashboard    — stat cards + recent messages
      page.tsx | actions.ts | automation-check.tsx   # "Test my setup" dry-run preview
    customers/                 #   /customers    — table, add dialog, CSV import, send dialog
    messages/                  #   /messages     — message history + send action
    missed-leads/              #   /missed-leads — manual lead log + recovery send
    feedback/page.tsx          #   /feedback     — OWNER inbox of routed low-rating feedback
    settings/                  #   /settings     — business profile + template editor
    billing/page.tsx           #   /billing      — plans (UI only)
  api/
    twilio/status/route.ts     # Twilio delivery status callback (POST)
    twilio/inbound/route.ts    # Twilio inbound SMS / replies + STOP handling (POST)
    cron/automations/route.ts  # secret-gated automation trigger (GET=Vercel cron, POST=manual)
```

The `(app)` route-group parentheses **do not** appear in the URL. Marketing/auth pages and
the public `feedback/[token]` rating page sit outside it, with no sidebar.

## `lib/` — Domain Logic

```text
lib/
  prisma.ts                  # singleton PrismaClient
  supabase/{server,client,middleware}.ts   # Supabase SSR clients
  current-business.ts        # getCurrentUser / requireCurrentUser / requireCurrentBusiness
  twilio.ts                  # sendSms, webhook parse/verify, status map, opt-out keywords
  resend.ts                  # sendEmail
  send-message.ts            # SHARED send core: resolveRecipient + sendMessage (UI + cron)
  feedback.ts                # mint Feedback token + fillFeedbackLink (minted at send time)
  automations/               # the automation engine
    run.ts                   #   findDueSends (preview) + runAutomations (cron sends)
    preview.ts               #   buildAutomationPreview — connection checks + dry-run counts
    review-follow-up.ts      #   per-automation find* lookups
    rebooking.ts
    missed-call.ts
    types.ts                 #   DueSend / AutomationKind
  phone.ts                   # normalizePhone() → E.164 (US-default, dependency-free)
  csv-import.ts              # CSV parse + per-row validation (papaparse)
  render-template.ts         # {{businessName}} / {{customerName}} / {{reviewLink}}
  default-templates.ts       # seed templates + label/variant maps for badges
  utils.ts                   # cn() class-merge helper
```

## `components/`, `hooks/`, `prisma/`

```text
components/
  app-sidebar.tsx            # primary nav
  ui/                        # shadcn/ui components (button, dialog, table, badge, sidebar, …)
hooks/
  use-mobile.ts              # used by the sidebar
prisma/
  schema.prisma             # source of truth for the data model
  migrations/               # timestamped SQL migrations (e.g. 20260603002443_add_feedback)
```

## Key File Locations (where to look)

| Need | File |
|------|------|
| Send a message (any channel) | `lib/send-message.ts` |
| Add an automation | `lib/automations/<kind>.ts` + register in `run.ts` + line in `preview.ts` |
| Auth / business scoping | `lib/current-business.ts` |
| Request middleware | `proxy.ts` (NOT `middleware.ts`) |
| Data model | `prisma/schema.prisma` |
| Templates + badge labels/variants | `lib/default-templates.ts` |
| Twilio webhooks | `app/api/twilio/{status,inbound}/route.ts` |
| Cron entry | `app/api/cron/automations/route.ts` + `vercel.json` |
| Public rating page | `app/feedback/[token]/` |
| Owner feedback inbox | `app/(app)/feedback/page.tsx` |

## Naming Conventions

- **Route files:** Next.js conventions — `page.tsx`, `layout.tsx`, `route.ts`, `actions.ts`.
- **Components:** kebab-case files (`send-message-dialog.tsx`, `app-sidebar.tsx`).
- **lib functions:** kebab-case files exporting camelCase functions (`send-message.ts` → `sendMessage`).
- **Server Actions:** `<verb>Action` (e.g. `sendMessageAction`), one file per route (`actions.ts`).
- **Automation lookups:** `find<Kind>` returning `DueSend[]`.
- **DB tables:** snake_case via Prisma `@@map`; model names PascalCase.
- **Import alias:** always `@/...` (root), never relative paths.

## Future Homes (add with the layer that uses them)

- Integrations: `lib/integrations/` + `app/(app)/integrations/`
- Inbox (communication layer): `app/(app)/inbox/`
- Analytics queries: `lib/analytics/`

Keep business logic in small `lib/` functions and pages thin.
