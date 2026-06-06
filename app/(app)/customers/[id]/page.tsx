import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AddVisitDialog } from "@/app/(app)/customers/[id]/add-visit-dialog";
import { ImportAppointmentsDialog } from "@/app/(app)/customers/[id]/import-appointments-dialog";
import { VisitHistory } from "@/app/(app)/customers/[id]/visit-history";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentBusiness } from "@/lib/current-business";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { business } = await requireCurrentBusiness();

  // Scoped fetch (T-02-01): another business's id resolves to null → 404.
  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },
    include: {
      appointments: { orderBy: { date: "desc" } },
    },
  });

  if (!customer) notFound();

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit text-muted-foreground"
          >
            <Link href="/customers">
              <ArrowLeft data-icon="inline-start" />
              Customers
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.name}
          </h1>
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground sm:flex-row sm:gap-4">
            <span>Phone: {customer.phone ?? "—"}</span>
            <span>Email: {customer.email ?? "—"}</span>
            <span>Last visit: {formatDate(customer.lastAppointmentAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportAppointmentsDialog />
          <AddVisitDialog customerId={customer.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visits</CardTitle>
          <CardDescription>
            {customer.appointments.length === 1
              ? "1 visit on record."
              : `${customer.appointments.length} visits on record.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VisitHistory
            customerId={customer.id}
            appointments={customer.appointments.map((a) => ({
              id: a.id,
              date: a.date,
              service: a.service,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
