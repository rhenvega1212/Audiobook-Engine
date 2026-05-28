import { createClient } from "@/lib/supabase/server";
import { listAuthUsers } from "@/lib/auth/list-users";
import { isSuperAdmin } from "@/lib/auth/admin";
import {
  canManageTeam,
  listTeamManagerGrants,
} from "@/lib/auth/team-managers";
import { PageHeader } from "@/components/layout/page-header";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { users, error } = await listAuthUsers();
  const grants = await listTeamManagerGrants();
  const managerIds = new Set(grants.map((g) => g.user_id));
  const superAdmin = isSuperAdmin(user?.email);
  const manageTeam = user
    ? await canManageTeam(user.email, user.id)
    : false;

  return (
    <>
      <PageHeader
        title="Team access"
        description="Create accounts and reset passwords. Use Production app in the sidebar for books and voices."
      />
      <AdminUsersClient
        currentUserId={user!.id}
        initialUsers={users}
        initialError={error}
        teamManagerIds={Array.from(managerIds)}
        canManageTeam={manageTeam}
        canGrantPermissions={superAdmin}
        superAdminEmails={process.env.ADMIN_EMAILS?.split(",").map((e) =>
          e.trim().toLowerCase()
        ) ?? []}
      />
    </>
  );
}
