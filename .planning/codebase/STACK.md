# Technology Stack

**Analysis Date:** 2026-06-03

## Languages

**Primary:**
- TypeScript 5 - Full codebase (app, lib, components, hooks)

**Secondary:**
- JSX/TSX - React components and server components
- CSS - Tailwind v4 utility classes (no traditional CSS files)

## Runtime

**Environment:**
- Node.js (version not explicitly pinned in package.json, follows Next.js 16 requirements)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (generated)

## Frameworks

**Core:**
- Next.js 16.2.6 (App Router) - Full-stack framework with server components, server actions, route handlers
- React 19.2.4 - UI library
- React DOM 19.2.4 - DOM rendering

**Styling:**
- Tailwind CSS 4 - Utility-first CSS framework
- shadcn/ui 4.8.0 - Pre-built Radix UI component library (radix-nova style)
- lucide-react 1.16.0 - Icon library (192 icons)
- class-variance-authority 0.7.1 - Type-safe component variant creation
- tailwind-merge 3.6.0 - Class name merging utility
- tw-animate-css 1.4.0 - Animation utilities

**Database:**
- Prisma 5.22.0 - ORM for Postgres schema management and queries
  - Client: `@prisma/client` ^5.22.0
  - Located at: `prisma/schema.prisma`

**Authentication:**
- Supabase Auth - Email/password authentication via `auth.users` table
  - `@supabase/supabase-js` ^2.46.1 - Supabase client library
  - `@supabase/ssr` ^0.5.2 - SSR-safe client for Next.js with cookie management

## Key Dependencies

**Critical:**
- Twilio 6.0.2 - SMS send, delivery webhooks, inbound reply webhooks, opt-out handling
- Resend 6.12.4 - Email send via verified domains or sandbox (`onboarding@resend.dev`)
- papaparse 5.5.3 - CSV parsing for customer import
  - @types/papaparse 5.5.2

**Infrastructure:**
- radix-ui 1.4.3 - Headless UI primitives (Button, Dialog, Card, Table, etc.)
- clsx 2.1.1 - Class name concatenation utility

## Development & Build

**Build:**
- Next.js 16.2.6 (includes webpack)
- PostCSS 4 (implicit via @tailwindcss/postcss)

**Linting:**
- ESLint 9 - JavaScript/TypeScript linter
- eslint-config-next 16.2.6 - Next.js recommended config
- eslint-config-next/core-web-vitals - Core Web Vitals rules
- eslint-config-next/typescript - TypeScript rules

**Type Checking:**
- TypeScript 5 - Static type checking
- @types/node ^20 - Node.js type definitions
- @types/react ^19 - React type definitions
- @types/react-dom ^19 - React DOM type definitions

**Environment Loading:**
- dotenv-cli 7.4.2 - Load .env.local for Prisma CLI (migrations read from dotenv-cli wrapper, not raw Prisma)

## Configuration

**Environment Variables (.env.local - gitignored):**

Browser-safe (NEXT_PUBLIC_* prefix):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public anon key (safe for browser)
- `NEXT_PUBLIC_APP_URL` - Base URL for public links (feedback pages). Defaults to `http://localhost:3000`; must be set to real domain in production

Server-only (private env vars):
- `DATABASE_URL` - Supabase transaction pooler (port 6543, pgbouncer=true) for runtime queries
- `DIRECT_URL` - Supabase direct/session connection for Prisma migrations
- `TWILIO_ACCOUNT_SID` - Twilio account identifier
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `TWILIO_PHONE_NUMBER` - Outbound Twilio number (E.164 format, e.g. +18557743033)
- `TWILIO_STATUS_CALLBACK_URL` - Optional public webhook URL for Twilio delivery status callbacks
- `RESEND_API_KEY` - Resend email service API key
- `RESEND_FROM_EMAIL` - Optional verified-domain sender address; defaults to `onboarding@resend.dev` (sandbox, owner-only)
- `CRON_SECRET` - Bearer token gating `/api/cron/automations` automation trigger (fails closed if unset)

**Build Configuration:**
- `next.config.ts` (`C:\Users\kovvu\OneDrive\Desktop\Projects\reviewpilot\next.config.ts`) - Minimal config
- `tsconfig.json` - TypeScript compiler options (ES2017 target, bundler module resolution, path aliases via @/*)
- `postcss.config.mjs` - PostCSS config with @tailwindcss/postcss plugin
- `eslint.config.mjs` - ESLint config (Next.js core-web-vitals + TypeScript rules)
- `components.json` - shadcn/ui configuration (radix-nova style, lucide icons, @/ aliases)
- `vercel.json` - Vercel Cron schedule: daily at 14:00 UTC hitting `/api/cron/automations`

**Database Schema:**
- `prisma/schema.prisma` - Single source of truth for data models and enums
  - Data source: PostgreSQL (Supabase)
  - Client generator: `@prisma/client`
  - Models: Business, Customer, MessageTemplate, Message, MissedLead, Feedback
  - Enums: BillingPlan, MessageTemplateType, MessageChannel, MessageType, MessageStatus, MissedLeadStatus

## Platform Requirements

**Development:**
- Node.js (compatible with Next.js 16.2.6)
- npm or compatible package manager
- `.env.local` file with Supabase, Twilio, and Resend credentials
- Postgres-compatible database (Supabase or local Postgres for schema)

**Production:**
- Vercel (recommended hosting; Cron jobs via vercel.json)
  - Alternative: Any Node.js host with HTTP support and background job scheduler
- Supabase Postgres (or equivalent Postgres instance)
- Twilio account with SMS capability (A2P unapproved — use Virtual Phone +18777804236 for testing)
- Resend account with email API key
- CRON_SECRET environment variable for automation gate

## Scripts

```bash
npm run dev           # Start dev server at http://localhost:3000
npm run build         # Build: prisma generate && next build
npm run start         # Start production server
npm run lint          # Run ESLint
npm run db:generate   # Regenerate Prisma client (runs on postinstall)
npm run db:migrate    # Create & apply migration (dotenv-cli wraps Prisma)
npm run db:deploy     # Apply migrations in CI/production
npm run db:studio     # Open Prisma Studio (interactive schema explorer)
npm run db:format     # Format schema.prisma
```

## Deployment & Versioning

**Target Deployment:**
- Vercel (primary)
  - Automated cron at `0 14 * * *` (daily, 14:00 UTC) → `/api/cron/automations`
  - Environment variables configured in Vercel dashboard

**Alternative Deployments:**
- Docker container on any Node.js host
- Direct VPS deployment (node + npm/yarn)
- Ensure DATABASE_URL + DIRECT_URL, TWILIO_*, RESEND_*, and CRON_SECRET are set

---

*Stack analysis: 2026-06-03*
