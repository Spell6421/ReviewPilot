"use server";

import { revalidatePath } from "next/cache";
import { MissedLeadStatus } from "@prisma/client";

import { requireCurrentBusiness } from "@/lib/current-business";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/send-message";

export type MissedLeadFormState = {
  error?: string;
  successAt?: number;
};

const VALID_STATUSES = new Set<string>(["new", "contacted", "booked", "lost"]);

/**
 * Create a missed-lead row manually — the owner saw a missed call and is
 * logging it here. Phone is optional but recommended; we keep it loose so a
 * caller-ID-less missed call can still be recorded with just a name + notes.
 */
export async function createMissedLeadAction(
  _prev: MissedLeadFormState,
  formData: FormData,
): Promise<MissedLeadFormState> {
  const { business } = await requireCurrentBusiness();

  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Name is required." };

  // Phone is optional for a missed lead, but if given it must be sendable.
  const phone = normalizePhone(phoneRaw);
  if (phoneRaw && !phone) {
    return { error: "Enter a valid phone number, e.g. +15551234567 or 555-123-4567." };
  }

  await prisma.missedLead.create({
    data: { businessId: business.id, name, phone, notes },
  });

  revalidatePath("/missed-leads");
  revalidatePath("/dashboard");
  return { successAt: Date.now() };
}

/**
 * Transition a lead's status. Owner-driven for now: there's no inbound
 * Twilio webhook yet, so the owner marks `contacted` / `booked` / `lost`
 * by hand. `booked` is what the dashboard counts as "recovered".
 */
export async function updateMissedLeadStatusAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();

  const id = String(formData.get("id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  if (!id || !VALID_STATUSES.has(statusRaw)) return;

  await prisma.missedLead.updateMany({
    where: { id, businessId: business.id },
    data: { status: statusRaw as MissedLeadStatus },
  });

  revalidatePath("/missed-leads");
  revalidatePath("/dashboard");
}

/**
 * Delete a missed lead. Scoped to current business so a crafted form can't
 * touch another business's row.
 */
export async function deleteMissedLeadAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.missedLead.deleteMany({
    where: { id, businessId: business.id },
  });

  revalidatePath("/missed-leads");
  revalidatePath("/dashboard");
}

export type SendRecoveryFormState = {
  error?: string;
  successAt?: number;
};

/**
 * Send the missed-call-recovery message to a lead. The lead isn't a Customer
 * yet, so the resulting Message row has customerId = null. The lead is also
 * auto-advanced from `new` → `contacted` so the owner can see at a glance
 * which leads still need outreach.
 *
 * The message is logged as `queued`, sent through Twilio, then flipped to
 * `sent` / `failed`. The lead advances to `contacted` regardless of send
 * outcome — the owner attempted outreach either way.
 */
export async function sendRecoveryMessageAction(
  _prev: SendRecoveryFormState,
  formData: FormData,
): Promise<SendRecoveryFormState> {
  const { business } = await requireCurrentBusiness();

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "Message can't be empty." };

  const lead = await prisma.missedLead.findFirst({
    where: { id, businessId: business.id },
  });
  if (!lead) return { error: "Missed lead not found." };
  if (!lead.phone) {
    return { error: "This lead has no phone number on file." };
  }

  // Advance new → contacted: the owner attempted outreach regardless of how the
  // send below turns out.
  if (lead.status === "new") {
    await prisma.missedLead.update({
      where: { id: lead.id },
      data: { status: "contacted" },
    });
  }

  // Same shared send path the rest of the app uses (records, sends, flips).
  const result = await sendMessage({
    businessId: business.id,
    businessName: business.name,
    channel: "sms",
    type: "missed_call_recovery",
    body,
    missedLead: lead,
  });

  revalidatePath("/missed-leads");
  revalidatePath("/messages");
  revalidatePath("/dashboard");

  if (result.status === "skipped") {
    return { error: "This lead has no phone number on file." };
  }
  if (result.status === "failed") {
    return { error: `Logged, but the SMS failed to send: ${result.error}` };
  }
  return { successAt: Date.now() };
}
