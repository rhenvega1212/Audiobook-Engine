import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHomePathForEmail } from "@/lib/auth/admin";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? getHomePathForEmail(user.email) : "/login");
}
