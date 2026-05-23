"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-bone">
      <div className="flex h-16 items-center border-b border-border px-6">
        <span className="font-serif text-xl font-semibold tracking-tight text-burgundy">
          Admin
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-4">
        <Link
          href="/admin/users"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/admin")
              ? "bg-burgundy text-bone"
              : "text-slate hover:bg-warm-sand hover:text-ink"
          )}
        >
          <Shield className="h-4 w-4" />
          Team access
        </Link>
      </nav>
      <div className="border-t border-border p-4">
        <p className="truncate text-body-sm text-slate mb-2">{userEmail}</p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
