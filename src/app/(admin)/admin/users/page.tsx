import { createClient } from "@/lib/supabase/server";
import { listAuthUsers } from "@/lib/auth/list-users";
import { PageHeader } from "@/components/layout/page-header";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { users, error } = await listAuthUsers();

  return (
    <>
      <PageHeader
        title="Team access"
        description="Create accounts and reset passwords for your team. Everyone signs in at the same login page."
      />
      <AdminUsersClient
        currentUserId={user!.id}
        initialUsers={users}
        initialError={error}
      />
    </>
  );
}
