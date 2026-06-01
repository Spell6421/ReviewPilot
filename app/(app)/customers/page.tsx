import { AddCustomerDialog } from "@/app/(app)/customers/add-customer-dialog";
import { CustomersTable } from "@/app/(app)/customers/customers-table";
import { ImportCustomersDialog } from "@/app/(app)/customers/import-customers-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentBusiness } from "@/lib/current-business";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";

export default async function CustomersPage() {
  const { business } = await requireCurrentBusiness();

  const [customers, templates] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.messageTemplate.findMany({
      where: { businessId: business.id },
    }),
  ]);

  // Fall back to default bodies for any template the business hasn't customized yet.
  const byType = new Map(templates.map((t) => [t.type, t.body]));
  const templatesForDialog = DEFAULT_TEMPLATES.map((t) => ({
    type: t.type,
    body: byType.get(t.type) ?? t.body,
  }));

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Add customers manually or import them from a CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportCustomersDialog />
          <AddCustomerDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All customers</CardTitle>
          <CardDescription>
            {customers.length === 1
              ? "1 customer in your list."
              : `${customers.length} customers in your list.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomersTable
            customers={customers}
            business={{
              id: business.id,
              name: business.name,
              googleReviewLink: business.googleReviewLink,
            }}
            templates={templatesForDialog}
          />
        </CardContent>
      </Card>
    </>
  );
}
