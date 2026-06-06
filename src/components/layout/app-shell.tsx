"use client";

import { SidebarDesktop, SidebarMobile, SidebarExpandButton } from "./sidebar";
import { SidebarProvider } from "./sidebar-context";

export function AppShell({
  userEmail,
  showTeamAccess = false,
  children,
}: {
  userEmail: string;
  showTeamAccess?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-cream">
        <SidebarDesktop userEmail={userEmail} showTeamAccess={showTeamAccess} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <SidebarExpandButton />
          <SidebarMobile showTeamAccess={showTeamAccess} />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 w-full max-w-5xl mx-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
