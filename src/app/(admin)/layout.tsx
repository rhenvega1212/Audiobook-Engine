import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminArea } from "@/lib/auth/team-managers";
import { AdminShell } from "@/components/layout/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await canAccessAdminArea(user.email, user.id))) {
    redirect("/dashboard");
  }

  return <AdminShell userEmail={user.email ?? ""}>{children}</AdminShell>;
}
