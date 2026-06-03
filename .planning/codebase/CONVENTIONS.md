# Coding Conventions

**Analysis Date:** 2026-06-03

## Naming Patterns

**Files:**
- kebab-case for page/component/action files: `send-message-dialog.tsx`, `page.tsx`, `actions.ts`
- camelCase for utility/lib files: `sendMessage()` in `send-message.ts`, `normalizePhone()` in `phone.ts`, `renderTemplate()` in `render-template.ts`
- Index/barrel exports: `default-templates.ts` for constants and label/variant maps
- Route handlers follow Next.js conventions: `route.ts`, `page.tsx`, `layout.tsx`

**Functions:**
- camelCase for all function names: `sendMessage()`, `normalizePhone()`, `requireCurrentUser()`, `findReviewFollowUps()`, `parseCustomersCsv()`
- Descriptive names reflecting responsibility: `resolveRecipient()`, `classifyInboundKeyword()`, `mapTwilioStatus()`, `reconstructUrl()`
- Async functions that query the database: `find*` pattern for pure lookups that return data without side effects: `findReviewFollowUps()`, `findRebookingNudges()`, `findMissedCallFollowUps()`, `findDueSends()`
- Server action functions end with `Action`: `sendMessageAction()`, `addCustomerAction()`
- Status/validation helpers: verb-focused like `isSmsConfigured()`, `validateRequest()`, `classifyInboundKeyword()`

**Variables:**
- camelCase throughout: `customerId`, `messageId`, `businessName`, `smsOptedOut`, `phoneRaw`, `channelByCustomer`, `candidateIds`
- Destructured assignments preserve property names: `const { business } = await requireCurrentBusiness();`
- Maps/Sets use descriptive names: `channelByCustomer`, `exclude`, `templatesByType`, `bucketFor`
- Result objects use discriminated unions: `{ ok: true, to, customerId, missedLeadId }` vs `{ ok: false, reason }`

**Types:**
- PascalCase for all type/interface names: `SendMessageResult`, `CustomerRecipient`, `DueSend`, `AutomationKind`, `SendSkipReason`, `ParsedCustomerRow`, `ParseResult`
- Export type definitions explicitly: `export type SendMessageResult = ...` and `export interface SendMessageDialogProps`
- Prisma-generated enums: `MessageChannel`, `MessageType`, `MessageStatus`, `MessageTemplateType`, `BillingPlan`, `MissedLeadStatus`
- Union types for result patterns: the app heavily uses discriminated unions for type safety in error handling

## Code Style

**Formatting:**
- TypeScript strict mode enabled (`tsconfig.json`: `"strict": true`)
- ES2017 target (`tsconfig.json`: `"target": "ES2017"`)
- ESLint v9 with Next.js recommended rules (`eslint-config-next/core-web-vitals`)
- Web Vitals and TypeScript rules enforced via ESLint config
- Prettier is NOT configured — rely on ESLint for formatting
- No auto-formatting hook; manual `npm run lint` to check

**Linting:**
- ESLint v9 with flat config (`eslint.config.mjs`): Next.js core + TypeScript rules only
- No aggressive formatting opinions — code is readable but not overly strict on whitespace
- Unused variables/imports flagged by TypeScript compiler (`npx tsc --noEmit`)

## Import Organization

**Order:**
1. External npm packages: `import { useState } from "react"`, `import Papa from "papaparse"`
2. Prisma/database: `import type { MessageChannel } from "@prisma/client"`
3. Internal lib functions: `import { sendMessage } from "@/lib/send-message"`
4. Internal components: `import { Button } from "@/components/ui/button"`
5. Utilities: `import { cn } from "@/lib/utils"`

**Path Aliases:**
- All internal imports use `@/*` alias mapping to repo root: `@/lib/twilio`, `@/components/ui/button`, `@/app/(app)/messages/actions`
- No relative imports: always use `@/`

## Error Handling

**Patterns:**
- Never throw from production code paths. All async operations return discriminated result objects: `{ ok: true, ...data }` vs `{ ok: false, reason/error }`
- `lib/send-message.ts` exports `SendMessageResult = { status: "sent" | "failed" | "skipped"; ... }`
- `lib/twilio.ts` exports `SendSmsResult = { ok: true, sid } | { ok: false, error }`
- `lib/csv-import.ts` returns `ParseResult` with `fatal?: string` and per-row `errors: string[]`
- Route handlers catch top-level errors and return JSON responses: `catch (err) { ... return Response.json({ ok: false, error }, { status: 500 }) }`
- Server actions return form-state objects with `error?: string`: `SendMessageFormState = { error?: string; successAt?: number }`
- Failed sends are logged but don't crash the automation engine; counts are tallied: `bucket.failed++` and `console.error(...)`

**Guards:**
- Ownership checks: every query scopes by `business.id` and destructive operations re-check with `where` clause
- Opt-out guards in send path: `resolveRecipient()` checks `customer.smsOptedOut` before SMS is attempted
- Config checks at function boundaries: `getClient()` in `lib/twilio.ts` returns `null` if env vars missing, `sendSms()` returns graceful error
- Auth checks on protected pages: `requireCurrentBusiness()` redirects to `/login` or `/onboarding` if user/business missing

## Logging

**Framework:** console only (`console.log`, `console.warn`, `console.error`)

**Patterns:**
- Warnings for dev/fallback scenarios: `console.warn("[twilio/inbound] signature did not validate — proceeding (dev only)")`
- Errors for unattended operations (automation/cron): `console.error("[automations] ${item.automation} send failed for ${item.recipientLabel}: ${result.error}")`
- Tag-based prefixes for routing: `[twilio/inbound]`, `[cron/automations]`, `[twilio/status]` — shows the source of the log
- No sensitive data logged: phone numbers, customer names, and email addresses are redacted in logs
- Development-only logging in handlers: Twilio webhook handlers log warnings only in dev; silently proceed in production after signature validation

## Comments

**When to Comment:**
- Algorithm-heavy or counter-intuitive logic: the 2–30-day follow-up window in `lib/automations/review-follow-up.ts` is documented
- Historical context or business rules: the feedback-gating flow explains why `{{feedbackLink}}` is minted at send time, not at template render
- Webhook signature validation: comments explain the forward-header reconstruction for Vercel proxy
- Constraints and limitations: comments note that per-business SMS numbers would solve attribution, but for now a single shared number matches by most-recent outbound

**JSDoc/TSDoc:**
- Brief module-level block comments explaining the file's purpose: most `lib/` functions start with a `/** ... */` block
- Parameter docs are minimal; signatures are usually self-documenting via types
- Return type comments only when the return shape isn't obvious: `export function resolveRecipient(...): ResolvedRecipient`

## Function Design

**Size:**
- Small, focused functions. Largest is ~100 lines (`findReviewFollowUps`), which is allowed because it's a pure query with clear steps
- Server actions under 50 lines; route handlers under 50 lines
- UI components under 150 lines

**Parameters:**
- Use object destructuring for multi-param functions: `{ businessId, businessName, channel, ... }` in `sendMessage()`
- Minimal param count: if a function takes more than 3 unrelated params, refactor into a typed object
- Optional params always last: `now: Date = new Date()` in automation `find*` functions allows preview/test to override the clock

**Return Values:**
- Single return type per function: `Promise<DueSend[]>`, `Promise<SendMessageResult>`, `SendSmsResult`
- Discriminated unions over multiple return types: `{ status: "sent" | "failed" | "skipped"; ... }` instead of throwing or returning null
- Never return partial data with missing fields: a `DueSend` is fully resolved before returning

## Module Design

**Exports:**
- Named exports for functions and types: `export function sendMessage(...)`, `export type SendMessageResult`
- One default export per file only when it's the primary export
- Explicit type exports: `export type` for interfaces, `export enum` for enums

**Barrel Files:**
- `lib/default-templates.ts` is a barrel of constants and label/variant helpers: `DEFAULT_TEMPLATES`, `messageTypeLabels`, `messageStatusVariant()`, `missedLeadStatusLabels`
- No other barrel exports; each `lib/` file exports a single cohesive unit

## Database Access

**All queries scoped by business:**
- `where: { businessId: business.id, ... }` on every Customer, Message, MissedLead, and MessageTemplate query
- No global queries across businesses
- Destructive operations re-check ownership: `where: { id, businessId }` to prevent crafted POSTs from deleting another business's row

**Prisma usage:**
- `prisma` singleton imported from `lib/prisma.ts`
- Select exact fields when possible: `.select({ customerId: true, channel: true })` instead of full row
- Use `Promise.all([...])` for concurrent queries: dashboard loads metrics in parallel
- No N+1 queries; batch or use relations carefully

## React/Server Components

**Server Components by default:**
- Pages and layouts are server components
- Async operations (auth checks, DB queries) in pages without `"use client"`
- `"use client"` on components that use hooks, event handlers, or browser APIs: `SendMessageDialog`, `AutomationCheck`

**Form Handling:**
- Server actions via `useActionState` hook
- Initial state passed as second arg: `useActionState(sendMessageAction, initialState)`
- Result destructured: `const [state, formAction, pending] = useActionState(...)`
- Success trigger via effect: `useEffect(() => { if (state.successAt) onOpenChange(false); })`

**State Management:**
- Local `useState` in client components only
- `useMemo` to avoid re-renders: template lookups memoized in `SendMessageDialog`
- No global state library (Redux, Zustand, etc.)

## Styling

**Tailwind v4:**
- Semantic token classes: `bg-primary`, `text-muted-foreground`, `bg-sidebar` — never raw colors like `bg-blue-500`
- Configured in `app/globals.css` with OKLch color values
- shadcn/ui components for all UI primitives: buttons, dialogs, forms, tables
- Compose components with `className` prop using `cn()` helper (clsx + tailwind-merge)
- Add new components via CLI: `npx shadcn@latest add <component>` — don't hand-write components

**Icon Library:**
- lucide-react for all icons
- Import from `lucide-react`: `import { Menu, X, Check } from "lucide-react"`
