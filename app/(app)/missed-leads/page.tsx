import { AddMissedLeadDialog } from "@/app/(app)/missed-leads/add-missed-lead-dialog";
import { MissedLeadsTable } from "@/app/(app)/missed-leads/missed-leads-table";
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
import { renderTemplate } from "@/lib/render-template";

export default async function MissedLeadsPage() {
  const { business } = await requireCurrentBusiness();

  const [leads, customTemplate] = await Promise.all([
    prisma.missedLead.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.messageTemplate.findFirst({
      where: { businessId: business.id, type: "missed_call_recovery" },
    }),
  ]);

  // Pre-render the recovery body once on the server. The dialog will use this
  // as the starting value but lets the owner edit before sending.
  const fallback =
    DEFAULT_TEMPLATES.find((t) => t.type === "missed_call_recovery")?.body ??
    "";
  const recoveryBody = renderTemplate(customTemplate?.body ?? fallback, {
    businessName: business.name,
    customerName: "",
    reviewLink: null,
  });

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Missed leads</h1>
          <p className="text-sm text-muted-foreground">
            Log missed calls and recover them with a quick text back.
          </p>
        </div>
        <AddMissedLeadDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open leads</CardTitle>
          <CardDescription>
            {leads.length === 1
              ? "1 missed lead in your list."
              : `${leads.length} missed leads in your list.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MissedLeadsTable leads={leads} recoveryBody={recoveryBody} />
        </CardContent>
      </Card>
    </>
  );
}
