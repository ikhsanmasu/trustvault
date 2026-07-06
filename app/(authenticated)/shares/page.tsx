"use client";

import Link from "next/link";
import { useAuthContext } from "@/components/auth-provider";
import { useShares, useRevokeShare } from "@/hooks/use-share";
import { useDocuments } from "@/hooks/use-documents";
import { ShareLinkCard } from "@/components/share/share-link-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IconRefresh, IconShare, IconChevronRight } from "@/components/icons";

export default function SharesPage() {
  const { isLoading: isAuthLoading } = useAuthContext();
  const { shares, isLoading: sharesLoading, error, refresh } = useShares();
  const { revokeLink } = useRevokeShare();

  // Resolve document names for the cards; include deleted docs so shares
  // referencing them still show what they pointed at.
  const { documents } = useDocuments({ limit: 200, includeDeleted: true });

  const activeCount = shares.filter((s) => s.is_active).length;

  if (isAuthLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in">
      {/* ---- Header ---- */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Shared links
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shares.length > 0
              ? `${activeCount} active of ${shares.length} link${shares.length !== 1 ? "s" : ""} — review what each one can do.`
              : "Public links you create for your documents appear here."}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-elevation-1 transition-all hover:border-secondary/40 hover:text-foreground"
          aria-label="Refresh shared links"
          title="Refresh"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {sharesLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!sharesLoading && !error && shares.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/5">
          <IconShare className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            No shared links yet
          </p>
          <p className="text-xs text-muted-foreground/60 max-w-sm">
            Select documents in your vault and share them through a revocable
            link with the exact permissions you choose.
          </p>
          <Link
            href="/vault"
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-elevation-1 hover:border-secondary/40 transition-all"
          >
            Go to vault
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {!sharesLoading && shares.length > 0 && (
        <div className="space-y-3">
          {shares.map((share) => (
            <ShareLinkCard
              key={share.id}
              share={share}
              documents={documents}
              onRevoke={async (token) => {
                await revokeLink(token);
                refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
