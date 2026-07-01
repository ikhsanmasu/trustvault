"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

// ---- Types --------------------------------------------------------------------

interface BarChartProps {
  data: { label: string; count: number }[];
  maxBars?: number;
}

// ---- Component ----------------------------------------------------------------

export function BarChart({ data, maxBars = 12 }: BarChartProps) {
  const items = useMemo(() => {
    // Take the last N items (most recent months)
    const sliced = data.slice(-maxBars);
    return sliced;
  }, [data, maxBars]);

  const maxCount = useMemo(() => {
    if (items.length === 0) return 1;
    const max = Math.max(...items.map((d) => d.count));
    return max === 0 ? 1 : max;
  }, [items]);

  const total = useMemo(
    () => items.reduce((sum, d) => sum + d.count, 0),
    [items],
  );

  // Build sr-only description
  const srDescription = useMemo(() => {
    if (items.length === 0) return "No upload data available";
    return items
      .map((d) => `${d.label}: ${d.count}`)
      .join(", ");
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-xs text-muted-foreground">No upload data available</p>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      role="img"
      aria-label={`Bar chart: Uploads by month. ${srDescription}. Total: ${total}`}
    >
      <span className="sr-only" role="status" aria-live="polite">
        Uploads by month: {srDescription}. Total: {total} uploads.
      </span>
      <title>{`Uploads by month: ${srDescription}. Total: ${total}`}</title>

      {items.map((item) => {
        const widthPct = (item.count / maxCount) * 100;
        const isZero = item.count === 0;

        return (
          <div
            key={item.label}
            className="flex items-center gap-3 group"
          >
            {/* Month label */}
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {item.label}
            </span>

            {/* Bar */}
            <div className="flex-1 relative h-6">
              <div
                className={cn(
                  "h-full rounded-r-lg transition-all duration-500 ease-out",
                  "bg-gradient-to-r from-primary to-primary/60",
                  "min-w-[2px]",
                )}
                style={{ width: `${isZero ? 2 : Math.max(widthPct, 2)}%` }}
              />

              {/* Count label on bar (inside, right-aligned when enough space) */}
              <span
                className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums",
                  isZero
                    ? "text-muted-foreground left-[calc(var(--bar-width,0%)+8px)]"
                    : "text-primary-foreground",
                )}
                style={
                  isZero
                    ? { left: "4px" }
                    : { right: "0.375rem" }
                }
              >
                {item.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
