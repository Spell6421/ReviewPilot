import type { DueSend } from "@/lib/automations/types";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/render-template";
import { resolveRecipient } from "@/lib/send-message";

/**
 * "Faster missed-call follow-up." After the owner sends a missed-call recovery
 * text, nudge the lead once more if they've gone quiet — they may have missed
 * the first message.
 *
 * A lead is due a follow-up when:
 *   - it's still in `contacted` limbo (not yet booked or marked lost), AND
 *   - its recovery SMS actually went `sent` 2–30 days ago (the anchor), AND
 *   - it has never replied (a reply is logged as a `replied` Message on the lead), AND
 *   - it hasn't already had a follow-up.
 *
 * The follow-up is its own message type (`missed_call_follow_up`), so dedup is a
 * clean "has a follow-up already?" check (mirroring the review follow-up) and
 * the body is an editable template in Settings. Leads only have a phone, so this
 * is SMS-only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_MIN_AGE_MS = 2 * DAY_MS; // wait at least 2 days after the first touch
const FOLLOW_UP_MAX_AGE_MS = 30 * DAY_MS; // ...but no older than 30

export async function findMissedCallFollowUps(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date = new Date(),
): Promise<DueSend[]> {
  const before = new Date(now.getTime() - FOLLOW_UP_MIN_AGE_MS); // anchor sent before this = old enough
  const after = new Date(now.getTime() - FOLLOW_UP_MAX_AGE_MS); // ...and after this = not too stale

  // Leads the owner reached out to but who haven't been resolved yet.
  const leads = await prisma.missedLead.findMany({
    where: { businessId: business.id, status: "contacted" },
  });
  if (leads.length === 0) return [];
  const ids = leads.map((l) => l.id);

  // Three facts per lead: did the recovery send land in the window (anchor),
  // have we already followed up, and have they replied?
  const [anchors, followed, replied] = await Promise.all([
    prisma.message.findMany({
      where: {
        businessId: business.id,
        type: "missed_call_recovery",
        status: "sent",
        sentAt: { gte: after, lte: before },
        missedLeadId: { in: ids },
      },
      select: { missedLeadId: true },
    }),
    prisma.message.findMany({
      where: {
        businessId: business.id,
        type: "missed_call_follow_up",
        missedLeadId: { in: ids },
        // A failed attempt doesn't count as a follow-up — exclude it so a
        // transient send failure retries on a later run (the 30-day anchor
        // window above bounds how long it can keep retrying).
        status: { not: "failed" },
      },
      select: { missedLeadId: true },
    }),
    prisma.message.findMany({
      where: {
        businessId: business.id,
        status: "replied",
        missedLeadId: { in: ids },
      },
      select: { missedLeadId: true },
    }),
  ]);

  const hasAnchor = new Set<string>();
  for (const m of anchors) if (m.missedLeadId) hasAnchor.add(m.missedLeadId);
  const exclude = new Set<string>();
  for (const m of followed) if (m.missedLeadId) exclude.add(m.missedLeadId);
  for (const m of replied) if (m.missedLeadId) exclude.add(m.missedLeadId);

  const template = await prisma.messageTemplate.findUnique({
    where: { businessId_type: { businessId: business.id, type: "missed_call_follow_up" } },
  });
  const body =
    template?.body ??
    DEFAULT_TEMPLATES.find((t) => t.type === "missed_call_follow_up")!.body;

  const due: DueSend[] = [];
  for (const lead of leads) {
    if (!hasAnchor.has(lead.id)) continue; // no delivered first touch → nothing to follow up
    if (exclude.has(lead.id)) continue; // already followed up, or they replied
    if (!resolveRecipient({ channel: "sms", missedLead: lead }).ok) continue;

    due.push({
      automation: "missed_call_follow_up",
      channel: "sms",
      type: "missed_call_follow_up",
      body: renderTemplate(body, {
        businessName: business.name,
        customerName: lead.name,
        reviewLink: business.googleReviewLink,
      }),
      recipientLabel: `lead ${lead.id} (${lead.name})`,
      missedLead: lead,
    });
  }

  return due;
}
