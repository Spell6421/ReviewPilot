import type {
  MessageStatus,
  MessageTemplateType,
  MissedLeadStatus,
} from "@prisma/client";

export const DEFAULT_TEMPLATES: { type: MessageTemplateType; body: string }[] = [
  {
    type: "review_request",
    body: "Thanks for visiting {{businessName}} — would you mind leaving us a quick Google review? {{reviewLink}}",
  },
  {
    type: "review_follow_up",
    body: "Just checking in — if you had a good experience with {{businessName}}, we'd really appreciate a quick review: {{reviewLink}}",
  },
  {
    type: "missed_call_recovery",
    body: "Sorry we missed your call at {{businessName}}. Would you like to book an appointment?",
  },
  {
    type: "rebooking_reminder",
    body: "Hi {{customerName}}, it's been a while! Ready to book your next visit at {{businessName}}?",
  },
  {
    type: "win_back",
    body: "We miss you at {{businessName}}, {{customerName}}! Here's a little nudge to come back and see us.",
  },
];

// Display order used by the Settings template editor.
export const TEMPLATE_ORDER: MessageTemplateType[] = DEFAULT_TEMPLATES.map(
  (t) => t.type,
);

// Keyed on `string` so it works for both MessageTemplateType (templates) and
// MessageType (sent messages), which share the same five string values but are
// nominally distinct enums in the generated Prisma client.
export const messageTypeLabels: Record<string, string> = {
  review_request: "Review request",
  review_follow_up: "Review follow-up",
  rebooking_reminder: "Rebooking reminder",
  missed_call_recovery: "Missed-call recovery",
  win_back: "Win-back",
};

// Email subject lines per message type. SMS has no subject; email needs one.
// The business name is prepended at send time (see messages/actions.ts).
export const messageEmailSubjects: Record<string, string> = {
  review_request: "How was your visit?",
  review_follow_up: "A quick favor",
  rebooking_reminder: "Ready for your next visit?",
  missed_call_recovery: "Sorry we missed your call",
  win_back: "We miss you!",
};

export const messageStatusLabels: Record<MessageStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  replied: "Replied",
};

export function messageStatusVariant(
  status: MessageStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "replied":
      return "default";
    case "sent":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export const missedLeadStatusLabels: Record<MissedLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  booked: "Booked",
  lost: "Lost",
};

export const MISSED_LEAD_STATUS_ORDER: MissedLeadStatus[] = [
  "new",
  "contacted",
  "booked",
  "lost",
];

export function missedLeadStatusVariant(
  status: MissedLeadStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "booked":
      return "default";
    case "contacted":
      return "secondary";
    case "lost":
      return "destructive";
    default:
      return "outline";
  }
}
