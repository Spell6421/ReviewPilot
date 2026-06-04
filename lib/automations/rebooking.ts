import type { MessageChannel, MessageType } from "@prisma/client";

import type { AutomationKind, DueSend } from "@/lib/automations/types";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/render-template";
import { resolveRecipient } from "@/lib/send-message";

/**
 * "Bring back customers who haven't booked in a while." Driven by
 * `Customer.lastAppointmentAt`, in two conservative passes:
 *
 *   - rebooking_reminder — 60–120 days since the last appointment
 *   - win_back           — 120–365 days since the last appointment
 *
 * The cron runs daily, so the danger is re-nudging the same person every day.
 * Dedup is query-based with no new schema: skip a customer if we've already sent
 * THIS nudge type since their `lastAppointmentAt`. When they rebook, that date
 * moves forward and a fresh nudge becomes eligible next cycle — so each dry
 * spell yields at most one reminder and one win-back.
 *
 * Windows are half-open (older-bound exclusive, newer-bound inclusive) so the
 * 120-day boundary belongs to win_back only — a customer never matches both
 * passes in one run. The 365-day ceiling keeps the first run from blasting the
 * entire back-catalog of long-cold customers.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const PASSES = [
  { type: "rebooking_reminder", minDays: 60, maxDays: 120 },
  { type: "win_back", minDays: 120, maxDays: 365 },
] as const;

export async function findRebookingNudges(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date = new Date(),
): Promise<DueSend[]> {
  const due: DueSend[] = [];

  for (const pass of PASSES) {
    const newest = new Date(now.getTime() - pass.minDays * DAY_MS); // at least minDays old…
    const oldest = new Date(now.getTime() - pass.maxDays * DAY_MS); // …but no older than maxDays

    const candidates = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        lastAppointmentAt: { lte: newest, gt: oldest },
      },
    });
    if (candidates.length === 0) continue;

    // Who already got this nudge type, and when (latest)?
    const ids = candidates.map((c) => c.id);
    const priorNudges = await prisma.message.findMany({
      where: { businessId: business.id, type: pass.type, customerId: { in: ids } },
      select: { customerId: true, createdAt: true },
    });
    const lastNudgedAt = new Map<string, Date>();
    for (const m of priorNudges) {
      if (!m.customerId) continue;
      const prev = lastNudgedAt.get(m.customerId);
      if (!prev || m.createdAt > prev) lastNudgedAt.set(m.customerId, m.createdAt);
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { businessId_type: { businessId: business.id, type: pass.type } },
    });
    const body =
      template?.body ?? DEFAULT_TEMPLATES.find((t) => t.type === pass.type)!.body;

    for (const customer of candidates) {
      // Already nudged since their last appointment? Leave them alone this cycle.
      const nudgedAt = lastNudgedAt.get(customer.id);
      if (customer.lastAppointmentAt && nudgedAt && nudgedAt > customer.lastAppointmentAt) {
        continue;
      }

      const channel = pickChannel(customer);
      if (!channel) continue; // no reachable contact (no phone/opted out, no email)
      if (!resolveRecipient({ channel, customer }).ok) continue;

      due.push({
        automation: pass.type as AutomationKind,
        channel,
        type: pass.type as MessageType,
        body: renderTemplate(body, {
          businessName: business.name,
          customerName: customer.name,
          reviewLink: business.googleReviewLink,
        }),
        recipientLabel: `customer ${customer.id} (${customer.name})`,
        customer,
      });
    }
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
