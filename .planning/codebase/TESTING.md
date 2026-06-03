# Testing Patterns

**Analysis Date:** 2026-06-03

## Test Framework

**Current State:**
- No automated test framework installed or configured
- No Jest, Vitest, or similar test runner
- No test files in the codebase (only in node_modules from dependencies)

**Validation Approach:**
- TypeScript compiler (`npx tsc --noEmit`) for type safety
- ESLint (`npm run lint`) for code quality and Next.js rules
- Manual testing via browser and Supabase

**Run Commands:**
```bash
npm run lint              # Check linting and TypeScript
npx tsc --noEmit          # Full type-check without build
npm run dev               # Start dev server for manual testing
npm run build             # Full build (includes prisma generate + next build)
```

## Manual Testing Strategy

The project relies on manual testing with these check points:

**Database/ORM:**
- Prisma migrations applied: `npm run db:migrate -- --name migration_name`
- Prisma Studio for data inspection: `npm run db:studio`
- Client regeneration after schema changes: `npm run db:generate`

**Server Actions & Routes:**
- Test via browser form submission
- State verified by revalidated page load
- Error messages displayed via form-state objects
- Ownership checks verified by querying Supabase directly

**Webhooks (Twilio):**
- Signature validation: requests fail with 403 if `X-Twilio-Signature` invalid (production only)
- Development fallback: warning logged if invalid, request proceeds (dev only)
- Test via Twilio Virtual Phone `+18777804236` over ngrok/cloudflared tunnel (see `docs/twilio-testing.md`)
- Message status callback: delivery status mapped and stored via `lib/twilio.ts` → `mapTwilioStatus()`
- Inbound reply webhook: most-recent outbound message matched by phone number, reply stored as `replied` status

**Authentication:**
- Supabase Auth via `@supabase/ssr` for session management
- SSR middleware refreshes session on every request: `lib/supabase/middleware.ts`
- Protected routes via `requireCurrentUser()` and `requireCurrentBusiness()` helpers
- Redirect to `/login` if no user; redirect to `/onboarding` if no business

**Automation Engine (Cron):**
- Dry-run preview: `buildAutomationPreview()` in `lib/automations/preview.ts` shows exactly what will send
- Manual trigger: `curl -X POST http://localhost:3000/api/cron/automations -H "Authorization: Bearer <CRON_SECRET>"`
- Vercel Cron: daily trigger via `vercel.json` (production only)
- Authorization: fails closed with 401 if `CRON_SECRET` missing or invalid header
- Error logging: `console.error()` for failed sends, `console.warn()` for config issues

## Code Validation Patterns

**TypeScript Strict Mode:**
- All `.ts` and `.tsx` files use strict TypeScript
- Discriminated unions for safe error handling: `{ ok: true | false; ... }`
- Type guards enforce control flow: `if (resolved.ok) { ... }`
- No implicit `any`; all function parameters and return types are explicit

**Type Safety by Domain:**
- Prisma-generated types: `MessageChannel`, `MessageStatus`, `MessageType`, `MessageTemplateType`, `MessageTemplate`, `Customer`, `Message`, `MissedLead`, `Feedback`
- Custom domain types: `DueSend`, `SendMessageResult`, `SendSmsResult`, `SendSkipReason`, `ResolvedRecipient`, `ParsedCustomerRow`
- Pure functions have explicit input/output types: `resolveRecipient(p: { channel; customer?; missedLead? }): ResolvedRecipient`

**Guards & Validations:**

1. **Recipient Resolution** (`lib/send-message.ts`):
   - `resolveRecipient()` returns `{ ok: true; to; ... }` or `{ ok: false; reason }`
   - Reason values: `"no_recipient" | "no_phone" | "no_email" | "opted_out"`
   - SMS: requires phone; email: requires email address
   - SMS to opted-out customers rejected before send attempt

2. **Ownership Checks** (all pages and actions):
   - `where: { businessId: business.id }` on every customer/message/lead query
   - Destructive operations re-check: `where: { id, businessId }` to prevent cross-business POSTs
   - `requireCurrentBusiness()` ensures user owns the business before page renders

3. **Input Validation** (server actions):
   - Form field parsing: `String(formData.get("x") ?? "").trim()`
   - Type/channel whitelisting: `VALID_TYPES` and `VALID_CHANNELS` sets
   - Manual string enums over Prisma enums for control
   - Customer lookup before send: `prisma.customer.findFirst({ where: { id, businessId } })`

4. **Config Validation** (Twilio, Resend):
   - `isSmsConfigured()` checks for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - Lazy client init: `getClient()` returns `null` if config missing
   - Graceful error return instead of throwing: `{ ok: false, error: "SMS isn't configured..." }`

5. **CSV Import Validation** (`lib/csv-import.ts`):
   - File-level errors: missing required columns, no phone or email, empty file
   - Per-row errors: missing name, invalid phone number (provided but unparseable)
   - Phone normalization to E.164 at parse time
   - Date parsing with `new Date(dateString)` — invalid dates become `null`

## Testing Gaps & Future Work

**Not Yet Tested Automatically:**
- Automation dedup logic (query-based against Message log)
- Feedback-gating routing (happy ≥4 → Google; unhappy → owner inbox)
- Per-customer cadence learning for rebooking (not yet implemented)
- Integration layer (Square, GlossGenius, etc.) — not yet built
- Inbox/thread structure for communication layer — not yet built
- Analytics/ROI dashboard — not yet built

**Testing Strategy When Frameworks Are Added:**

1. **Unit Tests** (lib/ functions):
   - `renderTemplate()` with various variable combinations
   - `normalizePhone()` with 10-digit, 11-digit, international, invalid inputs
   - `classifyInboundKeyword()` with STOP/START/UNSTOP variants
   - `mapTwilioStatus()` with all Twilio status values
   - `parseCustomersCsv()` with valid, invalid, and malformed CSV

2. **Integration Tests** (Database + Functions):
   - `sendMessage()` end-to-end: insert Message → mock Twilio → verify DB update
   - `findReviewFollowUps()` with various customer states (replied, rated, already followed-up)
   - `resolveRecipient()` with opted-out, missing phone/email, mixed scenarios
   - Automation `find*` functions with overlapping time windows

3. **E2E Tests** (Full Request → Response):
   - Server action flow: form submission → sendMessageAction → revalidate → UI update
   - Webhook handling: Twilio POST → signature validation → Message row creation
   - Cron trigger: authorization check → runAutomations → response summary
   - Auth flow: sign-up → business creation → onboarding redirect

4. **Property-Based Testing:**
   - Phone number roundtrip: normalize(x) = E.164, inbound match by phone works
   - Message dedup: query matches exactly what automation claims to send
   - Template rendering: no missing placeholders after render (unless intentional)

## Debugging Patterns

**Console Logging:**
- Module-tagged warnings/errors: `console.warn("[twilio/inbound] ...")`, `console.error("[automations] ...")`
- Sensitive data redacted: use `recipientLabel: "customer <id> (Name)"` not full contact info
- Automation engine logs failures with context: automation type, recipient, error message

**Prisma Studio:**
```bash
npm run db:studio    # Opens web UI to inspect/edit data in Supabase
```

**TypeScript Checking:**
```bash
npx tsc --noEmit     # Full type check without outputting JS
```

**Linting:**
```bash
npm run lint         # Check all .ts/.tsx files against ESLint config
npx eslint <file>    # Check single file
```

**Local Tunnel for Webhooks:**
```bash
cloudflared tunnel    # or npx ngrok http 3000 for Twilio testing
# Pass tunnel URL to TWILIO_STATUS_CALLBACK_URL
# Test inbound via Twilio Virtual Phone: +18777804236
```

## When Tests Should Fail

A test (or validation check) should fail if:
- A `SendMessageResult` shows `status: "failed"` but the Message was inserted as `sent`
- An automation counts a customer who should be excluded (opted-out, already followed-up, rated)
- A webhook signature is invalid in production (should return 403)
- A server action doesn't re-scope by `businessId` (security boundary)
- A form action succeeds but `revalidatePath()` isn't called (stale UI)
- A customer is returned from a `find*` function but `resolveRecipient()` would reject them
