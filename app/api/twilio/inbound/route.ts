import { prisma } from "@/lib/prisma";
import { classifyInboundKeyword, parseTwilioWebhook } from "@/lib/twilio";

/**
 * Twilio inbound SMS webhook. Configure this URL as the "A MESSAGE COMES IN"
 * handler on your Twilio number (HTTP POST).
 *
 * The MVP uses a single shared Twilio number, so we attribute an incoming text
 * to a business by finding the most recent outbound SMS we sent to that phone
 * (`From`). That parent message gives us the business, the customer/lead, and a
 * sensible `type` to copy. We then store the reply as its own `replied` Message
 * row — which is what the dashboard's "Replies received" counts, and leaves the
 * original outbound `sent` row (and the "requests sent" count) untouched.
 *
 * If we can't match a prior outbound message, we log and drop it: with one
 * shared number there's no reliable way to know which business a cold inbound
 * belongs to. Per-business numbers would remove this limitation later.
 *
 * Always responds 2xx with empty TwiML so Twilio doesn't auto-reply or retry.
 */
export async function POST(request: Request) {
  const { params, valid } = await parseTwilioWebhook(request);

  if (!valid && process.env.NODE_ENV === "production") {
    return new Response("Invalid signature", { status: 403 });
  }
  if (!valid) {
    console.warn("[twilio/inbound] signature did not validate — proceeding (dev only)");
  }

  const from = params.From;
  const body = params.Body ?? "";
  const sid = params.MessageSid ?? params.SmsSid ?? null;

  if (from) {
    const parent = await prisma.message.findFirst({
      where: {
        channel: "sms",
        OR: [{ customer: { phone: from } }, { missedLead: { phone: from } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (parent) {
      await prisma.message.create({
        data: {
          businessId: parent.businessId,
          customerId: parent.customerId,
          missedLeadId: parent.missedLeadId,
          channel: "sms",
          type: parent.type,
          body,
          status: "replied",
          sentAt: new Date(),
          providerSid: sid,
        },
      });

      // Honor STOP/START. Twilio handles the carrier-level STOP reply itself;
      // we mirror it so our own send paths stop (or resume) messaging this
      // customer. Only customers carry an opt-out flag — leads don't.
      const keyword = classifyInboundKeyword(body);
      if (keyword && parent.customerId) {
        await prisma.customer.update({
          where: { id: parent.customerId },
          data:
            keyword === "opt_out"
              ? { smsOptedOut: true, smsOptedOutAt: new Date() }
              : { smsOptedOut: false, smsOptedOutAt: null },
        });
      }
    } else {
      console.warn(`[twilio/inbound] no prior outbound message matched ${from}; dropping reply`);
    }
  }

  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
