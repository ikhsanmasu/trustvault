"use client";

import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { StatsCard } from "@/components/stats-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "@/hooks/use-dashboard";
import { formatBytes, formatDate } from "@/lib/utils";
import { getFileTypeLabel } from "@/components/vault-document-row";

// ---- SVG icons for stats cards ---------------------------------------------

function IconDocuments() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconProjects() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function IconStorage() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      <line x1="16" y1="5" x2="22" y2="5" />
      <line x1="19" y1="2" x2="19" y2="8" />
      <circle cx="8" cy="14" r="2" />
      <line x1="8" y1="10" x2="8" y2="18" />
      <line x1="4" y1="14" x2="12" y2="14" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

// ---- Page -------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { stats, isLoading, error, refresh } = useDashboard();

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to view the dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your document vault
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <Separator />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats cards */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Total Documents"
              value={stats.document_count.toLocaleString()}
              icon={<IconDocuments />}
              description="Across all projects"
            />
            <StatsCard
              label="Projects"
              value={stats.project_count.toLocaleString()}
              icon={<IconProjects />}
              description="Active projects"
            />
            <StatsCard
              label="Storage Used"
              value={formatBytes(stats.total_storage_bytes)}
              icon={<IconStorage />}
              description="Total file size"
            />
            <StatsCard
              label="Recent Activity"
              value={`${stats.recent_documents.length} uploads`}
              icon={<IconActivity />}
              description="Last uploads"
            />
          </div>

          {/* Recent activity */}
          {stats.recent_documents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
              <div className="space-y-2">
                {stats.recent_documents.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {getFileTypeLabel(item.file_type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0 w-36 text-right">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
