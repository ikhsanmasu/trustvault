"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ---- Component ----------------------------------------------------------------

export function ShareLinkCard({ share, documents, onRevoke }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);
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
        "group relative overflow-hidden rounded-2xl border border-l-4",
        isRevoked
          ? "border-l-neutral-400 dark:border-l-neutral-500 opacity-60"
          : "border-l-blue-500 dark:border-l-blue-400",
        "bg-card shadow-elevation-1",
        "transition-all duration-300 ease-out",
        !isRevoked && "hover:shadow-elevation-3 hover:-translate-y-0.5 hover:border-l-[5px]",
      )}
    >
      {/* Hover accent line */}
      <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-secondary/[0.02] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Top row: title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-semibold truncate">{share.title || "Untitled Share"}</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {docCount} document{docCount !== 1 ? "s" : ""}
              <span className="ml-1">· Created {formatShareDate(share.created_at)}</span>
              {share.expires_at && (
                <span className="ml-1">· Expires {formatShareDate(share.expires_at)}</span>
              )}
            </p>
          </div>
          <Badge
            variant={isRevoked ? "outline" : "default"}
            className={cn(
              "shrink-0 text-[10px] px-2 py-0.5 font-medium",
              !isRevoked && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
            )}
          >
            {isRevoked ? "Revoked" : "Active"}
          </Badge>
        </div>

        {/* Document list preview (from full documents if provided) */}
        {docItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {docItems.slice(0, 4).map((doc) => (
              <Badge
                key={doc.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-normal"
              >
                <IconDocument className="h-3 w-3 mr-1" />
                {doc.name}
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
            <span className="text-[11px] text-muted-foreground truncate select-all">
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
              "Copy Link"
            )}
          </Button>

          {!isRevoked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRevoke(share.token)}
              className="h-7 shrink-0 rounded-lg text-xs px-2 text-destructive hover:text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Revoke share link"
            >
              <IconTrash className="h-3 w-3 mr-1" />
              Revoke
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
