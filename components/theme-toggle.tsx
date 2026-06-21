"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { IconSun, IconMoon } from "@/components/icons";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Derive the *resolved* (visible) theme from the stored preference + system.
 */
function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme();
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      function update() {
        setResolved(mq.matches ? "dark" : "light");
      }
      update();
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } else {
      setResolved(theme);
    }
  }, [theme]);

  return resolved;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { toggleTheme } = useTheme();
  const resolved = useResolvedTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-all duration-200",
        className,
      )}
      aria-label={`Switch to ${resolved === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${resolved === "light" ? "dark" : "light"} mode`}
    >
      {/* Sun icon */}
      <IconSun
        className={cn(
          "h-[18px] w-[18px] absolute transition-all duration-300",
          resolved === "light"
            ? "opacity-0 rotate-90 scale-75"
            : "opacity-100 rotate-0 scale-100",
        )}
      />

      {/* Moon icon */}
      <IconMoon
        className={cn(
          "h-[18px] w-[18px] absolute transition-all duration-300",
          resolved === "dark"
            ? "opacity-0 -rotate-90 scale-75"
            : "opacity-100 rotate-0 scale-100",
        )}
      />
    </button>
  );
}
