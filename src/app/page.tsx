import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getHomePathForEmail } from "@/lib/auth/admin";

export default async function HomePage() {
  const user = await getServerUser();

  redirect(user ? getHomePathForEmail(user.email) : "/login");
}
