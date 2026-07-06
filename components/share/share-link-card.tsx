"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconLink, IconCheck, IconTrash, IconDocument } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SharedLink, Document } from "@/lib/api-client";

// ---- Props --------------------------------------------------------------------

interface ShareLinkCardProps {
  share: SharedLink;
  documents?: Document[];
  onRevoke: (token: string) => void;
}

// ---- Helpers ------------------------------------------------------------------

function formatShareDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(share: SharedLink): boolean {
  return !!share.expires_at && new Date(share.expires_at).getTime() < Date.now();
}

// ---- Status chip ----------------------------------------------------------------

function StatusBadge({ share }: { share: SharedLink }) {
  if (!share.is_active) {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Revoked
      </span>
    );
  }
  if (isExpired(share)) {
    return (
      <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
        Expired
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
      Active
    </span>
  );
}

// ---- Permission chips ------------------------------------------------------------

function PermissionChips({ share }: { share: SharedLink }) {
  const granted: string[] = [];
  if (share.allow_download) granted.push("Download");
  if (share.allow_chat) granted.push("Ask AI");
  if (share.allow_compare) granted.push("Compare");
  if (share.allow_anchor) granted.push("Anchor");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        Permissions
      </span>
      <span className="inline-flex items-center rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/15">
        View
      </span>
      {granted.map((p) => (
        <span
          key={p}
          className="inline-flex items-center rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-primary dark:bg-primary/15"
        >
          {p}
        </span>
      ))}
      {granted.length === 0 && (
        <span className="text-[10px] text-muted-foreground/60">only</span>
      )}
    </div>
  );
}

// ---- Component ----------------------------------------------------------------

export function ShareLinkCard({ share, documents, onRevoke }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const isRevoked = !share.is_active;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${share.token}`
      : `/share/${share.token}`;

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const docCount = share.document_ids.length;
  const docItems = documents
    ? documents.filter((d) => share.document_ids.includes(d.id))
    : [];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-1",
        "transition-all duration-300 ease-out",
        isRevoked
          ? "opacity-60"
          : "hover:shadow-elevation-3 hover:border-secondary/25",
      )}
    >
      {/* Hover accent line */}
      <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Top row: title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-semibold truncate">{share.title || "Untitled share"}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {docCount} document{docCount !== 1 ? "s" : ""}
              <span className="ml-1">· Created {formatShareDate(share.created_at)}</span>
              {share.expires_at && (
                <span className={cn("ml-1", isExpired(share) && share.is_active && "text-warning font-medium")}>
                  · Expire{isExpired(share) ? "d" : "s"} {formatShareDate(share.expires_at)}
                </span>
              )}
            </p>
          </div>
          <StatusBadge share={share} />
        </div>

        {/* What this link can do */}
        <PermissionChips share={share} />

        {/* Document list preview (from full documents if provided) */}
        {docItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {docItems.slice(0, 4).map((doc) => (
              <Badge
                key={doc.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-normal max-w-[200px]"
              >
                <IconDocument className="h-3 w-3 mr-1 shrink-0" />
                <span className="truncate">{doc.name}</span>
              </Badge>
            ))}
            {docItems.length > 4 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                +{docItems.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Link + actions */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 flex items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-1.5 min-w-0">
            <IconLink className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <span className="font-hash text-[11px] text-muted-foreground truncate select-all">
              {shareUrl}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(shareUrl, "_blank")}
            className="h-7 shrink-0 rounded-lg text-xs px-2"
            title="Open share link"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="h-7 shrink-0 rounded-lg text-xs px-2"
            title="Copy share link"
          >
            {copied ? (
              <>
                <IconCheck className="h-3 w-3 mr-1" />
                Copied
              </>
            ) : (
              "Copy link"
            )}
          </Button>

          {!isRevoked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRevoke(true)}
              className="h-7 shrink-0 rounded-lg text-xs px-2 text-destructive hover:text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Revoke share link"
            >
              <IconTrash className="h-3 w-3 mr-1" />
              Revoke
            </Button>
          )}
        </div>
      </div>

      {/* Revoke confirmation */}
      {confirmRevoke && (
        <ConfirmDialog
          open={confirmRevoke}
          onOpenChange={setConfirmRevoke}
          title="Revoke share link"
          description={`Revoke "${share.title || "this share link"}"? Anyone holding the link will immediately lose access. This cannot be undone.`}
          confirmLabel="Revoke"
          variant="destructive"
          onConfirm={() => {
            setConfirmRevoke(false);
            onRevoke(share.token);
          }}
        />
      )}
    </div>
  );
}
