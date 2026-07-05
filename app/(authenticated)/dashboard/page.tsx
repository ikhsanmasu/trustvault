"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { useSort } from "@/hooks/use-sort";
import { StatsCard } from "@/components/stats-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/hooks/use-dashboard";
import { formatBytes, formatDate } from "@/lib/utils";
import { getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import type { TrendIndicator } from "@/components/stats-card";
import {
  IconDocument,
  IconBriefcase,
  IconStorage,
  IconCalendar,
  IconChevronRight,
  IconRefresh,
  IconUsers,
  IconShield,
  IconShare,
} from "@/components/icons";
import { BarChart } from "@/components/analytics/bar-chart";

// ---- Donut chart (pure CSS) -------------------------------------------------

interface DonutSegment {
  label: string;
  count: number;
  color: string;
}

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  // Build sr-only description
  const srDescription = useMemo(() => {
    if (total === 0) return "No documents yet";
    return segments.map((s) => `${s.label}: ${s.count}`).join(", ");
  }, [segments, total]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Empty chart">
            <title>No documents yet</title>
            <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/30" />
          </svg>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">No documents yet</p>
      </div>
    );
  }

  // Build conic gradient segments
  let cumulative = 0;
  const gradientParts: string[] = [];
  const totalForCalc = segments.reduce((sum, s) => sum + s.count, 0);

  for (const seg of segments) {
    const start = (cumulative / totalForCalc) * 100;
    const end = ((cumulative + seg.count) / totalForCalc) * 100;
    gradientParts.push(`${seg.color} ${start}% ${end}%`);
    cumulative += seg.count;
  }

  if (cumulative === 0) return null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Screen-reader text describing the chart data */}
      <div className="sr-only" role="status" aria-live="polite">
        Document type breakdown: {srDescription}. Total: {total} documents.
      </div>

      <div className="relative h-28 w-28" role="img" aria-label={`Donut chart: ${srDescription}. Total: ${total}`}>
        <title>{`Document types: ${srDescription}. Total: ${total}`}</title>
        {/* Donut ring using conic gradient */}
        <div
          className="h-full w-full rounded-full"
          style={{
            background: `conic-gradient(${gradientParts.join(", ")})`,
            mask: "radial-gradient(circle, transparent 55%, black 56%)",
            WebkitMask: "radial-gradient(circle, transparent 55%, black 56%)",
          }}
        />
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-foreground">
            {total}
          </span>
          <span className="text-[10px] text-muted-foreground">docs</span>
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-muted-foreground">
              {seg.label} <span className="font-medium text-foreground tabular-nums">{seg.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Chart colors -----------------------------------------------------------
const CHART_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red (PDF)
  "#10b981", // emerald (XLSX)
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
];

// ---- Page -------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { stats, isLoading, error, refresh } = useDashboard();
  const { sorted: sortedRecent, toggleSort, sortIndicator } = useSort(stats?.recent_documents ?? [], "created_at", "desc");

  // ---- Derived stats --------------------------------------------------------

  const thisMonthCount = useMemo(() => {
    if (!stats) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Count from the unsorted source list — the count is order-independent,
    // so this memo only needs to recompute when the stats change.
    return (stats.recent_documents ?? []).filter(
      (d) => new Date(d.created_at) >= startOfMonth,
    ).length;
  }, [stats]);

  const recentTrend: TrendIndicator | undefined = useMemo(() => {
    if (!stats || thisMonthCount === 0) return undefined;
    return {
      direction: "up",
      value: `${thisMonthCount} this month`,
      label: "Active uploads",
    };
  }, [stats, thisMonthCount]);

  // Document type breakdown for chart — use API-provided data
  const typeSegments = useMemo(() => {
    if (!stats) return [];
    return stats.documents_by_type
      .sort((a, b) => b.count - a.count)
      .map((item, i) => ({
        label: getFileTypeLabel(item.type),
        count: item.count,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [stats]);

  // Monthly uploads for bar chart — map API shape to BarChart props
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
    <div className="space-y-8 animate-fade-in">
      {/* ---- Hero Header ------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl hero-gradient mb-2">
        {/* dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        {/* gold blur blob */}
        <div
          className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
                Dashboard
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
                Welcome back
              </h1>
              <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty">
                Here is what is happening across your vault.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-elevation-1 transition-all duration-200 hover:border-secondary/40 hover:text-foreground hover:shadow-elevation-2"
              aria-label="Refresh dashboard data"
            >
              <IconRefresh className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* ---- Error ------------------------------------------------------------ */}
      {error && (
        <Alert variant="destructive" className="animate-fade-in" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ---- Loading ---------------------------------------------------------- */}
      {isLoading && <DashboardSkeleton />}

      {/* ---- Content ---------------------------------------------------------- */}
      {!isLoading && stats && (
        <>
          {/* ---- Hero stat cards --------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatsCard
              label="Total Documents"
              value={stats.document_count.toLocaleString()}
              icon={<IconDocument className="h-5 w-5" />}
              description="Across all groups"
              trend={
                sortedRecent.length > 0
                  ? {
                      direction: "up",
                      value: `+${sortedRecent.length}`,
                      label: "Recent activity",
                    }
                  : undefined
              }
              accentColor="border-l-blue-500 dark:border-l-blue-400"
              iconBg="from-blue-500/15 via-blue-500/10 to-blue-500/5"
            />
            <StatsCard
              label="Total Chunks"
              value={stats.total_chunks.toLocaleString()}
              icon={<IconBriefcase className="h-5 w-5" />}
              description="AI-indexed chunks"
              accentColor="border-l-violet-500 dark:border-l-violet-400"
              iconBg="from-violet-500/15 via-violet-500/10 to-violet-500/5"
            />
            <StatsCard
              label="Storage Used"
              value={formatBytes(stats.total_storage_bytes)}
              icon={<IconStorage className="h-5 w-5" />}
              description="Total across all files"
              accentColor="border-l-emerald-500 dark:border-l-emerald-400"
              iconBg="from-emerald-500/15 via-emerald-500/10 to-emerald-500/5"
            />
            <StatsCard
              label="This Month"
              value={thisMonthCount.toLocaleString()}
              icon={<IconCalendar className="h-5 w-5" />}
              description={thisMonthCount === 0 ? "No uploads this month" : "New documents uploaded"}
              trend={recentTrend}
              accentColor="border-l-amber-500 dark:border-l-amber-400"
              iconBg="from-amber-500/15 via-amber-500/10 to-amber-500/5"
            />
            <StatsCard
              label="Total Users"
              value={stats.total_users.toLocaleString()}
              icon={<IconUsers className="h-5 w-5" />}
              description="Across all groups"
              accentColor="border-l-cyan-500 dark:border-l-cyan-400"
              iconBg="from-cyan-500/15 via-cyan-500/10 to-cyan-500/5"
            />
            <StatsCard
              label="Anchored Docs"
              value={stats.anchored_count.toLocaleString()}
              icon={<IconShield className="h-5 w-5" />}
              description="Blockchain-anchored"
              accentColor="border-l-rose-500 dark:border-l-rose-400"
              iconBg="from-rose-500/15 via-rose-500/10 to-rose-500/5"
            />
            <StatsCard
              label="Active Shares"
              value={stats.active_shares.toLocaleString()}
              icon={<IconShare className="h-5 w-5" />}
              description="Active shared links"
              accentColor="border-l-indigo-500 dark:border-l-indigo-400"
              iconBg="from-indigo-500/15 via-indigo-500/10 to-indigo-500/5"
            />
          </div>

          {/* ---- Charts: Donut + Bar in two columns -------------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Donut chart: Documents by type */}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
                By Type
              </h2>
              <div className="rounded-2xl border bg-card p-5 shadow-elevation-1">
                <DonutChart segments={typeSegments} total={sortedRecent.length} />
              </div>
            </div>

            {/* Bar chart: Uploads by month */}
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
                Uploads by Month
              </h2>
              <div className="rounded-2xl border bg-card p-5 shadow-elevation-1">
                <BarChart data={monthlyUploads} maxBars={12} />
              </div>
            </div>
          </div>

          {/* ---- Recent Documents table ----------------------------------- */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Recent Documents
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
                          <span className="text-sm font-medium truncate block max-w-[200px]">
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
                  Upload a PDF or document to get started. They will appear here.
                </p>
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
        Your dashboard will populate once you create a group and upload your
        first document. Get started by visiting the Vault or Groups page.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elevation-1 hover:bg-primary/90 transition-colors"
        >
          Go to Vault
          <IconChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 hover:bg-muted/50 transition-colors"
        >
          Manage Groups
        </Link>
      </div>
    </div>
  );
}

// ---- Skeleton ---------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_v, i) => (
          <div key={i} className="rounded-2xl border bg-card p-6 border-l-4 border-l-muted">
            <div className="mb-4 flex items-start justify-between">
              <Skeleton className="h-11 w-11 rounded-2xl" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-10 w-24 mb-2" />
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Charts skeleton: Donut + Bar */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Skeleton className="h-6 w-20 mb-4" />
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="h-28 w-28 rounded-full" />
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {Array.from({ length: 3 }).map((_v, i) => (
                  <Skeleton key={i} className="h-3 w-16 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <Skeleton className="h-6 w-36 mb-4" />
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            {Array.from({ length: 6 }).map((_v, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 flex-1 rounded-r-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table skeleton */}
      <div>
        <Skeleton className="h-6 w-36 mb-4" />
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
