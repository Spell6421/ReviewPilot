"use server";

import { revalidatePath } from "next/cache";
import { MessageChannel, MessageType } from "@prisma/client";

import { requireCurrentBusiness } from "@/lib/current-business";
import { prisma } from "@/lib/prisma";
import { sendMessage, type SendSkipReason } from "@/lib/send-message";

export type SendMessageFormState = {
  error?: string;
  successAt?: number;
};

const VALID_TYPES = new Set<string>([
  "review_request",
  "review_follow_up",
  "rebooking_reminder",
  "missed_call_recovery",
  "missed_call_follow_up",
  "win_back",
]);

const VALID_CHANNELS = new Set<string>(["sms", "email"]);

// Map a core "skipped" reason onto the customer-facing copy this form has always
// shown. A skip means no Message row was created (same as the old pre-send guards).
function skipReasonMessage(reason: SendSkipReason): string {
  switch (reason) {
    case "opted_out":
      return "This customer opted out of SMS (they texted STOP). They can text START to opt back in.";
    case "no_phone":
      return "This customer has no phone number on file.";
    case "no_email":
      return "This customer has no email address on file.";
    case "no_recipient":
      return "This customer has no contact info on file.";
  }
}

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

  // One shared send path: records the attempt, sends, flips sent/failed.
  const result = await sendMessage({
    businessId: business.id,
    businessName: business.name,
    channel: channelRaw as MessageChannel,
    type: typeRaw as MessageType,
    body,
    customer,
  });

  revalidatePath("/messages");
  revalidatePath("/dashboard");
  revalidatePath("/customers");

  if (result.status === "skipped") {
    return { error: skipReasonMessage(result.reason) };
  }
  if (result.status === "failed") {
    const label = channelRaw === "sms" ? "SMS" : "email";
    return { error: `Logged, but the ${label} failed to send: ${result.error}` };
  }
  return { successAt: Date.now() };
}
