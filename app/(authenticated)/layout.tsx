import Link from "next/link";

// Skeleton layout for authenticated pages.
// Renders the fixed left sidebar + main content area.
// The frontend agent will extract the sidebar into components/sidebar.tsx
// and add auth guards, user info, and a functional sign-out button.
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar — fixed left, full-height */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="text-lg">TrustVault</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            <li>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/vault"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                My Vault
              </Link>
            </li>
            <li>
              <Link
                href="/projects"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Projects
              </Link>
            </li>
            <li>
              <Link
                href="/playground"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Playground
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                Settings
              </Link>
            </li>
          </ul>
        </nav>

        {/* User footer (placeholder — frontend will add user info + sign-out) */}
        <div className="shrink-0 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 truncate text-xs text-muted-foreground">
              Signed in
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area — offset by sidebar width */}
      <main className="flex-1 pl-64">{children}</main>
    </div>
  );
}
