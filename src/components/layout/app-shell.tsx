"use client";

import { SidebarDesktop, SidebarMobile, SidebarExpandButton } from "./sidebar";
import { SidebarProvider } from "./sidebar-context";
import { ReportIssueButton } from "@/components/issues/report-issue-button";

import { ReportIssueButton } from "@/components/issues/report-issue-button";

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
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 w-full max-w-5xl mx-auto">
            {children}
          </main>
          <ReportIssueButton />
        </div>
      </div>
    </SidebarProvider>
  );
}
