import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { isAdminEmail } from "@/lib/auth/admin";

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

  if (isAdminEmail(user.email)) {
    redirect("/admin/users");
  }

  return <AppShell userEmail={user.email ?? ""}>{children}</AppShell>;
}
