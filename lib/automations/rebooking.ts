import type { MessageChannel } from "@prisma/client";

import type { DueSend } from "@/lib/automations/types";
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
 *     one. This replaces the old fixed 60–120 day window. Stops nudging once a
 *     customer passes their interval × OVERDUE_CEILING — past that they're cold,
 *     and handed to win-back.
 *   - win_back — STAGED + cadence-aware: a customer who stays cold receives a
 *     short sequence of touches (capped at WIN_BACK_STAGES) at increasing
 *     intervals, instead of one fixed-window message. The sequence *starts*
 *     exactly where rebooking leaves off (interval × OVERDUE_CEILING, floored at
 *     WIN_BACK_FLOOR_DAYS) so the two passes are contiguous — no overlap, and no
 *     dead zone between "you're due" and "we miss you". Runs after rebooking and
 *     never double-touches: a customer nudged to rebook in this run is excluded
 *     from win-back, so a single cron run sends a customer at most one of the two.
 *
 * The cron runs daily, so the danger is re-nudging the same person every day.
 * Dedup is query-based with no new schema, anchored on `lastAppointmentAt`:
 *   - rebooking: skip if we've already sent a rebooking_reminder since the last visit.
 *   - win-back: the customer's *stage* is the count of win_back messages sent since
 *     the last visit; we send the next stage only once its day-since-visit threshold
 *     is reached, and a per-stage spacing guard stops a burst when a long-cold
 *     customer is discovered all at once.
 * When a customer books again that date moves forward, their cadence recomputes off
 * the new appointment, the win_back count resets to zero, and the whole sequence
 * re-arms — so each cold spell yields at most one rebooking nudge and one full
 * win-back sequence.
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
 * overdue customer from being grabbed by the rebooking pass forever. It's also
 * the seam between the two passes: win-back's first touch fires at exactly this
 * point (see computeColdThresholdDays), so the windows are contiguous.
 */
const OVERDUE_CEILING = 2;
/**
 * Global staleness guard: never *start* a rebooking nudge for someone whose last
 * visit is older than this. Stops the first run from blasting the back-catalog
 * of long-cold customers, and bounds the candidate query.
 */
const REBOOK_MAX_STALE_DAYS = 365;

// --- Staged, cadence-aware win-back --------------------------------------
/**
 * Days past a customer's last visit at which each successive win-back touch
 * becomes due, measured from their personal cold point (see
 * computeColdThresholdDays). The array length is the cap on touches per cold
 * spell. With the default cold point of WIN_BACK_FLOOR_DAYS, these realize the
 * ~60 / 120 / 360-day schedule from the roadmap; a longer-cadence customer's
 * whole sequence slides later in proportion to their own interval.
 */
const WIN_BACK_STAGE_OFFSETS = [0, 60, 300] as const;
const WIN_BACK_STAGES = WIN_BACK_STAGE_OFFSETS.length;
/**
 * Earliest a win-back can ever fire, even for a very frequent customer whose
 * interval × OVERDUE_CEILING would otherwise put the first touch only a few
 * weeks out. Keeps "we miss you" from landing right on the heels of the gentle
 * rebooking nudge.
 */
const WIN_BACK_FLOOR_DAYS = 60;
/**
 * Never send two win-back touches closer together than this. Stage thresholds
 * already space the touches out for a customer who goes cold while we're
 * watching; this guard is what stops a burst when a long-cold customer is
 * discovered all at once (e.g. first run, or a freshly imported back-catalog)
 * and several stages are technically "due" on the same day.
 */
const WIN_BACK_MIN_SPACING_DAYS = 45;
/**
 * Don't *enter* the win-back sequence for someone whose last visit is older than
 * this (~18 months). Bounds the candidate query and stops the first run from
 * resurrecting truly ancient customers. Wide enough to let the full staged
 * sequence (which can reach ~360+ days out) play through once started.
 */
const WIN_BACK_MAX_STALE_DAYS = 540;

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

  // ===== Pass 2: staged win-back (cadence-aware, de-conflicted) ===========
  due.push(...(await findStagedWinBacks(business, now, rebookedThisRun)));

  return due;
}

/**
 * The day-since-last-visit at which a customer's win-back sequence begins. It's
 * the rebooking overdue ceiling (interval × OVERDUE_CEILING) — so win-back picks
 * up exactly where rebooking stops — floored at WIN_BACK_FLOOR_DAYS so a very
 * frequent customer isn't escalated to "we miss you" only a couple of weeks
 * after their gentle rebook nudge.
 */
function computeColdThresholdDays(intervalDays: number): number {
  return Math.max(intervalDays * OVERDUE_CEILING, WIN_BACK_FLOOR_DAYS);
}

/**
 * Pass 2: the staged win-back sequence. A customer who stays cold gets up to
 * WIN_BACK_STAGES touches at increasing day-since-visit thresholds, each fired
 * at most once per cold spell.
 *
 * Stage = how many win_back messages we've already sent since the customer's
 * last visit (so a fresh booking, which moves `lastAppointmentAt` forward, resets
 * the count and re-arms the whole sequence). The next stage is due once both:
 *   - days-since-last-visit ≥ coldThreshold + WIN_BACK_STAGE_OFFSETS[stage], and
 *   - (for stages after the first) the previous touch is ≥ WIN_BACK_MIN_SPACING_DAYS old.
 *
 * `excludeIds` are customers already handed a rebooking nudge in this same run —
 * they're skipped so a single cron run never sends one customer both messages
 * (the de-confliction guarantee). A rebooking nudge on a *prior* run leaves no
 * mark here (we only count win_back messages), so it never blocks the sequence.
 */
async function findStagedWinBacks(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date,
  excludeIds: ReadonlySet<string>,
): Promise<DueSend[]> {
  // Cold enough to consider (≥ floor old) but not so ancient we won't bother.
  const newest = new Date(now.getTime() - WIN_BACK_FLOOR_DAYS * DAY_MS);
  const oldest = new Date(now.getTime() - WIN_BACK_MAX_STALE_DAYS * DAY_MS);
  const candidates = (
    await prisma.customer.findMany({
      where: {
        businessId: business.id,
        lastAppointmentAt: { lte: newest, gt: oldest },
      },
      include: {
        appointments: { select: { date: true }, orderBy: { date: "asc" } },
      },
    })
  ).filter((c) => !excludeIds.has(c.id));
  if (candidates.length === 0) return [];

  // Every win_back we've sent these customers (failed attempts excluded, so a
  // transient send failure retries on a later run instead of falsely advancing
  // the stage), to derive each one's current stage (count since their last
  // visit) and the date of their latest touch.
  const ids = candidates.map((c) => c.id);
  const priorWinBacks = await prisma.message.findMany({
    where: {
      businessId: business.id,
      type: "win_back",
      customerId: { in: ids },
      status: { not: "failed" },
    },
    select: { customerId: true, createdAt: true },
  });
  const sentDatesByCustomer = new Map<string, Date[]>();
  for (const m of priorWinBacks) {
    if (!m.customerId) continue;
    const list = sentDatesByCustomer.get(m.customerId);
    if (list) list.push(m.createdAt);
    else sentDatesByCustomer.set(m.customerId, [m.createdAt]);
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { businessId_type: { businessId: business.id, type: "win_back" } },
  });
  const body = template?.body ?? DEFAULT_TEMPLATES.find((t) => t.type === "win_back")!.body;

  const due: DueSend[] = [];
  for (const customer of candidates) {
    const lastVisit = customer.lastAppointmentAt!; // guaranteed by the query
    const sinceVisit = (sentDatesByCustomer.get(customer.id) ?? []).filter(
      (d) => d > lastVisit,
    );
    const stage = sinceVisit.length; // 0 ⇒ first touch not yet sent
    if (stage >= WIN_BACK_STAGES) continue; // sequence exhausted for this cold spell

    const interval = computeIntervalDays(customer.appointments.map((a) => a.date));
    const coldThreshold = computeColdThresholdDays(interval);
    const daysSince = (now.getTime() - lastVisit.getTime()) / DAY_MS;
    if (daysSince < coldThreshold + WIN_BACK_STAGE_OFFSETS[stage]) continue; // not due yet

    // Burst guard: don't fire a later stage right after the previous one.
    if (stage > 0) {
      const latest = sinceVisit.reduce((a, b) => (a > b ? a : b));
      if ((now.getTime() - latest.getTime()) / DAY_MS < WIN_BACK_MIN_SPACING_DAYS) continue;
    }

    const channel = pickChannel(customer);
    if (!channel) continue; // no reachable contact (no phone/opted out, no email)
    if (!resolveRecipient({ channel, customer }).ok) continue;

    due.push({
      automation: "win_back",
      channel,
      type: "win_back",
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
 * The rebooking pass's tail: drop anyone already nudged since their last visit
 * (the per-dry-spell dedup), load the business's template (falling back to the
 * seed copy), and render one send per reachable customer — so a preview counts
 * exactly what the cron would send. (Win-back has its own staged builder above.)
 */
async function buildPass(
  business: { id: string; name: string; googleReviewLink: string | null },
  type: "rebooking_reminder",
  candidates: RebookCandidate[],
): Promise<DueSend[]> {
  if (candidates.length === 0) return [];

  // Who already got this nudge type, and when (latest)? Failed attempts don't
  // count — excluding them lets a transient send failure retry on a later run
  // (the overdue window in Pass 1 bounds how long it can keep retrying).
  const ids = candidates.map((c) => c.id);
  const priorNudges = await prisma.message.findMany({
    where: {
      businessId: business.id,
      type,
      customerId: { in: ids },
      status: { not: "failed" },
    },
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
      automation: type,
      channel,
      type,
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
