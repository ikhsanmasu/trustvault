"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

// ---- Types -------------------------------------------------------------------

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The stored preference: "light", "dark", or "system". */
  theme: Theme;
  /** The actually applied theme (never "system"). */
  resolvedTheme: "light" | "dark";
  /** Set a specific preference. */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark, storing the explicit choice. */
  toggleTheme: () => void;
}

// ---- Helpers (only call client-side) -----------------------------------------

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return "system";
}

function applyClass(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// ---- Context -----------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---- Provider ----------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // On mount, read stored preference. The inline <script> already set the
  // initial class on <html>, so we just sync React state to match it.
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setResolvedTheme(
      stored === "system" ? getSystemPreference() : stored,
    );
  }, []);

  // Listen for system preference changes while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function handleChange() {
      setThemeState((prev) => {
        if (prev === "system") {
          const next = getSystemPreference();
          applyClass(next);
          setResolvedTheme(next);
        }
        return prev;
      });
    }

    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // ---- Public API ------------------------------------------------------------

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // ignore
    }
    const resolved =
      newTheme === "system" ? getSystemPreference() : newTheme;
    applyClass(resolved);
    setResolvedTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---- Hook --------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
