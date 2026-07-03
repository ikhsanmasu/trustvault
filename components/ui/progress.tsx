"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Minimal Progress Bar (P17 — no installed shadcn progress component)
// Replaces shadcn/ui <Progress> with a thin native implementation.
// ---------------------------------------------------------------------------

interface ProgressProps {
  value?: number;   // 0–100
  className?: string;
}

export function Progress({ value = 0, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-secondary/40",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
