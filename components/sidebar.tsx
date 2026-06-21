"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---- Simple inline SVG icons -----------------------------------------------

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconVault({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconProjects({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M12 12v4" />
      <path d="M8 14h8" />
    </svg>
  );
}

function IconPlayground({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M12 8v2" />
      <path d="M8 12h8" />
      <path d="M5 15l3-3-3-3" />
      <path d="M19 15l-3-3 3-3" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconSignOut({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ---- Nav item definition ---------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: IconDashboard },
  { label: "My Vault", href: "/vault", icon: IconVault },
  { label: "Projects", href: "/projects", icon: IconProjects },
  { label: "Playground", href: "/playground", icon: IconPlayground },
  { label: "Settings", href: "/settings", icon: IconSettings },
];

// ---- Helpers ----------------------------------------------------------------

function getInitials(email: string | undefined): string {
  if (!email) return "U";
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ---- Component --------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthContext();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 text-sidebar-primary"
          >
            <path d="M12 22s-8-4.5-8-11.8V5l8-3 8 3v5.2C20 17.5 12 22 12 22z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span className="text-lg">TrustVault</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon
                    className={
                      active ? "text-sidebar-accent-foreground" : undefined
                    }
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback initials={getInitials(user?.email)} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">
              {user?.email ?? "Signed in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.id ? `${user.id.slice(0, 8)}…` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 w-8 p-0 shrink-0 border-sidebar-border",
            )}
            aria-label="Sign out"
          >
            <IconSignOut />
          </button>
        </div>
      </div>
    </aside>
  );
}
