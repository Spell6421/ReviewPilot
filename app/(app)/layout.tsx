import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { requireCurrentBusiness } from "@/lib/current-business";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bounces to /login if not signed in, or to /onboarding if signed in
  // but no Business row exists yet. Also gives the sidebar real data.
  const { user, business } = await requireCurrentBusiness();

  return (
    <SidebarProvider>
      <AppSidebar
        businessName={business.name}
        userEmail={user.email ?? ""}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            ReviewPilot
          </span>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
