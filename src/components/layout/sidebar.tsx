"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Users,
  Mic,
  Settings,
  LogOut,
  Menu,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Books", icon: BookOpen },
  { href: "/characters", label: "Characters", icon: Users },
  { href: "/voices", label: "Voices", icon: Mic },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarDesktop({
  userEmail,
  showTeamAccess = false,
}: {
  userEmail: string;
  showTeamAccess?: boolean;
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
    <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-bone">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link
          href="/dashboard"
          className="font-serif text-xl font-semibold tracking-tight text-burgundy"
        >
          Audiobook Engine
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-burgundy text-bone"
                  : "text-slate hover:bg-warm-sand hover:text-ink"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        {showTeamAccess && (
          <Link
            href="/admin/users"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isNavActive(pathname, "/admin")
                ? "bg-burgundy text-bone"
                : "text-slate hover:bg-warm-sand hover:text-ink"
            )}
          >
            <Shield className="h-4 w-4 shrink-0" />
            Team access
          </Link>
        )}
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

export function SidebarMobile({
  showTeamAccess = false,
}: {
  showTeamAccess?: boolean;
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bone px-4 lg:hidden">
      <Link
        href="/dashboard"
        className="font-serif text-lg font-semibold text-burgundy"
      >
        Audiobook Engine
      </Link>
      <details className="relative">
        <summary className="list-none cursor-pointer rounded-md p-2 hover:bg-warm-sand">
          <Menu className="h-5 w-5 text-ink" />
        </summary>
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-border bg-bone py-2 shadow-lg">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block px-4 py-2 text-sm",
                isNavActive(pathname, item.href)
                  ? "bg-burgundy text-bone"
                  : "text-ink hover:bg-warm-sand"
              )}
            >
              {item.label}
            </Link>
          ))}
          {showTeamAccess && (
            <Link
              href="/admin/users"
              className={cn(
                "block px-4 py-2 text-sm",
                isNavActive(pathname, "/admin")
                  ? "bg-burgundy text-bone"
                  : "text-ink hover:bg-warm-sand"
              )}
            >
              Team access
            </Link>
          )}
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
  );
}

/** @deprecated Use SidebarDesktop + SidebarMobile in AppShell */
export function Sidebar({
  userEmail,
  showTeamAccess = false,
}: {
  userEmail: string;
  showTeamAccess?: boolean;
}) {
  return (
    <>
      <SidebarDesktop userEmail={userEmail} showTeamAccess={showTeamAccess} />
      <SidebarMobile showTeamAccess={showTeamAccess} />
    </>
  );
}
