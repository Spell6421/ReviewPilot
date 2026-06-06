"use server";

import { revalidatePath } from "next/cache";

import { recomputeLastAppointment } from "@/lib/appointments";
import { parseAppointmentsCsv } from "@/lib/appointments-csv";
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

export type ImportAppointmentsFormState = {
  error?: string;
  imported?: number;
  skipped?: number;
  /** Bumps on success so the dialog can react and close itself. */
  successAt?: number;
};

/**
 * Bulk-import visit history from a dedicated appointments CSV (one row per visit,
 * D-08). The client preview is advisory only — this re-parses the file on the
 * SERVER (T-04-02) and only inserts zero-error rows. For each row it matches an
 * existing customer by exact E.164 phone (the parser already normalized it — same
 * key as inbound-reply matching, Pitfall 3) scoped to the current business, or
 * auto-creates one from name+phone (D-09). Visits are deduped on
 * customer+date+service (D-10/D-13) and reported, never silently dropped. The
 * cache is recomputed ONCE per distinct affected customer (Pitfall 1 / Q2).
 *
 * Everything is scoped by `business.id` (T-04-03): the match, the auto-create, and
 * the insert. Auth is enforced inside the action (T-04-01), not just the UI.
 */
export async function importAppointmentsAction(
  _prev: ImportAppointmentsFormState,
  formData: FormData,
): Promise<ImportAppointmentsFormState> {
  const { business } = await requireCurrentBusiness();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }

  const parsed = parseAppointmentsCsv(await file.text());
  if (parsed.fatal) return { error: parsed.fatal };

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) {
    return { error: "No valid rows to import." };
  }

  let imported = 0;
  let skipped = parsed.invalidCount;
  const affectedCustomerIds = new Set<string>();

  // Cache the phone → customerId lookups across rows so repeated-phone rows
  // (the multi-visit case) don't re-query or accidentally auto-create twice.
  const customerByPhone = new Map<string, string>();

  for (const row of valid) {
    // The parser guarantees a non-null E.164 phone for every valid row.
    const phone = row.phone as string;
    const date = toMidnightUtc(row.date as Date);

    let customerId = customerByPhone.get(phone);
    if (!customerId) {
      // Exact E.164 string match scoped to the business (Pitfall 3).
      const existing = await prisma.customer.findFirst({
        where: { businessId: business.id, phone },
        select: { id: true },
      });
      if (existing) {
        customerId = existing.id;
      } else {
        // Auto-create from name+phone — both guaranteed by the parser (D-09).
        // The new customer is owned by the current business (T-04-03).
        const created = await prisma.customer.create({
          data: {
            businessId: business.id,
            name: row.name,
            phone,
            email: null,
          },
        });
        customerId = created.id;
      }
      customerByPhone.set(phone, customerId);
    }

    // D-10/D-13 dedup: same customer + date + service is a duplicate; a same-day
    // DIFFERENT-service row is a distinct visit. Skip + count (don't drop silently).
    const dupe = await prisma.appointment.findFirst({
      where: {
        customerId,
        businessId: business.id,
        date,
        service: row.service,
      },
      select: { id: true },
    });
    if (dupe) {
      skipped++;
      continue;
    }

    await prisma.appointment.create({
      data: {
        businessId: business.id,
        customerId,
        date,
        service: row.service,
        source: row.source ?? "csv",
      },
    });
    imported++;
    affectedCustomerIds.add(customerId);
  }

  // Recompute the derived cache ONCE per distinct affected customer (never per
  // row — Pitfall 1). The D-04 invariant holds across the bulk path.
  for (const customerId of affectedCustomerIds) {
    await recomputeLastAppointment(customerId, business.id);
    revalidatePath(`/customers/${customerId}`);
  }
  revalidatePath("/customers");

  return { imported, skipped, successAt: Date.now() };
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
