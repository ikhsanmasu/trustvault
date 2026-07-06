"use client";

import { useState, useCallback, useEffect } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { Sidebar } from "@/components/sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { cn } from "@/lib/utils";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore collapsed preference on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("trustvault-sidebar-collapsed");
      if (stored === "true") setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("trustvault-sidebar-collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <OnboardingProvider>
        <div className="flex min-h-screen">
          {/* Skip-to-content link for keyboard users */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to content
          </a>

          {/* Sidebar: hidden on mobile by default, slide-over when open */}
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={handleToggleCollapsed}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={closeMobileSidebar}
          />

          {/* Main content area — padding matches sidebar width */}
          <div
            className={cn(
              "flex flex-1 flex-col",
              "transition-[padding] duration-300 ease-in-out",
              sidebarCollapsed ? "lg:pl-16" : "lg:pl-60",
            )}
          >
            {/* Mobile header with hamburger */}
            <MobileHeader onMenuToggle={toggleMobileSidebar} />

            {/* Page content with subtle background contrast */}
            <main
              id="main-content"
              className={cn(
                "flex-1 bg-muted/30 min-h-[calc(100vh-3.5rem)] lg:min-h-screen",
              )}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                {children}
              </div>
            </main>
          </div>
        </div>
        </OnboardingProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
