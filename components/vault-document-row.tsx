"use client";

import { Badge } from "@/components/ui/badge";
import type { Document } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { IconShield } from "@/components/icons";

// ---- File type helpers ------------------------------------------------------

const FILE_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/json": "JSON",
  "text/csv": "CSV",
  "text/plain": "TXT",
  "text/html": "HTML",
  "text/markdown": "MD",
  "text/xml": "XML",
  "application/xml": "XML",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WEBP",
};

export function getFileTypeLabel(mimeType: string): string {
  return FILE_TYPE_LABELS[mimeType] || mimeType;
}

export function getFileTypeVariant(
  mimeType: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" {
  if (mimeType.startsWith("image/")) return "secondary";
  if (mimeType === "application/pdf") return "destructive";
  if (mimeType.includes("spreadsheet")) return "success";
  if (mimeType.includes("wordprocessing")) return "default";
  if (
    mimeType === "application/json" ||
    mimeType === "text/xml" ||
    mimeType === "application/xml"
  )
    return "warning";
  return "outline";
}

// Color accent classes per file type
function getFileTypeAccent(mimeType: string): string {
  if (mimeType === "application/pdf") return "border-l-red-500 dark:border-l-red-400";
  if (mimeType.includes("spreadsheet"))
    return "border-l-emerald-500 dark:border-l-emerald-400";
  if (mimeType.includes("wordprocessing"))
    return "border-l-blue-500 dark:border-l-blue-400";
  if (mimeType.startsWith("image/"))
    return "border-l-violet-500 dark:border-l-violet-400";
  if (
    mimeType === "application/json" ||
    mimeType === "text/xml" ||
    mimeType === "application/xml"
  )
    return "border-l-amber-500 dark:border-l-amber-400";
  if (mimeType.startsWith("text/"))
    return "border-l-slate-500 dark:border-l-slate-400";
  return "border-l-neutral-400 dark:border-l-neutral-500";
}

function getFileTypeIconBg(mimeType: string): string {
  if (mimeType === "application/pdf")
    return "bg-red-50 text-red-600 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-800";
  if (mimeType.includes("spreadsheet"))
    return "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800";
  if (mimeType.includes("wordprocessing"))
    return "bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800";
  if (mimeType.startsWith("image/"))
    return "bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800";
  if (
    mimeType === "application/json" ||
    mimeType === "text/xml" ||
    mimeType === "application/xml"
  )
    return "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800";
  if (mimeType.startsWith("text/"))
    return "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:ring-slate-800";
  return "bg-muted text-muted-foreground ring-border dark:bg-muted/50";
}

// ---- Component --------------------------------------------------------------

interface VaultDocumentRowProps {
  document: Document;
  projectName?: string;
  onCompare: (doc: Document) => void;
  onDelete?: (doc: Document) => void;
  onView?: (doc: Document) => void;
  onAnchor?: (doc: Document) => void;
  /** "row" = horizontal table row, "card" = vertical card for grid view */
  variant?: "row" | "card";
}

export function VaultDocumentRow({
  document,
  projectName,
  onCompare,
  onDelete,
  onView,
  onAnchor,
  variant = "row",
}: VaultDocumentRowProps) {
  const isDeleted = !!document.deleted_at;
  const isAnchored = !!document.fingerprint;
  const accentBorder = isDeleted ? "border-l-neutral-300 dark:border-l-neutral-600" : getFileTypeAccent(document.file_type);
  const iconBg = getFileTypeIconBg(document.file_type);

  if (variant === "card") {
    return (
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border",
          "border-l-4",
          accentBorder,
          "shadow-elevation-1",
          "transition-all duration-300 ease-out",
          isDeleted
            ? "bg-muted/20 opacity-70 dark:bg-neutral-900/30 dark:opacity-50"
            : "bg-card hover:shadow-elevation-3 hover:-translate-y-1 hover:border-l-[5px] hover:border-secondary/25 dark:shadow-elevation-1 dark:hover:shadow-elevation-3",
        )}
      >
        {/* Gold accent line on hover */}
        <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

        {/* Card body */}
        <div className="flex flex-1 flex-col p-4">
          {/* File icon + type badge */}
          <div className="mb-3 flex items-start justify-between">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset",
                iconBg,
              )}
            >
              {getFileTypeLabel(document.file_type).slice(0, 2)}
            </div>
            <Badge
              variant={getFileTypeVariant(document.file_type)}
              className="text-[10px] px-1.5 py-0 font-medium"
            >
              {getFileTypeLabel(document.file_type)}
            </Badge>
          </div>

          {/* Document name */}
          <p className={cn("text-sm font-semibold leading-snug line-clamp-2 group-hover:text-foreground transition-colors", isDeleted && "line-through text-muted-foreground/60")}>
            {document.name}
          </p>
          {isDeleted && (
            <Badge className="mb-2 text-[10px] px-1.5 py-0 font-medium bg-neutral-400/20 text-neutral-600 dark:bg-neutral-700/50 dark:text-neutral-300 border-0 w-fit">Deleted</Badge>
          )}

          {/* Project name */}
          {projectName && (
            <p className="text-xs text-muted-foreground/80 truncate mb-3">
              {projectName}
            </p>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-3 mt-1">
            <span className="tabular-nums">{formatBytes(document.file_size_bytes)}</span>
            <span className="tabular-nums">{formatDate(document.created_at)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="border-t border-border/60 px-3 py-2 flex items-center justify-end gap-1 relative z-10">
          {onAnchor && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAnchor(document); }}
              className={cn(
                "cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
                isAnchored
                  ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  : "text-muted-foreground hover:text-secondary hover:bg-secondary/10",
              )}
              title={isAnchored ? "View anchor details" : "Anchor on blockchain"}
              aria-label={isAnchored ? `Anchor details for ${document.name}` : `Anchor ${document.name}`}
            >
              <IconShield className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCompare(document); }}
            className="cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Compare"
            aria-label={`Compare ${document.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView?.(document); }}
            className="cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="View"
            aria-label={`View ${document.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button
            type="button"
            disabled={isDeleted}
            onClick={(e) => { e.stopPropagation(); onDelete?.(document); }}
            className={isDeleted ? "inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground/30 cursor-not-allowed" : "cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"}
            title={document.deleted_at ? "Restore document" : "Delete document"}
            aria-label={document.deleted_at ? `Restore ${document.name}` : `Delete ${document.name}`}
          >
            {document.deleted_at ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---- Row variant (table layout) -------------------------------------------
  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border px-4 py-3.5",
        "border-l-4",
        accentBorder,
        "transition-all duration-200 ease-out",
        isDeleted ? "bg-muted/30 opacity-70" : "bg-card hover:shadow-elevation-1 hover:bg-card/80 dark:hover:shadow-elevation-1",
      )}
    >
      {/* Subtle hover glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 dark:from-primary/[0.04]" />

      {/* File type icon */}
      <div
        className={cn(
          "hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ring-1 ring-inset transition-colors duration-200",
          iconBg,
        )}
      >
        {getFileTypeLabel(document.file_type).slice(0, 2)}
      </div>

      {/* Name + type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate font-medium text-sm", isDeleted && "line-through text-muted-foreground/60")}>
            {document.name}
          </span>
          <Badge
            variant={getFileTypeVariant(document.file_type)}
            className="shrink-0 text-[10px] px-1.5 py-0 font-medium"
          >
            {getFileTypeLabel(document.file_type)}
          </Badge>
          {isDeleted && (
            <Badge className="shrink-0 text-[10px] px-1.5 py-0 font-medium bg-neutral-400/20 text-neutral-600 dark:bg-neutral-700/50 dark:text-neutral-300 border-0">Deleted</Badge>
          )}
        </div>
        {projectName && (
          <p className="mt-0.5 text-xs text-muted-foreground/80 truncate">
            {projectName}
          </p>
        )}
      </div>

      {/* Size */}
      <div className="hidden w-16 shrink-0 text-right text-sm text-muted-foreground sm:block tabular-nums">
        {formatBytes(document.file_size_bytes)}
      </div>

      {/* Date */}
      <div className="hidden w-40 shrink-0 text-right text-sm text-muted-foreground lg:block tabular-nums">
        {formatDate(document.created_at)}
      </div>

      {/* Action buttons */}
      <div className="shrink-0 flex items-center gap-0.5">
        {onAnchor && (
          <button
            type="button"
            onClick={() => onAnchor(document)}
            className={cn(
              "inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
              isAnchored
                ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                : "text-muted-foreground hover:text-secondary hover:bg-secondary/10",
            )}
            title={isAnchored ? "View anchor details" : "Anchor on blockchain"}
            aria-label={isAnchored ? `Anchor details for ${document.name}` : `Anchor ${document.name}`}
          >
            <IconShield className="h-[15px] w-[15px]" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onCompare(document)}
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="Compare this document"
          aria-label={`Compare ${document.name}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </button>
        <button
          type="button"
          onClick={() => onView?.(document)}
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="View document"
          aria-label={`View ${document.name}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(document)}
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
            document.deleted_at
              ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
          )}
          title={document.deleted_at ? "Restore document" : "Delete document"}
          aria-label={document.deleted_at ? `Restore ${document.name}` : `Delete ${document.name}`}
        >
          {document.deleted_at ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          )}
        </button>
      </div>
    </div>
  );
}
