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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-context";

const navItems = [
  { href: "/dashboard", label: "Books", icon: BookOpen },
  { href: "/characters", label: "Characters", icon: Users },
  { href: "/voices", label: "Voices", icon: Mic },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function SidebarToggleButton({
  collapsed,
  onToggle,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 shrink-0 text-slate hover:text-ink", className)}
      onClick={onToggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}

export function SidebarExpandButton() {
  const { collapsed, toggle, hydrated } = useSidebar();
  if (!hydrated || !collapsed) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="absolute left-0 top-20 z-30 hidden h-8 w-8 -translate-x-1/2 rounded-full border-border bg-bone shadow-sm lg:flex"
      onClick={toggle}
      title="Expand sidebar"
      aria-label="Expand sidebar"
    >
      <PanelLeftOpen className="h-4 w-4" />
    </Button>
  );
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
  const { collapsed, toggle, hydrated } = useSidebar();
  const isCollapsed = hydrated && collapsed;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-bone transition-[width] duration-200 ease-in-out",
        isCollapsed ? "lg:w-16" : "lg:w-60"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border",
          isCollapsed ? "justify-center px-2" : "justify-between px-4"
        )}
      >
        {isCollapsed ? (
          <Link
            href="/dashboard"
            className="font-serif text-sm font-semibold text-burgundy"
            title="Audiobook Engine"
          >
            AE
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="min-w-0 truncate font-serif text-xl font-semibold tracking-tight text-burgundy"
          >
            Audiobook Engine
          </Link>
        )}
        {!isCollapsed && (
          <SidebarToggleButton collapsed={false} onToggle={toggle} />
        )}
      </div>
      <nav className={cn("flex flex-1 flex-col gap-1 p-2", !isCollapsed && "p-4")}>
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
                isCollapsed ? "justify-center px-2" : "gap-3 px-3",
                active
                  ? "bg-burgundy text-bone"
                  : "text-slate hover:bg-warm-sand hover:text-ink"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!isCollapsed && item.label}
            </Link>
          );
        })}
        {showTeamAccess && (
          <Link
            href="/admin/users"
            title="Team access"
            className={cn(
              "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
              isCollapsed ? "justify-center px-2" : "gap-3 px-3",
              isNavActive(pathname, "/admin")
                ? "bg-burgundy text-bone"
                : "text-slate hover:bg-warm-sand hover:text-ink"
            )}
          >
            <Shield className="h-4 w-4 shrink-0" />
            {!isCollapsed && "Team access"}
          </Link>
        )}
      </nav>
      <div
        className={cn(
          "border-t border-border",
          isCollapsed ? "flex flex-col items-center gap-2 p-2" : "p-4"
        )}
      >
        {!isCollapsed && (
          <p className="truncate text-body-sm text-slate mb-2">{userEmail}</p>
        )}
        {isCollapsed ? (
          <>
            <SidebarToggleButton collapsed onToggle={toggle} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate hover:text-ink"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        )}
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
