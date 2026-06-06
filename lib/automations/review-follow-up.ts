import type { MessageChannel } from "@prisma/client";

import type { DueSend } from "@/lib/automations/types";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/render-template";
import { resolveRecipient } from "@/lib/send-message";

/**
 * "Send a single review follow-up ~2 days after the review request, but only
 * once, and never to someone who already replied." (See AGENTS.md.)
 *
 * Detection is entirely query-based against existing Message rows — no new
 * schema. A customer is due a follow-up when:
 *   - a `review_request` actually went `sent` to them 2–30 days ago, AND
 *   - they have no `review_follow_up` yet (honors the one-follow-up cap), AND
 *   - they have never `replied` to us (a reply means they engaged — don't nag).
 *
 * The 30-day ceiling stops the first run from blasting the entire back-catalog
 * of historical requests; only a recent window is ever eligible.
 */

const FOLLOW_UP_MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000; // wait at least 2 days
const FOLLOW_UP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ...but no older than 30

export async function findReviewFollowUps(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date = new Date(),
): Promise<DueSend[]> {
  const before = new Date(now.getTime() - FOLLOW_UP_MIN_AGE_MS); // sent before this = old enough
  const after = new Date(now.getTime() - FOLLOW_UP_MAX_AGE_MS); // sent after this = not too stale

  // 1. Review requests that actually went out, inside the eligible window.
  const requests = await prisma.message.findMany({
    where: {
      businessId: business.id,
      type: "review_request",
      status: "sent",
      sentAt: { gte: after, lte: before },
      customerId: { not: null },
    },
    select: { customerId: true, channel: true },
    orderBy: { sentAt: "desc" },
  });
  if (requests.length === 0) return [];

  // Follow up on the same channel the latest request used (rows are newest-first).
  const channelByCustomer = new Map<string, MessageChannel>();
  for (const r of requests) {
    if (r.customerId && !channelByCustomer.has(r.customerId)) {
      channelByCustomer.set(r.customerId, r.channel);
    }
  }
  const candidateIds = [...channelByCustomer.keys()];

  // 2. Drop anyone who already got a follow-up, has ever replied, or has already
  //    rated us through the feedback page (a page submission isn't an SMS
  //    `replied` row, so it needs its own check — otherwise we'd nag someone who
  //    already told us how the visit went).
  const [followed, replied, rated] = await Promise.all([
    prisma.message.findMany({
      where: {
        businessId: business.id,
        type: "review_follow_up",
        customerId: { in: candidateIds },
        // A failed attempt doesn't count as a follow-up — exclude it so a
        // transient send failure retries on a later run (the 30-day anchor
        // ceiling above bounds how long it can keep retrying).
        status: { not: "failed" },
      },
      select: { customerId: true },
    }),
    prisma.message.findMany({
      where: {
        businessId: business.id,
        status: "replied",
        customerId: { in: candidateIds },
      },
      select: { customerId: true },
    }),
    prisma.feedback.findMany({
      where: {
        businessId: business.id,
        customerId: { in: candidateIds },
        rating: { not: null },
      },
      select: { customerId: true },
    }),
  ]);
  const exclude = new Set<string>();
  for (const m of followed) if (m.customerId) exclude.add(m.customerId);
  for (const m of replied) if (m.customerId) exclude.add(m.customerId);
  for (const f of rated) if (f.customerId) exclude.add(f.customerId);

  const dueIds = candidateIds.filter((id) => !exclude.has(id));
  if (dueIds.length === 0) return [];

  // 3. Load the business's follow-up template (fall back to the seed copy) and
  //    the due customers, then render one send each — only for customers we can
  //    actually reach on the chosen channel (so a preview matches reality).
  const template = await prisma.messageTemplate.findUnique({
    where: { businessId_type: { businessId: business.id, type: "review_follow_up" } },
  });
  const body =
    template?.body ??
    DEFAULT_TEMPLATES.find((t) => t.type === "review_follow_up")!.body;

  const customers = await prisma.customer.findMany({
    where: { id: { in: dueIds }, businessId: business.id },
  });

  const due: DueSend[] = [];
  for (const customer of customers) {
    const channel = channelByCustomer.get(customer.id) ?? "sms";
    if (!resolveRecipient({ channel, customer }).ok) continue;
    due.push({
      automation: "review_follow_up",
      channel,
      type: "review_follow_up",
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
