"use client";

import { usePathname } from "next/navigation";
import { SidebarDesktop, SidebarMobile, SidebarExpandButton } from "./sidebar";
import { SidebarProvider } from "./sidebar-context";
import { ReportIssueButton } from "@/components/issues/report-issue-button";
import { cn } from "@/lib/utils";

export function AppShell({
  userEmail,
  showTeamAccess = false,
  showAdminIssues = false,
  openIssueCount = 0,
  children,
}: {
  userEmail: string;
  showTeamAccess?: boolean;
  showAdminIssues?: boolean;
  openIssueCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStudioWorkspace = /\/books\/[^/]+\/(manuscript|cleanup)(\/|$)/.test(
    pathname ?? ""
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-cream">
        <SidebarDesktop
          userEmail={userEmail}
          showTeamAccess={showTeamAccess}
          showAdminIssues={showAdminIssues}
          openIssueCount={openIssueCount}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <SidebarExpandButton />
          <SidebarMobile
            showTeamAccess={showTeamAccess}
            showAdminIssues={showAdminIssues}
            openIssueCount={openIssueCount}
          />
          <main
            className={cn(
              "flex-1 w-full mx-auto",
              isStudioWorkspace
                ? "px-3 py-2 lg:px-5 lg:py-3 max-w-none"
                : "px-4 py-6 lg:px-8 lg:py-8 max-w-5xl"
            )}
          >
            {children}
          </main>
        </div>
      </div>
      <ReportIssueButton />
    </SidebarProvider>
  );
}
