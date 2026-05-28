import { SidebarDesktop, SidebarMobile } from "./sidebar";

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
    <div className="flex min-h-screen bg-cream">
      <SidebarDesktop userEmail={userEmail} showTeamAccess={showTeamAccess} />
      <div className="flex min-w-0 flex-1 flex-col">
        <SidebarMobile showTeamAccess={showTeamAccess} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 w-full max-w-5xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
