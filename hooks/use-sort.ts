"use client";

import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";
export type SortConfig = { key: string; direction: SortDirection } | null;

export function useSort<T>(items: T[], defaultKey?: string, defaultDir: SortDirection = "desc") {
  const [sort, setSort] = useState<SortConfig>(defaultKey ? { key: defaultKey, direction: defaultDir } : null);

  const sorted = useMemo(() => {
    if (!sort) return items;
    return [...items].sort((a, b) => {
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [items, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        if (prev.direction === "desc") return null;
      }
      return { key, direction: "asc" };
    });
  }

  function sortIndicator(key: string): string {
    if (sort?.key !== key) return "↕";
    return sort.direction === "asc" ? "↑" : "↓";
  }

  return { sorted, sort, toggleSort, sortIndicator };
}
