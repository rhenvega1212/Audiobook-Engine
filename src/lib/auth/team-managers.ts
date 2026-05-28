import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-edge";

export type TeamManagerGrant = {
  user_id: string;
  email: string;
};

export async function listTeamManagerGrants(): Promise<TeamManagerGrant[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_manager_grants")
    .select("user_id, email");

  if (error) {
    console.error("listTeamManagerGrants:", error.message);
    return [];
  }

  return data ?? [];
}

export async function isTeamManager(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_manager_grants")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}

export function isSuperAdmin(email: string | undefined | null): boolean {
  return isAdminEmail(email);
}

export async function canAccessAdminArea(
  email: string | undefined | null,
  userId: string
): Promise<boolean> {
  if (isSuperAdmin(email)) return true;
  return isTeamManager(userId);
}

export async function canManageTeam(
  email: string | undefined | null,
  userId: string
): Promise<boolean> {
  if (isSuperAdmin(email)) return true;
  return isTeamManager(userId);
}
