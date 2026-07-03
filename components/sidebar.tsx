"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  IconBrand,
  IconDashboard,
  IconFolder,
  IconSettings,
  IconSignOut,
  IconCollapseSidebar,
  IconMessageBot,
  IconShare,
  IconBot,
  IconChart,
} from "@/components/icons";

// ---- Nav item definition -------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: IconDashboard },
  { label: "My Vault", href: "/vault", icon: IconFolder },
  { label: "Assistant", href: "/assistant", icon: IconMessageBot },
  { label: "Agents", href: "/agents", icon: IconBot },
  { label: "Shared Links", href: "/shares", icon: IconShare },
  { label: "Usage", href: "/usage", icon: IconChart },
  { label: "Settings", href: "/settings", icon: IconSettings },
];

// ---- Helpers -------------------------------------------------------------------

function getInitials(email: string | undefined): string {
  if (!email) return "U";
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function truncateEmail(email: string | undefined): string {
  if (!email) return "Signed in";
  if (email.length <= 24) return email;
  return `${email.slice(0, 20)}…`;
}

// ---- Sidebar props -------------------------------------------------------------

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ---- Component -----------------------------------------------------------------

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthContext();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  // ---- Render ------------------------------------------------------------------

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Layout
          "fixed inset-y-0 left-0 z-50 flex flex-col",
          sidebarWidth,
          // Styling: bg-card for contrast against main bg-muted/30
          "bg-card border-r border-border/60",
          // Smooth width transition
          "transition-[width] duration-300 ease-in-out",
          // Mobile: slide in/out
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-elevation-4" : "-translate-x-full lg:translate-x-0",
          // Prevent content clipping during transition
          "overflow-hidden",
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* ---- Brand Section ---- */}
        <div className="shrink-0">
          <div className="flex items-center justify-between h-14 px-4 gap-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 min-w-0 transition-all duration-200 ease-out"
              onClick={onMobileClose}
              aria-label="InTrustVault Dashboard"
            >
            <div
              className={cn(
                "flex items-center justify-center rounded-lg shrink-0",
                "bg-primary/10 text-primary",
                "transition-all duration-300",
                collapsed ? "h-8 w-8" : "h-9 w-9",
              )}
            >
              <IconBrand className={collapsed ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]"} />
            </div>
            <span
              className={cn(
                "text-base font-bold tracking-tight text-foreground whitespace-nowrap",
                "transition-all duration-300 ease-out origin-left",
                collapsed && "opacity-0 scale-75 w-0",
              )}
            >
              InTrustVault
            </span>
          </Link>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconCollapseSidebar collapsed={collapsed} className="h-[14px] w-[14px]" />
          </button>
        </div>

        {/* Gold accent line */}
        <div className="mx-4">
          <div className="h-px bg-gradient-to-r from-secondary/70 via-secondary/50 to-transparent" />
        </div>
      </div>

        {/* ---- Navigation ---- */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2" aria-label="Page navigation">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      // Base
                      "group relative flex items-center gap-3 rounded-lg h-10",
                      "text-sm font-medium whitespace-nowrap",
                      "transition-all duration-200 ease-out",
                      collapsed ? "justify-center px-0" : "px-3",
                      // Colors
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      // Subtle indent on hover
                      !active && !collapsed && "hover:translate-x-0.5",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {/* Left gold border accent for active */}
                    {active && (
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2",
                          "w-0.5 h-5 rounded-full bg-secondary",
                          "transition-all duration-200",
                        )}
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] transition-colors duration-200",
                        active ? "text-primary" : "text-muted-foreground/60 group-hover:text-muted-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "transition-all duration-300 ease-out origin-left",
                        collapsed && "opacity-0 scale-75 w-0 absolute",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ---- Bottom Section ---- */}
        <div className="shrink-0">
          {/* Subtle divider */}
          <div className="mx-4">
            <div className="h-px bg-border/60" />
          </div>

          {/* User section */}
          <div className={cn("p-2 pb-3", collapsed && "flex flex-col items-center gap-2")}>
            <div
              className={cn(
                "flex items-center rounded-lg",
                "transition-all duration-200 ease-out",
                collapsed ? "flex-col gap-1.5 p-1.5" : "gap-3 px-2.5 py-2 hover:bg-muted/50",
              )}
            >
              {/* Avatar */}
              <Avatar size="sm">
                <AvatarFallback initials={getInitials(user?.email)} />
              </Avatar>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-medium leading-tight text-foreground">
                    {truncateEmail(user?.email)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground/50 leading-tight mt-0.5">
                    {user?.id ? `${user.id.slice(0, 8)}…` : ""}
                  </p>
                </div>
              )}

              {/* Theme toggle */}
              {!collapsed && <ThemeToggle />}

              {/* Sign out */}
              <button
                type="button"
                onClick={handleSignOut}
                className={cn(
                  "flex items-center justify-center rounded-md h-7 w-7 shrink-0",
                  "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10",
                  "transition-all duration-200",
                )}
                aria-label="Sign out"
                title="Sign out"
              >
                <IconSignOut className="h-[14px] w-[14px]" />
              </button>
            </div>

            {/* Collapsed mode extras */}
            {collapsed && (
              <div className="flex flex-col items-center gap-1.5">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={cn(
                    "flex items-center justify-center rounded-md h-7 w-7 shrink-0",
                    "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10",
                    "transition-all duration-200",
                  )}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <IconSignOut className="h-[14px] w-[14px]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
