"use server";

import { revalidatePath } from "next/cache";

import { recomputeLastAppointment } from "@/lib/appointments";
import { requireCurrentBusiness } from "@/lib/current-business";
import { prisma } from "@/lib/prisma";

export type AppointmentFormState = {
  error?: string;
  /** Bumps on success so the dialog can react and close itself. */
  successAt?: number;
};

/**
 * Normalize a parsed date to midnight UTC (Open-Q1). `<input type="date">` and
 * CSV dates are calendar days; pinning to UTC midnight keeps the D-13 dedup
 * comparison byte-clean so the same calendar day always matches itself.
 */
function toMidnightUtc(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/**
 * Add a single visit (Appointment) to a customer owned by the current business.
 * Verifies ownership BEFORE inserting (T-02-03), enforces D-13 dedup on the
 * exact same date + service, then recomputes the lastAppointmentAt cache (D-04).
 */
export async function addAppointmentAction(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { business } = await requireCurrentBusiness();

  const customerId = String(formData.get("customerId") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim() || null;

  if (!customerId) {
    return { error: "Customer not found." };
  }

  // Ownership gate: only an owned customer can receive a visit (T-02-03).
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: business.id },
    select: { id: true },
  });
  if (!customer) {
    return { error: "Customer not found." };
  }

  // Date validation mirrors createCustomerAction's parse path.
  if (!dateRaw) {
    return { error: "Enter a valid date." };
  }
  const parsed = new Date(dateRaw);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Enter a valid date." };
  }
  const date = toMidnightUtc(parsed);

  // D-13 dedup: same customer + same date + same service is a duplicate. A
  // same-date row with a DIFFERENT service is a distinct visit and allowed.
  const dupe = await prisma.appointment.findFirst({
    where: { customerId, businessId: business.id, date, service },
    select: { id: true },
  });
  if (dupe) {
    return { error: "That visit is already recorded." };
  }

  await prisma.appointment.create({
    data: {
      businessId: business.id,
      customerId,
      date,
      service,
      source: "manual",
    },
  });

  await recomputeLastAppointment(customerId, business.id);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { successAt: Date.now() };
}

/**
 * Delete a single visit. Re-checks ownership in the `where` via `deleteMany`
 * (D-12, T-02-02) so a crafted id from another business deletes 0 rows, then
 * recomputes the cache (which may set it to null when no visits remain).
 */
export async function deleteAppointmentAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();

  const id = String(formData.get("id") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!id || !customerId) return;

  await prisma.appointment.deleteMany({
    where: { id, businessId: business.id },
  });

  await recomputeLastAppointment(customerId, business.id);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
