import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdminArea } from "@/lib/auth/team-managers";
import { isSuperAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { countOpenIssueReports } from "@/lib/issues/reports";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const showTeamAccess = await canAccessAdminArea(user.email, user.id);
  const showAdminIssues = isSuperAdmin(user.email);
  let openIssueCount = 0;
  if (showAdminIssues) {
    try {
      openIssueCount = await countOpenIssueReports(createAdminClient());
    } catch {
      openIssueCount = 0;
    }
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      showTeamAccess={showTeamAccess}
      showAdminIssues={showAdminIssues}
      openIssueCount={openIssueCount}
    >
      {children}
    </AppShell>
  );
}
