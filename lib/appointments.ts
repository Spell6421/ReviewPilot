import { prisma } from "@/lib/prisma";

/**
 * Re-derive the `Customer.lastAppointmentAt` cache from the appointment history (D-04).
 *
 * Invariant: `lastAppointmentAt == MAX(appointment.date)` for the customer, or `null`
 * when the customer has no appointments. This is the single shared hook that ALL FIVE
 * appointment-mutation paths MUST call so the cache can never drift:
 *   1. manual add visit            (app/(app)/customers/[id]/actions.ts)
 *   2. manual delete visit         (app/(app)/customers/[id]/actions.ts)
 *   3. appointments-CSV import      (app/(app)/customers/[id]/actions.ts)
 *   4. customer create (seed appt)  (app/(app)/customers/actions.ts, D-07)
 *   5. customer import (seed appts)  (app/(app)/customers/actions.ts, D-07)
 *
 * Bulk callers (CSV / customer import) recompute once per distinct customerId AFTER the
 * batch insert — never per row.
 *
 * Uses `updateMany` (not `update`) so `businessId` is in the `where`: an ownership
 * re-check mirroring `deleteCustomerAction`, so a crafted call can't touch another
 * business's customer.
 */
export async function recomputeLastAppointment(
  customerId: string,
  businessId: string,
): Promise<void> {
  const latest = await prisma.appointment.findFirst({
    where: { customerId, businessId },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  await prisma.customer.updateMany({
    where: { id: customerId, businessId },
    data: { lastAppointmentAt: latest?.date ?? null },
  });
}
