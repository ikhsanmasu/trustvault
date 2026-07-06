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
  IconChart,
  IconSearch,
  IconCreditCard,
} from "@/components/icons";

// ---- Nav structure --------------------------------------------------------------
// Grouped by workflow: daily work first, sharing, then account-level pages.

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: IconDashboard },
      { label: "Vault", href: "/vault", icon: IconFolder },
      { label: "Compare", href: "/compare", icon: IconSearch },
      { label: "Assistant", href: "/assistant", icon: IconMessageBot },
    ],
  },
  {
    label: "Sharing",
    items: [{ label: "Shared links", href: "/shares", icon: IconShare }],
  },
  {
    label: "Account",
    items: [
      { label: "Plan & usage", href: "/usage", icon: IconChart },
      { label: "Billing", href: "/billing", icon: IconCreditCard },
      { label: "Settings", href: "/settings", icon: IconSettings },
    ],
  },
];

// ---- Helpers -------------------------------------------------------------------

function getInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

// ---- Sidebar props -------------------------------------------------------------

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ---- Component -----------------------------------------------------------------
// Dark navy chrome (the "vault wall") against a light content area — the same
// panel language as the landing page's Trust/CTA sections. Uses the sidebar-*
// design tokens defined in globals.css.

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthContext();

  const displayName =
    (user?.user_metadata as { display_name?: string } | undefined)?.display_name ??
    user?.email?.split("@")[0] ??
    "Signed in";

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
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Layout
          "fixed inset-y-0 left-0 z-50 flex flex-col",
          sidebarWidth,
          // Dark navy chrome
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
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
              className="flex items-center gap-2.5 min-w-0 transition-all duration-200 ease-out"
              onClick={onMobileClose}
              aria-label="InTrustVault Dashboard"
            >
              {/* Subtle ring gives the mark definition against the navy wall */}
              <span className="flex shrink-0 rounded-lg ring-1 ring-white/15">
                <IconBrand className="h-8 w-8" />
              </span>
              <span
                className={cn(
                  "text-base font-bold tracking-tight text-white whitespace-nowrap",
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
              className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-white/10 transition-colors shrink-0"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <IconCollapseSidebar collapsed={collapsed} className="h-[14px] w-[14px]" />
            </button>
          </div>

          {/* Gold accent line */}
          <div className="mx-4">
            <div className="h-px bg-gradient-to-r from-secondary/60 via-secondary/35 to-transparent" />
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2" aria-label="Page navigation">
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={section.label}>
              {/* Section label (expanded) or divider (collapsed) */}
              {collapsed ? (
                sectionIndex > 0 && (
                  <div className="mx-2 my-3 h-px bg-white/10" aria-hidden="true" />
                )
              ) : (
                <p
                  className={cn(
                    "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/35",
                    sectionIndex === 0 ? "pt-2" : "pt-5",
                  )}
                >
                  {section.label}
                </p>
              )}

              <ul className="space-y-0.5">
                {section.items.map((item) => {
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
                            ? "bg-white/[0.08] text-white"
                            : "text-sidebar-foreground/60 hover:bg-white/[0.05] hover:text-sidebar-foreground",
                          // Subtle indent on hover
                          !active && !collapsed && "hover:translate-x-0.5",
                        )}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
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
                            active
                              ? "text-secondary"
                              : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80",
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
            </div>
          ))}
        </nav>

        {/* ---- Bottom Section ---- */}
        <div className="shrink-0">
          {/* Subtle divider */}
          <div className="mx-4">
            <div className="h-px bg-white/10" />
          </div>

          {/* User section */}
          <div className={cn("p-2 pb-3", collapsed && "flex flex-col items-center gap-2")}>
            <div
              className={cn(
                "flex items-center rounded-lg",
                "transition-all duration-200 ease-out",
                collapsed ? "flex-col gap-1.5 p-1.5" : "gap-3 px-2.5 py-2 hover:bg-white/[0.05]",
              )}
            >
              {/* Avatar */}
              <Avatar size="sm" className="bg-secondary/20 text-secondary ring-1 ring-secondary/30">
                <AvatarFallback initials={getInitials(displayName, user?.email)} />
              </Avatar>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-[11px] text-sidebar-foreground/45 leading-tight mt-0.5">
                    {user?.email ?? ""}
                  </p>
                </div>
              )}

              {/* Theme toggle */}
              {!collapsed && (
                <ThemeToggle className="text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-white/10" />
              )}

              {/* Sign out */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={cn(
                    "flex items-center justify-center rounded-md h-7 w-7 shrink-0",
                    "text-sidebar-foreground/40 hover:text-red-300 hover:bg-red-500/15",
                    "transition-all duration-200",
                  )}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <IconSignOut className="h-[14px] w-[14px]" />
                </button>
              )}
            </div>

            {/* Collapsed mode extras */}
            {collapsed && (
              <div className="flex flex-col items-center gap-1.5">
                <ThemeToggle className="text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-white/10" />
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={cn(
                    "flex items-center justify-center rounded-md h-7 w-7 shrink-0",
                    "text-sidebar-foreground/40 hover:text-red-300 hover:bg-red-500/15",
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
