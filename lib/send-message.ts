import type { MessageChannel, MessageType } from "@prisma/client";

import { messageEmailSubjects } from "@/lib/default-templates";
import { fillFeedbackLink } from "@/lib/feedback";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSms } from "@/lib/twilio";

/**
 * The single send path for the whole app. Both the manual UI actions and the
 * automation engine call this so there's exactly one place that:
 *   1. resolves the recipient and guards opt-out / missing-contact,
 *   2. records the attempt as a `queued` Message (so every send is logged),
 *   3. sends via Twilio or Resend,
 *   4. flips the row to `sent` (+ providerSid) or `failed`.
 *
 * It takes an already-final `body` — template rendering happens in the caller,
 * since the manual flow sends owner-typed text and automation renders a template.
 *
 * Server-only (imports Twilio/Resend secrets); never import into a client component.
 */

/** A reason a send was not attempted (no Message row is created in these cases). */
export type SendSkipReason = "no_recipient" | "no_phone" | "no_email" | "opted_out";

export type SendMessageResult =
  | { status: "sent"; messageId: string }
  | { status: "failed"; messageId: string; error: string }
  | { status: "skipped"; reason: SendSkipReason };

/** Minimal customer shape this needs — a full Prisma Customer satisfies it. */
export type CustomerRecipient = {
  id: string;
  phone: string | null;
  email: string | null;
  smsOptedOut: boolean;
};

/** Minimal missed-lead shape — a full Prisma MissedLead satisfies it. */
export type MissedLeadRecipient = {
  id: string;
  phone: string | null;
};

export type SendMessageParams = {
  businessId: string;
  businessName: string;
  channel: MessageChannel;
  type: MessageType;
  /** Final, already-rendered message text. */
  body: string;
  /** Send to a customer (sms or email)… */
  customer?: CustomerRecipient | null;
  /** …or to a missed lead (sms only — leads have no email field). */
  missedLead?: MissedLeadRecipient | null;
};

/** The recipient resolution + guard logic, with no side effects. */
export type ResolvedRecipient =
  | { ok: true; to: string; customerId: string | null; missedLeadId: string | null }
  | { ok: false; reason: SendSkipReason };

/**
 * Decide whether a message can be sent and to what address — the same guard
 * `sendMessage` applies, exposed separately so the automation engine can preview
 * exactly what *would* send without sending. Pure: no DB, no network.
 */
export function resolveRecipient(p: {
  channel: MessageChannel;
  customer?: CustomerRecipient | null;
  missedLead?: MissedLeadRecipient | null;
}): ResolvedRecipient {
  if (p.channel === "sms") {
    if (p.customer) {
      if (p.customer.smsOptedOut) return { ok: false, reason: "opted_out" };
      const phone = p.customer.phone ? normalizePhone(p.customer.phone) ?? p.customer.phone : null;
      if (!phone) return { ok: false, reason: "no_phone" };
      return { ok: true, to: phone, customerId: p.customer.id, missedLeadId: null };
    }
    if (p.missedLead) {
      const phone = p.missedLead.phone ? normalizePhone(p.missedLead.phone) ?? p.missedLead.phone : null;
      if (!phone) return { ok: false, reason: "no_phone" };
      return { ok: true, to: phone, customerId: null, missedLeadId: p.missedLead.id };
    }
    return { ok: false, reason: "no_recipient" };
  }
  // Email — only customers carry an email address.
  if (!p.customer) return { ok: false, reason: "no_recipient" };
  if (!p.customer.email) return { ok: false, reason: "no_email" };
  return { ok: true, to: p.customer.email, customerId: p.customer.id, missedLeadId: null };
}

export async function sendMessage(p: SendMessageParams): Promise<SendMessageResult> {
  // 1. Resolve the recipient (shared with the preview path).
  const resolved = resolveRecipient(p);
  if (!resolved.ok) return { status: "skipped", reason: resolved.reason };
  const { to, customerId, missedLeadId } = resolved;

  // 2. Fill {{feedbackLink}} just-in-time. Done here, after we know the send
  //    will be attempted, so a Feedback row is only ever minted for a real send
  //    (the pure find*/preview path leaves the placeholder untouched). Only
  //    customer sends carry one — leads have no feedback flow.
  let body = p.body.trim();
  if (customerId) {
    body = await fillFeedbackLink(body, { businessId: p.businessId, customerId });
  }

  // 3. Log the attempt before sending so it survives any send failure.
  const message = await prisma.message.create({
    data: {
      businessId: p.businessId,
      customerId,
      missedLeadId,
      channel: p.channel,
      type: p.type,
      body,
      status: "queued",
    },
  });

  // 4. Send, then 5. flip the row based on the result.
  let providerSid: string | undefined;
  let sendOk: boolean;
  let sendError: string | undefined;
  if (p.channel === "sms") {
    const r = await sendSms(to, body);
    sendOk = r.ok;
    if (r.ok) providerSid = r.sid;
    else sendError = r.error;
  } else {
    const subject = `${p.businessName} — ${messageEmailSubjects[p.type] ?? "A quick note"}`;
    const r = await sendEmail(to, subject, body);
    sendOk = r.ok;
    if (r.ok) providerSid = r.id;
    else sendError = r.error;
  }

  await prisma.message.update({
    where: { id: message.id },
    data: sendOk
      ? { status: "sent", sentAt: new Date(), providerSid }
      : { status: "failed" },
  });

  return sendOk
    ? { status: "sent", messageId: message.id }
    : { status: "failed", messageId: message.id, error: sendError! };
}
