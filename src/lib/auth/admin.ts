import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export {
  getAdminEmails,
  isAdminEmail,
  getHomePathForEmail,
} from "@/lib/auth/admin-edge";
import { isAdminEmail } from "@/lib/auth/admin-edge";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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
