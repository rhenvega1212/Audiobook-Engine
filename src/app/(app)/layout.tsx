import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { canAccessAdminArea } from "@/lib/auth/team-managers";

export default async function AppLayout({
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

  const showTeamAccess = await canAccessAdminArea(user.email, user.id);

  return (
    <AppShell userEmail={user.email ?? ""} showTeamAccess={showTeamAccess}>
      {children}
    </AppShell>
  );
}
