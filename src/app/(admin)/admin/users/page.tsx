import { getServerUser } from "@/lib/supabase/server";
import { listAuthUsers } from "@/lib/auth/list-users";
import { isSuperAdmin } from "@/lib/auth/admin";
import {
  canManageTeam,
  listTeamManagerGrants,
} from "@/lib/auth/team-managers";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
  const user = await getServerUser();

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
        description="Invite teammates — every account gets full access to all books, characters, and manuscript work."
      />
      <Card className="mb-6 border-teal/30 bg-teal/5">
        <CardContent className="py-4 text-body-sm text-slate space-y-2">
          <p>
            <strong className="text-ink">Shared workspace.</strong> Books are not
            private per person. When you add someone here, they sign in and see the
            same dashboard, speaker studio, and cleanup tools as you.
          </p>
          <p>
            Edits go straight to the shared database. Teammates see your changes
            after a refresh (or when they open a book again). The &ldquo;Can
            add/remove&rdquo; checkbox only controls who can manage accounts on
            this page — not who can see books.
          </p>
        </CardContent>
      </Card>
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
