import type { MessageChannel, MessageType } from "@prisma/client";

import type { CustomerRecipient, MissedLeadRecipient } from "@/lib/send-message";

/**
 * Which automation produced a given send. Distinct from `MessageType` because
 * the missed-call follow-up reuses the `missed_call_recovery` message type but
 * is its own automation, and rebooking splits into two kinds.
 */
export type AutomationKind =
  | "review_follow_up"
  | "rebooking_reminder"
  | "win_back"
  | "missed_call_follow_up";

/**
 * One message an automation has decided to send, fully resolved and rendered.
 * The `find*` functions return these; the cron sends them and the preview just
 * counts them — so both paths describe the exact same set of sends.
 */
export type DueSend = {
  automation: AutomationKind;
  channel: MessageChannel;
  /** The MessageType to record/send (may differ from `automation`). */
  type: MessageType;
  /** Final, already-rendered message text. */
  body: string;
  /** Human-readable label for failure logs, e.g. "customer <id> (Jane Doe)". */
  recipientLabel: string;
  customer?: CustomerRecipient | null;
  missedLead?: MissedLeadRecipient | null;
};
