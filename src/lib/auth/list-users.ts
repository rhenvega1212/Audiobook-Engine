import { createAdminClient } from "@/lib/supabase/admin";

export type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

export async function listAuthUsers(): Promise<{
  users: AdminUserRow[];
  error: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });

  if (error) {
    return { users: [], error: error.message };
  }

  const users = (data.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
  }));

  return { users, error: null };
}
