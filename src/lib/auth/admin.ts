import { NextResponse } from "next/server";
export {
  getAdminEmails,
  isAdminEmail,
  getHomePathForEmail,
} from "@/lib/auth/admin-edge";
import { isAdminEmail } from "@/lib/auth/admin-edge";
import {
  canAccessAdminArea,
  canManageTeam,
  isSuperAdmin,
} from "@/lib/auth/team-managers";
import { getServerUser } from "@/lib/supabase/server";

export async function requireAdmin() {
  const user = await getServerUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

export async function requireAdminAccess() {
  const user = await getServerUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!(await canAccessAdminArea(user.email, user.id))) {
    return {
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

export async function requireTeamManage() {
  const user = await getServerUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!(await canManageTeam(user.email, user.id))) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "You do not have permission to manage team members" },
        { status: 403 }
      ),
    };
  }

  return { user, error: null };
}

export { isSuperAdmin };
