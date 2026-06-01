"use server";

import { revalidatePath } from "next/cache";
import { MessageChannel, MessageType } from "@prisma/client";

import { requireCurrentBusiness } from "@/lib/current-business";
import { messageEmailSubjects } from "@/lib/default-templates";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSms } from "@/lib/twilio";

export type SendMessageFormState = {
  error?: string;
  successAt?: number;
};

const VALID_TYPES = new Set<string>([
  "review_request",
  "review_follow_up",
  "rebooking_reminder",
  "missed_call_recovery",
  "win_back",
]);

const VALID_CHANNELS = new Set<string>(["sms", "email"]);

export async function sendMessageAction(
  _prev: SendMessageFormState,
  formData: FormData,
): Promise<SendMessageFormState> {
  const { business } = await requireCurrentBusiness();

  const customerId = String(formData.get("customerId") ?? "");
  const typeRaw = String(formData.get("type") ?? "");
  const channelRaw = String(formData.get("channel") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!VALID_TYPES.has(typeRaw)) return { error: "Invalid message type." };
  if (!VALID_CHANNELS.has(channelRaw)) return { error: "Invalid channel." };
  if (!body) return { error: "Message can't be empty." };

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: business.id },
  });
  if (!customer) return { error: "Customer not found." };

  if (channelRaw === "sms" && !customer.phone) {
    return { error: "This customer has no phone number on file." };
  }
  if (channelRaw === "sms" && customer.smsOptedOut) {
    return { error: "This customer opted out of SMS (they texted STOP). They can text START to opt back in." };
  }
  if (channelRaw === "email" && !customer.email) {
    return { error: "This customer has no email address on file." };
  }

  // Record the attempt first so every send is logged regardless of outcome.
  // Both channels start as `queued`, then flip to `sent` (storing the provider's
  // id) or `failed` based on the send result below.
  const message = await prisma.message.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      channel: channelRaw as MessageChannel,
      type: typeRaw as MessageType,
      body,
      status: "queued",
    },
  });

  let sendError: string | undefined;
  if (channelRaw === "sms") {
    // Safety net for rows created before phone normalization existed.
    const to = normalizePhone(customer.phone) ?? customer.phone!;
    const result = await sendSms(to, body);
    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? { status: "sent", sentAt: new Date(), providerSid: result.sid }
        : { status: "failed" },
    });
    if (!result.ok) sendError = result.error;
  } else {
    const subject = `${business.name} — ${messageEmailSubjects[typeRaw] ?? "A quick note"}`;
    const result = await sendEmail(customer.email!, subject, body);
    await prisma.message.update({
      where: { id: message.id },
      data: result.ok
        ? { status: "sent", sentAt: new Date(), providerSid: result.id }
        : { status: "failed" },
    });
    if (!result.ok) sendError = result.error;
  }

  revalidatePath("/messages");
  revalidatePath("/dashboard");
  revalidatePath("/customers");

  if (sendError) {
    const label = channelRaw === "sms" ? "SMS" : "email";
    return { error: `Logged, but the ${label} failed to send: ${sendError}` };
  }
  return { successAt: Date.now() };
}
