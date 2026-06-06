"use server";

import { revalidatePath } from "next/cache";

import { recomputeLastAppointment } from "@/lib/appointments";
import { parseCustomersCsv } from "@/lib/csv-import";
import { requireCurrentBusiness } from "@/lib/current-business";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export type CustomerFormState = {
  error?: string;
  /** Bumps on success so the dialog can react and close itself. */
  successAt?: number;
};

/**
 * Create a customer row owned by the current business.
 * Requires at least a name plus phone or email (matches AGENTS.md CSV rules).
 */
export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { business } = await requireCurrentBusiness();

  const name = String(formData.get("name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const lastAppointmentRaw = String(formData.get("lastAppointmentAt") ?? "").trim();

  if (!name) {
    return { error: "Name is required." };
  }

  // Normalize to E.164 so the number is usable by Twilio. Reject a non-empty
  // phone we can't parse rather than silently storing something unsendable.
  const phone = normalizePhone(phoneRaw);
  if (phoneRaw && !phone) {
    return { error: "Enter a valid phone number, e.g. +15551234567 or 555-123-4567." };
  }
  if (!phone && !email) {
    return { error: "Add a phone number or an email — at least one is needed to message them." };
  }

  let lastAppointmentAt: Date | null = null;
  if (lastAppointmentRaw) {
    const parsed = new Date(lastAppointmentRaw);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Last appointment date is invalid." };
    }
    lastAppointmentAt = parsed;
  }

  // Create the customer WITHOUT writing lastAppointmentAt directly. When a
  // last-visit date is provided, seed a backing Appointment (D-07) and let
  // recomputeLastAppointment derive the cache, so a last-visit value can never
  // be orphaned (no lastAppointmentAt without a matching appointment row).
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name,
      phone,
      email,
    },
  });

  if (lastAppointmentAt) {
    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        date: lastAppointmentAt,
        service: null,
        source: "manual",
      },
    });
    await recomputeLastAppointment(customer.id, business.id);
  }

  revalidatePath("/customers");
  return { successAt: Date.now() };
}

export type ImportCustomersFormState = {
  error?: string;
  imported?: number;
  skipped?: number;
  successAt?: number;
};

/**
 * Bulk-import customers from a user-uploaded CSV. Re-parses the file on the
 * server (the client preview is only for UX) and inserts every valid row,
 * skipping any that fail validation. Scoped to the current business.
 */
export async function importCustomersAction(
  _prev: ImportCustomersFormState,
  formData: FormData,
): Promise<ImportCustomersFormState> {
  const { business } = await requireCurrentBusiness();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }

  const text = await file.text();
  const parsed = parseCustomersCsv(text);
  if (parsed.fatal) return { error: parsed.fatal };

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) {
    return { error: "No valid rows to import." };
  }

  // Insert each valid row WITHOUT writing lastAppointmentAt directly. We create
  // per-row (rather than createMany) so we capture each new customer's id and can
  // reliably map a row that carried a last-visit value to exactly one seed
  // Appointment (source='csv') — no cross-row collision from a fragile re-fetch.
  // The cache is then derived by recomputeLastAppointment, so a last-visit value
  // can never be orphaned (D-07).
  const affectedCustomerIds = new Set<string>();
  for (const r of valid) {
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
      },
    });

    if (r.lastAppointmentAt) {
      await prisma.appointment.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          date: r.lastAppointmentAt,
          service: null,
          source: "csv",
        },
      });
      affectedCustomerIds.add(customer.id);
    }
  }

  // Recompute the cache ONCE per distinct affected customer (never per row —
  // RESEARCH Pitfall 1). Each id is unique here (one create per row).
  for (const customerId of affectedCustomerIds) {
    await recomputeLastAppointment(customerId, business.id);
  }

  revalidatePath("/customers");
  return {
    imported: valid.length,
    skipped: parsed.invalidCount,
    successAt: Date.now(),
  };
}

/**
 * Delete a customer. Double-checks ownership before deleting so a
 * crafted form submit can't reach another business's row.
 */
export async function deleteCustomerAction(formData: FormData) {
  const { business } = await requireCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.customer.deleteMany({
    where: { id, businessId: business.id },
  });

  revalidatePath("/customers");
}
