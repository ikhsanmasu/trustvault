"use client";

import { useAuthContext } from "@/components/auth-provider";
import { useShares, useRevokeShare } from "@/hooks/use-share";
import { ShareLinkCard } from "@/components/share/share-link-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IconRefresh, IconShare } from "@/components/icons";

export default function SharesPage() {
  const { isLoading: isAuthLoading } = useAuthContext();
  const { shares, isLoading: sharesLoading, error, refresh } = useShares();
  const { revokeLink } = useRevokeShare();

  if (isAuthLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Shared Links
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage public share links for your documents.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <IconRefresh className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {sharesLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!sharesLoading && !error && shares.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <IconShare className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            No shared links yet. Create one from My Vault.
          </p>
        </div>
      )}

      {!sharesLoading && shares.length > 0 && (
        <div className="space-y-3">
          {shares.map((share) => (
            <ShareLinkCard
              key={share.id}
              share={share}
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
