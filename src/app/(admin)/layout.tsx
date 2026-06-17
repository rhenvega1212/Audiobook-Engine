import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { canAccessAdminArea } from "@/lib/auth/team-managers";
import { isSuperAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { countOpenIssueReports } from "@/lib/issues/reports";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await canAccessAdminArea(user.email, user.id))) {
    redirect("/dashboard");
  }

  let openIssueCount = 0;
  if (isSuperAdmin(user.email)) {
    try {
      openIssueCount = await countOpenIssueReports(createAdminClient());
    } catch {
      openIssueCount = 0;
    }
  }

  return (
    <AdminShell userEmail={user.email ?? ""} openIssueCount={openIssueCount}>
      {children}
    </AdminShell>
  );
}
