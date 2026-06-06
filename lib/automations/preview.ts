import { findDueSends } from "@/lib/automations/run";
import type { AutomationKind } from "@/lib/automations/types";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/resend";
import { isSmsConfigured } from "@/lib/twilio";

/**
 * Builds the "test my setup" report shown on the dashboard: plain-language
 * connection checks plus a count of what each automation *would* send right now.
 * Read-only — it reuses the engine's `findDueSends`, so it never sends anything
 * and can't drift from what the real cron does.
 */

export type PreviewCheck = { label: string; ok: boolean; note?: string };

export type PreviewLine = {
  kind: AutomationKind;
  label: string;
  description: string;
  count: number;
};

export type AutomationPreview = {
  checks: PreviewCheck[];
  lines: PreviewLine[];
  totalDue: number;
};

const LINE_META: Record<AutomationKind, { label: string; description: string }> = {
  review_follow_up: {
    label: "Review follow-ups",
    description: "people who got a review request 2+ days ago and haven't replied",
  },
  rebooking_reminder: {
    label: "Rebooking reminders",
    description: "customers overdue for their next visit based on their own booking history",
  },
  win_back: {
    label: "Win-backs",
    description: "cold customers, due for the next message in their staged win-back sequence",
  },
  missed_call_follow_up: {
    label: "Missed-call follow-ups",
    description: "leads you contacted who haven't replied",
  },
};

const LINE_ORDER: AutomationKind[] = [
  "review_follow_up",
  "rebooking_reminder",
  "win_back",
  "missed_call_follow_up",
];

export async function buildAutomationPreview(
  business: { id: string; name: string; googleReviewLink: string | null },
  now: Date = new Date(),
): Promise<AutomationPreview> {
  const [customerCount, due] = await Promise.all([
    prisma.customer.count({ where: { businessId: business.id } }),
    findDueSends(business, now),
  ]);

  const counts = new Map<AutomationKind, number>();
  for (const item of due) {
    counts.set(item.automation, (counts.get(item.automation) ?? 0) + 1);
  }

  const lines: PreviewLine[] = LINE_ORDER.map((kind) => ({
    kind,
    label: LINE_META[kind].label,
    description: LINE_META[kind].description,
    count: counts.get(kind) ?? 0,
  }));

  const checks: PreviewCheck[] = [
    {
      label: "Text messaging connected",
      ok: isSmsConfigured(),
      note: isSmsConfigured() ? undefined : "Add your Twilio details so texts can send.",
    },
    {
      label: "Email connected",
      ok: isEmailConfigured(),
      note: isEmailConfigured() ? undefined : "Add your Resend key so emails can send.",
    },
    {
      label: "Google review link set",
      ok: Boolean(business.googleReviewLink),
      note: business.googleReviewLink
        ? undefined
        : "Add it in Settings so review messages include a link.",
    },
    {
      label: "Database connected",
      ok: true,
    },
    {
      label: `${customerCount} customer${customerCount === 1 ? "" : "s"} loaded`,
      ok: customerCount > 0,
      note: customerCount > 0 ? undefined : "Add or import customers to get started.",
    },
  ];

  return { checks, lines, totalDue: due.length };
}
