import { getServerUser } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireUser() {
  const user = await getServerUser();

  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, error: null };
}
