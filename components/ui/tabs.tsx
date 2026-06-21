"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

// ---- Context ----------------------------------------------------------------

interface TabsContextValue {
  selected: string;
  setSelected: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabsContext must be used within Tabs");
  }
  return ctx;
}

// ---- Tabs -------------------------------------------------------------------

interface TabsProps {
  defaultValue: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [selected, setSelectedState] = useState(defaultValue);

  const setSelected = useCallback(
    (value: string) => {
      setSelectedState(value);
      onValueChange?.(value);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ selected, setSelected }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ---- TabsList ---------------------------------------------------------------

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

// ---- TabsTrigger ------------------------------------------------------------

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { selected, setSelected } = useTabsContext();
  const isActive = selected === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => setSelected(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---- TabsContent ------------------------------------------------------------

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { selected } = useTabsContext();

  if (selected !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn("mt-4", className)}
    >
      {children}
    </div>
  );
}
