"use client";

import { useState, useCallback } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Document } from "@/lib/api-client";
import { getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import { formatBytes, formatDate } from "@/lib/utils";
import { IconDocument } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Props { document: Document; open: boolean; onOpenChange: (open: boolean) => void; }

export function DocumentPreviewModal({ document, open, onOpenChange }: Props) {
  const isDeleted = !!document.deleted_at;
  const fileUrl = `/api/documents/${document.id}/file`;
  const [previewError, setPreviewError] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);

  const onPreviewError = useCallback(() => { setPreviewError(true); setPreviewLoading(false); }, []);
  const onPreviewLoad = useCallback(() => setPreviewLoading(false), []);

  const hasText = !!document.extracted_text;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-[98vw] w-[1600px] h-[98vh] p-0 rounded-2xl border-border shadow-elevation-3 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5 px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconDocument className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className={cn("text-sm font-bold tracking-tight truncate", isDeleted && "line-through text-muted-foreground")}>{document.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={getFileTypeVariant(document.file_type)} className="text-[10px] px-1.5 py-0 font-medium">{getFileTypeLabel(document.file_type)}</Badge>
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatBytes(document.file_size_bytes)}</span>
                <span className="text-[11px] text-muted-foreground">· {formatDate(document.created_at)}</span>
                {isDeleted && <Badge variant="secondary" className="text-[10px]">Deleted</Badge>}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </div>

      {/* Body: flexible layout */}
      <div className="flex flex-col sm:flex-row min-h-0 flex-1 overflow-hidden">
        {/* LEFT: File preview — iframe for all types */}
        <div className="flex-1 min-h-[350px] bg-muted/20 relative">
          {previewLoading && <Skeleton className="absolute inset-0 rounded-none z-10" />}
          {!previewError ? (
            <iframe src={fileUrl} className="w-full h-full border-0" title={document.name} onLoad={onPreviewLoad} onError={onPreviewError} />
          ) : hasText ? (
            <div className="p-4 w-full h-full overflow-auto">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Extracted Text</span>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80 font-mono mt-1.5">{document.extracted_text}</pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/40 p-8">
              <IconDocument className="h-12 w-12" />
              <span className="text-sm">No preview available</span>
            </div>
          )}
        </div>

        {/* RIGHT: Metadata + hashes */}
        <div className="sm:w-80 shrink-0 border-t sm:border-t-0 sm:border-l border-border p-4 space-y-3 overflow-y-auto text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Size</span>
            <p className="font-medium tabular-nums">{formatBytes(document.file_size_bytes)}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Type</span>
            <p className="font-medium text-xs break-all">{document.file_type}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Uploaded By</span>
            <p className="font-medium text-xs font-mono truncate" title={document.uploaded_by ?? ""}>{(document.uploaded_by ?? "").slice(0, 8)}...</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Uploaded At</span>
            <p className="font-medium">{formatDate(document.created_at)}</p>
          </div>
          {document.deleted_at && (
            <>
              <div>
                <span className="text-xs text-muted-foreground">Deleted By</span>
                <p className="font-medium text-xs font-mono truncate text-destructive" title={document.deleted_by ?? ""}>{(document.deleted_by ?? "").slice(0, 8)}...</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Deleted At</span>
                <p className="font-medium text-destructive">{formatDate(document.deleted_at)}</p>
              </div>
            </>
          )}

          <Separator />

          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Binary Hash</span>
            <p className="text-[11px] font-mono text-foreground/60 mt-0.5 break-all leading-snug">{document.binary_hash}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Text Hash</span>
            <p className="text-[11px] font-mono text-foreground/60 mt-0.5 break-all leading-snug">{document.text_hash}</p>
          </div>

          <Separator />
          <p className="text-[10px] text-muted-foreground/60">ID: {document.id}</p>
          {document.deleted_at && (
            <div className="pt-2">
              <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">This document has been deleted. File is no longer available. Integrity hashes are preserved.</p>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
