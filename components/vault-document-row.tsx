"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Document } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

function getFileTypeVariant(
  mimeType: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" {
  if (mimeType.startsWith("image/")) return "secondary";
  if (mimeType === "application/pdf") return "destructive";
  if (mimeType.includes("spreadsheet")) return "success";
  if (mimeType.includes("wordprocessing")) return "default";
  if (mimeType === "application/json" || mimeType === "text/xml" || mimeType === "application/xml")
    return "warning";
  return "outline";
}

// ---- Component --------------------------------------------------------------

interface VaultDocumentRowProps {
  document: Document;
  projectName?: string;
  onCompare: (doc: Document) => void;
}

export function VaultDocumentRow({
  document,
  projectName,
  onCompare,
}: VaultDocumentRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors",
        "hover:bg-muted/50",
      )}
    >
      {/* Name + type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{document.name}</span>
          <Badge
            variant={getFileTypeVariant(document.file_type)}
            className="shrink-0 text-[10px]"
          >
            {getFileTypeLabel(document.file_type)}
          </Badge>
        </div>
        {projectName && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {projectName}
          </p>
        )}
      </div>

      {/* Size */}
      <div className="hidden w-20 shrink-0 text-right text-sm text-muted-foreground sm:block">
        {formatBytes(document.file_size_bytes)}
      </div>

      {/* Date */}
      <div className="hidden w-40 shrink-0 text-right text-sm text-muted-foreground lg:block">
        {formatDate(document.created_at)}
      </div>

      {/* Compare button */}
      <div className="shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCompare(document)}
        >
          Compare
        </Button>
      </div>
    </div>
  );
}
