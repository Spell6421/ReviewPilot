import type { MessageChannel, MessageType } from "@prisma/client";

import type { AutomationKind, DueSend } from "@/lib/automations/types";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/render-template";
import { type CustomerRecipient, resolveRecipient } from "@/lib/send-message";

/**
 * "Bring customers back at the right time." Two conservative passes off a
 * customer's real visit history (`Appointment` records, summarized by the
 * `Customer.lastAppointmentAt` cache):
 *
 *   - rebooking_reminder — PREDICTIVE: nudge a customer when they're overdue
 *     relative to *their own* learned visit cadence (the median gap between past
 *     visits), with a default interval when their history is too thin to learn
 *     one. This replaces the old fixed 60–120 day window.
 *   - win_back — still a fixed 120–365 day window (staged, multi-touch win-back
 *     is a later phase). Runs after rebooking and never double-touches: a
 *     customer nudged to rebook in this run is excluded from win-back, so a
 *     single cron run sends a customer at most one of the two.
 *
 * The cron runs daily, so the danger is re-nudging the same person every day.
 * Dedup is query-based with no new schema: skip a customer if we've already sent
 * THIS nudge type since their `lastAppointmentAt`. When they book again that date
 * moves forward, their cadence recomputes off the new appointment, and a fresh
 * nudge becomes eligible next cycle — so each dry spell yields at most one
 * reminder and one win-back.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Predictive rebooking tunables ---------------------------------------
/** Cadence assumed when a customer has too little history to learn one. */
const DEFAULT_INTERVAL_DAYS = 45;
/** Min consecutive-visit gaps needed to learn a cadence (1 gap ⇒ 2 visits). */
const MIN_GAPS_TO_LEARN = 1;
/** Clamp a learned cadence so a data-entry fluke can't make it absurd. */
const MIN_INTERVAL_DAYS = 14;
const MAX_INTERVAL_DAYS = 365;
/**
 * A customer becomes due to rebook once they pass their own interval, and stays
 * due until they reach this multiple of it. Past that they're treated as cold
 * and left to win-back rather than rebooking — this is what keeps a very
 * overdue customer from being grabbed by the rebooking pass forever.
 */
const OVERDUE_CEILING = 2;
/**
 * Global staleness guard: never *start* a rebooking nudge for someone whose last
 * visit is older than this. Stops the first run from blasting the back-catalog
 * of long-cold customers, and bounds the candidate query. (Matches the win-back
 * ceiling, so customers colder than this fall to neither pass.)
 */
const REBOOK_MAX_STALE_DAYS = 365;

// --- Win-back window (fixed; staged win-back is a later phase) ------------
const WIN_BACK_MIN_DAYS = 120;
const WIN_BACK_MAX_DAYS = 365;

/** A candidate needs these beyond `CustomerRecipient` for rendering + dedup. */
type RebookCandidate = CustomerRecipient & {
  name: string;
  lastAppointmentAt: Date | null;
};

export async function findRebookingNudges(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date = new Date(),
): Promise<DueSend[]> {
  const due: DueSend[] = [];
  // Customers handed a rebooking nudge in THIS run are off-limits to win-back,
  // so a single cron run never sends one customer both messages.
  const rebookedThisRun = new Set<string>();

  // ===== Pass 1: predictive rebooking =====================================
  const rebookFloor = new Date(now.getTime() - REBOOK_MAX_STALE_DAYS * DAY_MS);
  const withHistory = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      lastAppointmentAt: { not: null, gt: rebookFloor },
    },
    include: {
      appointments: { select: { date: true }, orderBy: { date: "asc" } },
    },
  });

  // Overdue = past their own cadence, but not yet so far past it they're cold.
  const overdue = withHistory.filter((c) => {
    const interval = computeIntervalDays(c.appointments.map((a) => a.date));
    const daysSince = (now.getTime() - c.lastAppointmentAt!.getTime()) / DAY_MS;
    return daysSince >= interval && daysSince < interval * OVERDUE_CEILING;
  });

  for (const item of await buildPass(business, "rebooking_reminder", overdue)) {
    due.push(item);
    if (item.customer) rebookedThisRun.add(item.customer.id);
  }

  // ===== Pass 2: win-back (fixed window, de-conflicted) ===================
  const newest = new Date(now.getTime() - WIN_BACK_MIN_DAYS * DAY_MS); // ≥120 days old…
  const oldest = new Date(now.getTime() - WIN_BACK_MAX_DAYS * DAY_MS); // …but ≤365
  const coldCustomers = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      lastAppointmentAt: { lte: newest, gt: oldest },
    },
  });
  const winBackCandidates = coldCustomers.filter((c) => !rebookedThisRun.has(c.id));
  due.push(...(await buildPass(business, "win_back", winBackCandidates)));

  return due;
}

/**
 * Median gap (in days) between a customer's consecutive visits, or the default
 * interval when there's too little history to learn one. Median (not mean) so a
 * single unusually long gap doesn't distort the cadence; clamped so bad data
 * can't produce an absurd interval.
 */
function computeIntervalDays(visitDates: Date[]): number {
  // Need at least MIN_GAPS_TO_LEARN gaps (one fewer than the visit count).
  if (visitDates.length < MIN_GAPS_TO_LEARN + 1) return DEFAULT_INTERVAL_DAYS;
  const sorted = [...visitDates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / DAY_MS);
  }
  const median = medianOf(gaps);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, median));
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Shared tail for both passes: drop anyone already nudged with this type since
 * their last visit (the per-dry-spell dedup), load the business's template
 * (falling back to the seed copy), and render one send per reachable customer —
 * so a preview counts exactly what the cron would send.
 */
async function buildPass(
  business: { id: string; name: string; googleReviewLink: string | null },
  type: "rebooking_reminder" | "win_back",
  candidates: RebookCandidate[],
): Promise<DueSend[]> {
  if (candidates.length === 0) return [];

  // Who already got this nudge type, and when (latest)?
  const ids = candidates.map((c) => c.id);
  const priorNudges = await prisma.message.findMany({
    where: { businessId: business.id, type, customerId: { in: ids } },
    select: { customerId: true, createdAt: true },
  });
  const lastNudgedAt = new Map<string, Date>();
  for (const m of priorNudges) {
    if (!m.customerId) continue;
    const prev = lastNudgedAt.get(m.customerId);
    if (!prev || m.createdAt > prev) lastNudgedAt.set(m.customerId, m.createdAt);
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { businessId_type: { businessId: business.id, type } },
  });
  const body = template?.body ?? DEFAULT_TEMPLATES.find((t) => t.type === type)!.body;

  const due: DueSend[] = [];
  for (const customer of candidates) {
    // Already nudged with this type since their last appointment? Leave them be.
    const nudgedAt = lastNudgedAt.get(customer.id);
    if (customer.lastAppointmentAt && nudgedAt && nudgedAt > customer.lastAppointmentAt) {
      continue;
    }

    const channel = pickChannel(customer);
    if (!channel) continue; // no reachable contact (no phone/opted out, no email)
    if (!resolveRecipient({ channel, customer }).ok) continue;

    due.push({
      automation: type as AutomationKind,
      channel,
      type: type as MessageType,
      body: renderTemplate(body, {
        businessName: business.name,
        customerName: customer.name,
        reviewLink: business.googleReviewLink,
      }),
      recipientLabel: `customer ${customer.id} (${customer.name})`,
      customer,
    });
  }

  return due;
}

/** Prefer SMS when reachable, else email, else unreachable. */
function pickChannel(c: {
  phone: string | null;
  email: string | null;
  smsOptedOut: boolean;
}): MessageChannel | null {
  if (c.phone && !c.smsOptedOut) return "sms";
  if (c.email) return "email";
  return null;
}
