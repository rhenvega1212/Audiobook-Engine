"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Shield, LogOut, Menu, BookOpen, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AdminSidebar({
  userEmail,
  openIssueCount = 0,
}: {
  userEmail: string;
  openIssueCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-bone">
        <div className="flex h-16 items-center border-b border-border px-6">
          <span className="font-serif text-xl font-semibold tracking-tight text-burgundy">
            Admin
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              !pathname.startsWith("/admin")
                ? "bg-burgundy text-bone"
                : "text-slate hover:bg-warm-sand hover:text-ink"
            )}
          >
            <BookOpen className="h-4 w-4" />
            Production app
          </Link>
          <Link
            href="/admin/users"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin/users")
                ? "bg-burgundy text-bone"
                : "text-slate hover:bg-warm-sand hover:text-ink"
            )}
          >
            <Shield className="h-4 w-4" />
            Team access
          </Link>
          <Link
            href="/admin/issues"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin/issues")
                ? "bg-burgundy text-bone"
                : "text-slate hover:bg-warm-sand hover:text-ink"
            )}
          >
            <Inbox className="h-4 w-4" />
            <span className="flex items-center gap-2">
              Issues
              {openIssueCount > 0 && (
                <span className="rounded-full bg-burgundy text-bone text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                  {openIssueCount}
                </span>
              )}
            </span>
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

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bone px-4 lg:hidden">
        <span className="font-serif text-lg font-semibold text-burgundy">
          Admin
        </span>
        <details className="relative">
          <summary className="list-none cursor-pointer">
            <Menu className="h-5 w-5 text-ink" />
          </summary>
          <div className="absolute right-0 top-8 z-50 min-w-[200px] rounded-md border border-border bg-bone py-2 shadow-md">
            <Link
              href="/dashboard"
              className={cn(
                "block px-4 py-2 text-sm",
                !pathname.startsWith("/admin")
                  ? "bg-burgundy text-bone"
                  : "text-ink hover:bg-warm-sand"
              )}
            >
              Production app
            </Link>
            <Link
              href="/admin/users"
              className={cn(
                "block px-4 py-2 text-sm",
                pathname.startsWith("/admin/users")
                  ? "bg-burgundy text-bone"
                  : "text-ink hover:bg-warm-sand"
              )}
            >
              Team access
            </Link>
            <Link
              href="/admin/issues"
              className={cn(
                "block px-4 py-2 text-sm",
                pathname.startsWith("/admin/issues")
                  ? "bg-burgundy text-bone"
                  : "text-ink hover:bg-warm-sand"
              )}
            >
              Issues{openIssueCount > 0 ? ` (${openIssueCount})` : ""}
            </Link>
            <p className="border-t border-border px-4 py-2 text-body-sm text-slate truncate">
              {userEmail}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full px-4 py-2 text-left text-sm text-slate hover:bg-warm-sand"
            >
              Sign out
            </button>
          </div>
        </details>
      </header>
    </>
  );
}
