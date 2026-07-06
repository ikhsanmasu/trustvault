"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { useSort } from "@/hooks/use-sort";
import { StatsCard } from "@/components/stats-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDashboard } from "@/hooks/use-dashboard";
import { getUsage, type UsageStats } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/utils";
import { getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import type { TrendIndicator } from "@/components/stats-card";
import {
  IconDocument,
  IconStorage,
  IconChevronRight,
  IconRefresh,
  IconShield,
  IconShare,
  IconUpload,
  IconSearch,
  IconMessageBot,
} from "@/components/icons";
import { BarChart } from "@/components/analytics/bar-chart";

// ---- Helpers ----------------------------------------------------------------

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.min(100, (used / limit) * 100);
}

function usageBarClass(percent: number | null): string {
  if (percent === null) return "bg-primary";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 75) return "bg-warning";
  return "bg-primary";
}

// ---- Quick actions ------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    href: "/vault?upload=1",
    label: "Upload document",
    icon: <IconUpload className="h-4 w-4" />,
    primary: true,
  },
  {
    href: "/compare",
    label: "Compare",
    icon: <IconSearch className="h-4 w-4" />,
    primary: false,
  },
  {
    href: "/assistant",
    label: "Ask assistant",
    icon: <IconMessageBot className="h-4 w-4" />,
    primary: false,
  },
] as const;

// ---- Usage card ---------------------------------------------------------------

function UsageRow({
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
  const percent = usagePercent(used, limit);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-foreground">
          {fmt(used)}
          <span className="text-muted-foreground">
            {" "}/ {limit === null ? "Unlimited" : fmt(limit)}
          </span>
        </span>
      </div>
      <Progress
        value={percent ?? 100}
        className="mt-1.5 h-1.5"
        indicatorClassName={
          percent === null ? "bg-primary/25" : usageBarClass(percent)
        }
      />
    </div>
  );
}

function UsageCard({ usage }: { usage: UsageStats | null }) {
  const nearLimit =
    usage !== null &&
    usage.plan === "free" &&
    [
      usagePercent(usage.documents_used, usage.documents_limit),
      usagePercent(usage.llm_calls_used, usage.llm_calls_limit),
      usagePercent(usage.storage_bytes_used, usage.storage_bytes_limit),
    ].some((p) => p !== null && p >= 80);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-elevation-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Plan & usage</h2>
        {usage && (
          <Badge variant={usage.plan === "free" ? "secondary" : "default"} className="capitalize">
            {usage.plan}
          </Badge>
        )}
      </div>

      {usage ? (
        <>
          <div className="mt-5 space-y-4">
            <UsageRow
              label="Documents"
              used={usage.documents_used}
              limit={usage.documents_limit}
            />
            <UsageRow
              label="AI verdicts this month"
              used={usage.llm_calls_used}
              limit={usage.llm_calls_limit}
            />
            <UsageRow
              label="Storage"
              used={usage.storage_bytes_used}
              limit={usage.storage_bytes_limit}
              format={formatBytes}
            />
          </div>

          <div className="mt-auto pt-5">
            {nearLimit && (
              <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                You are close to a plan limit. Upgrade to keep verifying without
                interruption.
              </p>
            )}
            <Link
              href="/usage"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View usage details <IconChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_v, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { stats, isLoading, error, refresh } = useDashboard();
  const { sorted: sortedRecent, toggleSort, sortIndicator } = useSort(stats?.recent_documents ?? [], "created_at", "desc");

  const [usage, setUsage] = useState<UsageStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    getUsage()
      .then((r) => {
        if (!cancelled) setUsage(r.usage);
      })
      .catch(() => {
        // Usage is supplementary — the dashboard still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived stats --------------------------------------------------------

  const displayName = useMemo(() => {
    const meta = user?.user_metadata as { display_name?: string } | undefined;
    return meta?.display_name ?? user?.email?.split("@")[0] ?? "there";
  }, [user]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const thisMonthCount = useMemo(() => {
    if (!stats) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return (stats.recent_documents ?? []).filter(
      (d) => new Date(d.created_at) >= startOfMonth,
    ).length;
  }, [stats]);

  const documentsTrend: TrendIndicator | undefined = useMemo(() => {
    if (thisMonthCount === 0) return undefined;
    return { direction: "up", value: `+${thisMonthCount} this month` };
  }, [thisMonthCount]);

  const anchoredDescription = useMemo(() => {
    if (!stats || stats.document_count === 0) return "Tamper-evident proofs";
    const pct = Math.round((stats.anchored_count / stats.document_count) * 100);
    return `${pct}% of your vault`;
  }, [stats]);

  // Top file types — compact chips under the activity chart
  const topTypes = useMemo(() => {
    if (!stats) return [];
    return [...stats.documents_by_type]
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((item) => ({ label: getFileTypeLabel(item.type), count: item.count }));
  }, [stats]);

  const monthlyUploads = useMemo(() => {
    if (!stats) return [];
    return stats.documents_by_month.map((item) => ({
      label: item.month,
      count: item.count,
    }));
  }, [stats]);

  // ---- Auth gate -------------------------------------------------------------

  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Please log in to view the dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <OnboardingDialog />
      {/* ---- Header: greeting + quick actions -------------------------------- */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{todayLabel}</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {greetingForNow()}, {displayName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACTIONS.map((action) =>
            action.primary ? (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-elevation-1 transition-all hover:bg-secondary/90 hover:shadow-elevation-2"
              >
                {action.icon}
                {action.label}
              </Link>
            ) : (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 transition-all hover:border-secondary/40 hover:shadow-elevation-2"
              >
                {action.icon}
                {action.label}
              </Link>
            ),
          )}
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-elevation-1 transition-all hover:border-secondary/40 hover:text-foreground"
            aria-label="Refresh dashboard data"
            title="Refresh"
          >
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ---- Error ------------------------------------------------------------ */}
      {error && (
        <Alert variant="destructive" className="animate-fade-in" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ---- Loading ---------------------------------------------------------- */}
      {isLoading && <DashboardSkeleton withHeader={false} />}

      {/* ---- Content ---------------------------------------------------------- */}
      {!isLoading && stats && (
        <>
          {/* ---- KPI cards ---------------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              label="Documents"
              value={stats.document_count.toLocaleString()}
              icon={<IconDocument className="h-5 w-5" />}
              description="In your vault"
              trend={documentsTrend}
            />
            <StatsCard
              label="Anchored on-chain"
              value={stats.anchored_count.toLocaleString()}
              icon={<IconShield className="h-5 w-5" />}
              description={anchoredDescription}
            />
            <StatsCard
              label="Active shares"
              value={stats.active_shares.toLocaleString()}
              icon={<IconShare className="h-5 w-5" />}
              description="Live shared links"
            />
            <StatsCard
              label="Storage used"
              value={formatBytes(stats.total_storage_bytes)}
              icon={<IconStorage className="h-5 w-5" />}
              description="Across all files"
            />
          </div>

          {/* ---- Activity chart + Plan & usage -------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-elevation-1">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Upload activity
                </h2>
                <span className="text-xs text-muted-foreground">Last 12 months</span>
              </div>
              <div className="mt-4">
                <BarChart data={monthlyUploads} maxBars={12} />
              </div>
              {topTypes.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                  <span className="text-xs text-muted-foreground">Top types:</span>
                  {topTypes.map((t) => (
                    <span
                      key={t.label}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {t.label}
                      <span className="font-semibold tabular-nums text-foreground">
                        {t.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <UsageCard usage={usage} />
          </div>

          {/* ---- Recent Documents table ----------------------------------- */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Recent documents
              </h2>
              {sortedRecent.length > 0 && (
                <Link
                  href="/vault"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all <IconChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {sortedRecent.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-elevation-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                        Name <span className="ml-0.5">{sortIndicator("name")}</span>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_type")}>
                        Type <span className="ml-0.5">{sortIndicator("file_type")}</span>
                      </th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                        Integrity
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_size_bytes")}>
                        Size <span className="ml-0.5">{sortIndicator("file_size_bytes")}</span>
                      </th>
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("created_at")}>
                        Date <span className="ml-0.5">{sortIndicator("created_at")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecent.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-border/50 transition-colors duration-150 hover:bg-muted/30 last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium truncate block max-w-[220px]">
                            {doc.name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getFileTypeVariant(doc.file_type)}
                            className="text-[10px] px-1.5 py-0 font-medium"
                          >
                            {getFileTypeLabel(doc.file_type)}
                          </Badge>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3">
                          {doc.anchored_at ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground dark:text-secondary">
                              <IconShield className="h-3 w-3" />
                              Anchored
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              Hashed
                            </span>
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-sm text-muted-foreground tabular-nums">
                          {formatBytes(doc.file_size_bytes)}
                        </td>
                        <td className="hidden lg:table-cell px-4 py-3 text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDate(doc.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/5">
                <IconDocument className="h-12 w-12 text-muted-foreground/25" />
                <p className="mt-4 text-sm font-medium text-muted-foreground">
                  No documents uploaded yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60 max-w-sm">
                  Upload a document to set your first verified baseline. It will
                  appear here.
                </p>
                <Link
                  href="/upload"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-elevation-1 hover:bg-secondary/90 transition-colors"
                >
                  <IconUpload className="h-4 w-4" />
                  Upload document
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Empty state (no stats at all) ----------------------------------- */}
      {!isLoading && !stats && !error && <DashboardEmptyState />}
    </div>
  );
}

// ---- Empty state component --------------------------------------------------

function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/5">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl" />
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.75} className="relative h-20 w-20 text-muted-foreground/25" role="img" aria-label="No data">
          <title>No data available</title>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <h2 className="mt-6 text-lg font-semibold text-foreground">
        Welcome to InTrustVault
      </h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        Upload your first document to set a verified baseline — your dashboard
        will populate from there.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-elevation-1 hover:bg-secondary/90 transition-colors"
        >
          <IconUpload className="h-4 w-4" />
          Upload document
        </Link>
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 hover:bg-muted/50 transition-colors"
        >
          Go to vault
          <IconChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ---- Skeleton ---------------------------------------------------------------

function DashboardSkeleton({ withHeader = true }: { withHeader?: boolean }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header skeleton */}
      {withHeader && (
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-3 w-32 mb-2" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="hidden sm:flex gap-2">
            <Skeleton className="h-9 w-40 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
        </div>
      )}

      {/* KPI cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_v, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-start justify-between">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Chart + usage skeleton */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-28 mb-4" />
          {Array.from({ length: 6 }).map((_v, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 flex-1 rounded-r-lg" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <Skeleton className="h-4 w-24 mb-6" />
          {Array.from({ length: 3 }).map((_v, i) => (
            <div key={i} className="mb-4">
              <Skeleton className="h-3 w-28 mb-2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div>
        <Skeleton className="h-4 w-36 mb-3" />
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-3 bg-muted/30">
            <div className="flex gap-8">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          {Array.from({ length: 5 }).map((_v, i) => (
            <div key={i} className="px-4 py-3 border-b border-border/50 last:border-b-0">
              <div className="flex gap-8">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
