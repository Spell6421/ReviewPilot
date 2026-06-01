import { prisma } from "@/lib/prisma";
import { mapTwilioStatus, parseTwilioWebhook } from "@/lib/twilio";

/**
 * Twilio delivery status callback. Configure this URL as the `statusCallback`
 * on outbound sends (or on the Messaging Service): Twilio POSTs here each time
 * a message's delivery state changes (queued → sent → delivered, or failed).
 *
 * We map the Twilio status onto our MessageStatus enum and update the row whose
 * `providerSid` matches the callback's `MessageSid`. A `replied` row is left
 * alone — an inbound reply is a stronger signal than a delivery receipt.
 *
 * Always returns 2xx (even on no-op) so Twilio doesn't retry; signature
 * failures are the one exception (403) since those aren't really from Twilio.
 */
export async function POST(request: Request) {
  const { params, valid } = await parseTwilioWebhook(request);

  if (!valid && process.env.NODE_ENV === "production") {
    return new Response("Invalid signature", { status: 403 });
  }
  if (!valid) {
    // In dev (e.g. via an ngrok tunnel) proxy quirks can break signature
    // matching. Warn but proceed so the flow is testable locally.
    console.warn("[twilio/status] signature did not validate — proceeding (dev only)");
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const twilioStatus = params.MessageStatus ?? params.SmsStatus;
  if (!sid || !twilioStatus) {
    return new Response("Missing MessageSid/MessageStatus", { status: 400 });
  }

  const mapped = mapTwilioStatus(twilioStatus);
  if (mapped) {
    // Never downgrade a `replied` row — an inbound reply outranks a receipt.
    await prisma.message.updateMany({
      where: { providerSid: sid, status: { not: "replied" } },
      data: { status: mapped },
    });
    // Stamp sentAt only the first time it reaches a sent state, so a later
    // `delivered` callback doesn't clobber the original send time.
    if (mapped === "sent") {
      await prisma.message.updateMany({
        where: { providerSid: sid, sentAt: null },
        data: { sentAt: new Date() },
      });
    }
  }

  return new Response(null, { status: 204 });
}
