"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { useCompareFile } from "@/hooks/use-compare-file";
import type { Document } from "@/lib/api-client";
import { getFileTypeLabel } from "@/components/vault-document-row";
import { formatBytes, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ---- Verdict helpers --------------------------------------------------------

function verdictVariant(
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL",
): "destructive" | "success" | "warning" | "secondary" | "outline" {
  switch (verdict) {
    case "IDENTICAL":
      return "secondary";
    case "BINARY_DIFF_ONLY":
      return "outline";
    case "MATERIAL":
      return "destructive";
    case "NOT_MATERIAL":
      return "success";
    default:
      return "secondary";
  }
}

function verdictLabel(
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL",
): string {
  switch (verdict) {
    case "IDENTICAL":
      return "Identical";
    case "BINARY_DIFF_ONLY":
      return "Binary Diff Only";
    case "MATERIAL":
      return "Material Change";
    case "NOT_MATERIAL":
      return "Not Material";
    default:
      return verdict;
  }
}

function confidenceVariant(
  c: "HIGH" | "MEDIUM" | "LOW" | null,
): "default" | "secondary" | "outline" {
  switch (c) {
    case "HIGH":
      return "default";
    case "MEDIUM":
      return "secondary";
    case "LOW":
      return "outline";
    default:
      return "outline";
  }
}

const stageLabels: Record<string, string> = {
  BINARY_MATCH: "Binary Match",
  TEXT_MATCH: "Text Match",
  AI_COMPARE: "AI Compare",
};

// ---- Component --------------------------------------------------------------

interface CompareModalProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompareModal({
  document,
  open,
  onOpenChange,
}: CompareModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { result, isLoading, error, runCompare, reset } = useCompareFile();

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    setSelectedFile(file);
  }, []);

  function handleOpenChange(open: boolean) {
    if (!open) {
      // Reset state when closing
      setSelectedFile(null);
      reset();
    }
    onOpenChange(open);
  }

  async function handleCompare() {
    if (!selectedFile) return;
    await runCompare(document.id, selectedFile);
  }

  function handleCompareAnother() {
    reset();
    setSelectedFile(null);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canCompare = selectedFile !== null && !isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Compare Document</h2>
            <p className="text-sm text-muted-foreground">
              Compare a stored document against an uploaded file
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
        </div>

        <Separator className="mb-4" />

        {/* Stored document info */}
        <div className="rounded-md border bg-muted/30 p-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{document.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {getFileTypeLabel(document.file_type)}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
            <span>{formatBytes(document.file_size_bytes)}</span>
            <span>Uploaded {formatDate(document.created_at)}</span>
          </div>
        </div>

        {/* Results view or file selection */}
        {result ? (
          <CompareResultView
            result={result}
            storedDocName={document.name}
            onCompareAnother={handleCompareAnother}
            onClose={() => handleOpenChange(false)}
          />
        ) : (
          <>
            {/* Drop zone */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(selectedFile.size)} — {selectedFile.type || "Unknown type"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    Drag and drop a file here, or click to browse.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="compare-file-input"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </Button>
                </>
              )}
            </div>

            {/* Supported types hint */}
            <p className="text-xs text-muted-foreground mb-4">
              Supported: PDF, DOCX, XLSX, JSON, CSV, TXT, HTML, Markdown, XML, PNG, JPEG, WEBP
              (max 20 MB)
            </p>

            {/* Error */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="space-y-3 py-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {/* Compare button */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCompare} disabled={!canCompare}>
                {isLoading ? "Comparing…" : "Compare"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---- Sub-component: Compare Result View -------------------------------------

interface CompareResultViewProps {
  result: NonNullable<
    ReturnType<typeof useCompareFile>["result"]
  >;
  storedDocName: string;
  onCompareAnother: () => void;
  onClose: () => void;
}

function CompareResultView({
  result,
  storedDocName,
  onCompareAnother,
  onClose,
}: CompareResultViewProps) {
  return (
    <div className="space-y-4">
      {/* Documents compared */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Stored Document (baseline)
          </div>
          <div className="font-medium text-sm">{storedDocName}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Uploaded File (comparison)
          </div>
          <div className="font-medium text-sm">{result.uploadedFileName}</div>
        </div>
      </div>

      <Separator />

      {/* Verdict */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Verdict:</span>
        <Badge
          variant={verdictVariant(result.verdict)}
          className="text-sm px-3 py-1"
        >
          {verdictLabel(result.verdict)}
        </Badge>
        {result.confidence && (
          <>
            <span className="text-sm font-medium">Confidence:</span>
            <Badge variant={confidenceVariant(result.confidence)}>
              {result.confidence}
            </Badge>
          </>
        )}
      </div>

      {/* Pipeline steps */}
      <div className="grid gap-2 text-sm">
        <div
          className={cn(
            "rounded-md px-3 py-2 flex items-center gap-2",
            result.stage === "BINARY_MATCH"
              ? "bg-green-50 dark:bg-green-950"
              : "bg-muted/50",
          )}
        >
          <Badge
            variant={
              result.stage === "BINARY_MATCH" ? "success" : "outline"
            }
          >
            Step 1
          </Badge>
          <span>
            Binary hashes are{" "}
            {result.stage === "BINARY_MATCH"
              ? "identical"
              : "different"}
          </span>
        </div>
        {result.stage !== "BINARY_MATCH" && (
          <div
            className={cn(
              "rounded-md px-3 py-2 flex items-center gap-2",
              result.stage === "TEXT_MATCH"
                ? "bg-green-50 dark:bg-green-950"
                : "bg-muted/50",
            )}
          >
            <Badge
              variant={
                result.stage === "TEXT_MATCH" ? "success" : "outline"
              }
            >
              Step 2
            </Badge>
            <span>
              Text hashes are{" "}
              {result.stage === "TEXT_MATCH"
                ? "identical (binary difference only)"
                : "different — AI assessment triggered"}
            </span>
          </div>
        )}
        {result.stage === "AI_COMPARE" && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 px-3 py-2 flex items-center gap-2">
            <Badge>Step 3</Badge>
            <span>AI assessment completed</span>
          </div>
        )}
      </div>

      {/* AI Reasoning */}
      {result.reasoning && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">AI Reasoning</h4>
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {result.reasoning}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      <Separator />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onCompareAnother}>Compare Another</Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Stage: {stageLabels[result.stage] || result.stage}. Deterministic hash
        pipeline checked before any AI call.
      </p>
    </div>
  );
}
