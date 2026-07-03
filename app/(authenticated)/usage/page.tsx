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
import { IconChart, IconRefresh, IconSparkle } from "@/components/icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function planLabel(plan: string): string {
  switch (plan) {
    case "free":
      return "Free";
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return plan;
  }
}

function planVariant(plan: string): "default" | "secondary" | "outline" {
  switch (plan) {
    case "free":
      return "secondary";
    case "pro":
      return "default";
    case "enterprise":
      return "outline";
    default:
      return "secondary";
  }
}

function percentUsed(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
}

// ---------------------------------------------------------------------------
// Usage bar component
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const pct = percentUsed(used, limit);
  const displayUsed = label.includes("Storage") ? formatBytes(used) : String(used);
  const displayLimit = limit !== null
    ? (label.includes("Storage") ? formatBytes(limit) : String(limit))
    : "Unlimited";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          {displayUsed} / {displayLimit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground w-9 text-right">
          {pct}%
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
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error || !stats) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
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

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage &amp; Plan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your current usage and plan limits.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsage}
          className="inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent hover:text-accent-foreground"
          aria-label="Refresh usage data"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {/* Plan badge */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={planVariant(stats.plan)} className="text-sm px-3 py-1">
                {planLabel(stats.plan)}
              </Badge>
              {stats.plan === "free" && (
                <span className="text-xs text-muted-foreground">
                  Upgrade to unlock more features
                </span>
              )}
            </div>
            {stats.plan !== "enterprise" && (
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
              >
                <IconSparkle className="h-3.5 w-3.5" />
                {stats.plan === "free" ? "Upgrade to Pro" : "Upgrade to Enterprise"}
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Monthly Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <UsageBar
            label="Documents"
            used={stats.documents_used}
            limit={stats.documents_limit}
            icon={IconChart}
          />
          <UsageBar
            label="LLM API Calls"
            used={stats.llm_calls_used}
            limit={stats.llm_calls_limit}
          />
          <UsageBar
            label="Storage"
            used={stats.storage_bytes_used}
            limit={stats.storage_bytes_limit}
          />
        </CardContent>
      </Card>

      {/* Reset info */}
      {stats.usage_reset_at && (
        <p className="text-xs text-center text-muted-foreground">
          Usage counters reset on{" "}
          {new Date(stats.usage_reset_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}
    </div>
  );
}
