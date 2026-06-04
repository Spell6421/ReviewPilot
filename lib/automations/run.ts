import { findMissedCallFollowUps } from "@/lib/automations/missed-call";
import { findRebookingNudges } from "@/lib/automations/rebooking";
import { findReviewFollowUps } from "@/lib/automations/review-follow-up";
import type { AutomationKind, DueSend } from "@/lib/automations/types";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/send-message";

/**
 * The automation engine. Every automation is split into a `find*` step (a pure
 * lookup that returns the exact messages it would send) and the send step here.
 * The cron route calls `runAutomations` (find + send); the dashboard preview
 * calls `findDueSends` and only counts — so what the owner previews is precisely
 * what the cron will send.
 *
 * There's no logged-in user at cron time, so we enumerate businesses directly;
 * each `find*` scopes its own queries by `business.id`.
 */

type Business = { id: string; name: string; googleReviewLink: string | null };

/** All the sends every automation would make for one business, right now. */
export async function findDueSends(business: Business, now: Date = new Date()): Promise<DueSend[]> {
  const [review, rebooking, missedCall] = await Promise.all([
    findReviewFollowUps(business, now),
    findRebookingNudges(business, now),
    findMissedCallFollowUps(business, now),
  ]);
  return [...review, ...rebooking, ...missedCall];
}

type Tally = { sent: number; skipped: number; failed: number };

export type AutomationSummary = {
  businesses: number;
  reviewFollowUps: Tally;
  rebookingNudges: Tally;
  missedCallFollowUps: Tally;
};

export async function runAutomations(now: Date = new Date()): Promise<AutomationSummary> {
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, googleReviewLink: true },
  });

  const summary: AutomationSummary = {
    businesses: businesses.length,
    reviewFollowUps: { sent: 0, skipped: 0, failed: 0 },
    rebookingNudges: { sent: 0, skipped: 0, failed: 0 },
    missedCallFollowUps: { sent: 0, skipped: 0, failed: 0 },
  };

  // rebooking_reminder and win_back both report under rebookingNudges.
  const bucketFor = (kind: AutomationKind): Tally =>
    kind === "review_follow_up"
      ? summary.reviewFollowUps
      : kind === "missed_call_follow_up"
        ? summary.missedCallFollowUps
        : summary.rebookingNudges;

  for (const business of businesses) {
    const due = await findDueSends(business, now);
    for (const item of due) {
      const bucket = bucketFor(item.automation);
      const result = await sendMessage({
        businessId: business.id,
        businessName: business.name,
        channel: item.channel,
        type: item.type,
        body: item.body,
        customer: item.customer,
        missedLead: item.missedLead,
      });
      if (result.status === "sent") {
        bucket.sent++;
      } else if (result.status === "failed") {
        bucket.failed++;
        // Automation runs unattended — log why so a `failed` count is debuggable.
        console.error(
          `[automations] ${item.automation} send failed for ${item.recipientLabel}: ${result.error}`,
        );
      } else {
        // find* already filters unsendable recipients, so a skip here means
        // state changed between find and send (e.g. a just-arrived STOP).
        bucket.skipped++;
      }
    }
  }

  return summary;
}
