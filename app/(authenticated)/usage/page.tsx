"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getUsage,
  type UsageStats,
  ApiClientError,
} from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { IconRefresh, IconSparkle } from "@/components/icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_INFO: Record<string, { label: string; description: string }> = {
  free: {
    label: "Free",
    description: "10 documents · 50 AI verdicts per month · 100 MB storage",
  },
  pro: {
    label: "Pro",
    description: "Unlimited documents · 500 AI verdicts per month · 5 GB storage",
  },
  enterprise: {
    label: "Enterprise",
    description: "Unlimited documents, AI verdicts, and storage",
  },
};

function percentUsed(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
}

function barColor(pct: number, unlimited: boolean): string {
  if (unlimited) return "bg-primary/25";
  if (pct >= 90) return "bg-destructive";
  if (pct >= 75) return "bg-warning";
  return "bg-primary";
}

function percentTextColor(pct: number, unlimited: boolean): string {
  if (unlimited) return "text-muted-foreground";
  if (pct >= 90) return "text-destructive font-semibold";
  if (pct >= 75) return "text-warning font-semibold";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Usage bar component
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number | null;
  format?: (n: number) => string;
}) {
  const fmt = format ?? ((n: number) => n.toLocaleString());
  const unlimited = limit === null;
  const pct = percentUsed(used, limit);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {fmt(used)} / {unlimited ? "Unlimited" : fmt(limit)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Progress
          value={unlimited ? 100 : pct}
          className="h-2 flex-1"
          indicatorClassName={barColor(pct, unlimited)}
        />
        <span className={cn("w-9 text-right text-xs tabular-nums", percentTextColor(pct, unlimited))}>
          {unlimited ? "—" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getUsage();
      setStats(result.usage);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load usage data.");
      }
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <Skeleton className="h-8 w-44 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert variant="destructive">
          <AlertDescription>
            {error ?? "Failed to load usage data."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const planInfo = PLAN_INFO[stats.plan] ?? { label: stats.plan, description: "" };

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Plan &amp; usage
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What your plan includes, and how much of it you have used.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsage}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-elevation-1 transition-all hover:border-secondary/40 hover:text-foreground"
          aria-label="Refresh usage data"
          title="Refresh"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {/* Plan card */}
      <Card className="rounded-2xl shadow-elevation-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <Badge
                  variant={stats.plan === "free" ? "secondary" : "default"}
                  className="px-3 py-1 text-sm capitalize"
                >
                  {planInfo.label}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {planInfo.description}
              </p>
            </div>

            {stats.plan === "free" && (
              <Link
                href="/billing"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-elevation-1 transition-all hover:bg-secondary/90 hover:shadow-elevation-2"
              >
                <IconSparkle className="h-3.5 w-3.5" />
                Upgrade to Pro
              </Link>
            )}
            {stats.plan === "pro" && (
              <div className="flex items-center gap-2">
                <Link
                  href="/billing"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 transition-all hover:border-secondary/40"
                >
                  <IconSparkle className="h-3.5 w-3.5" />
                  Manage billing
                </Link>
                <a
                  href="mailto:sales@trustvault.app"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 transition-all hover:border-secondary/40"
                >
                  Talk to sales about Enterprise
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* This month — resets on the billing cycle */}
      <Card className="rounded-2xl shadow-elevation-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            This month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <UsageBar
            label="AI materiality verdicts"
            used={stats.llm_calls_used}
            limit={stats.llm_calls_limit}
          />
          {stats.usage_reset_at && (
            <p className="text-xs text-muted-foreground">
              Resets on{" "}
              {new Date(stats.usage_reset_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan limits — do not reset */}
      <Card className="rounded-2xl shadow-elevation-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plan limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <UsageBar
            label="Documents"
            used={stats.documents_used}
            limit={stats.documents_limit}
          />
          <UsageBar
            label="Storage"
            used={stats.storage_bytes_used}
            limit={stats.storage_bytes_limit}
            format={formatBytes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
