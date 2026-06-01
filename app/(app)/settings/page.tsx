import { BusinessProfileForm } from "@/app/(app)/settings/business-profile-form";
import { TemplatesForm } from "@/app/(app)/settings/templates-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireCurrentBusiness } from "@/lib/current-business";
import { DEFAULT_TEMPLATES } from "@/lib/default-templates";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const { business } = await requireCurrentBusiness();

  const existing = await prisma.messageTemplate.findMany({
    where: { businessId: business.id },
  });

  // Build a full set of 5 templates in display order. Existing rows win; any
  // missing type falls back to its default body so the form is never empty.
  const byType = new Map(existing.map((t) => [t.type, t.body]));
  const templates = DEFAULT_TEMPLATES.map((t) => ({
    type: t.type,
    body: byType.get(t.type) ?? t.body,
  }));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your business profile and message templates.
        </p>
      </div>

      <Tabs defaultValue="profile" className="gap-6">
        <TabsList>
          <TabsTrigger value="profile">Business profile</TabsTrigger>
          <TabsTrigger value="templates">Message templates</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <BusinessProfileForm business={business} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesForm templates={templates} />
        </TabsContent>
      </Tabs>
    </>
  );
}
