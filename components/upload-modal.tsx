"use client";

import { useState, useRef, useCallback } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBulkUpload } from "@/hooks/use-bulk-upload";
import { formatBytes } from "@/lib/utils";
import { IconUpload, IconCheck, IconX, IconSpinner, IconTrash, IconDocument } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onSuccess: () => void;
}

export function UploadModal({ open, onOpenChange, projectId, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { files, addFiles, removeFile, clearFiles, uploadAll, status, result, error } = useBulkUpload(projectId ?? "");

  const isUploading = status === "uploading";
  const canUpload = files.length > 0 && !isUploading;
  const done = result !== null;
  const okCount = result ? result.succeeded : 0;
  const failCount = result ? result.failed : 0;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    addFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  function handleClose() {
    clearFiles();
    onOpenChange(false);
    if (done) onSuccess();
  }

  async function handleUpload() {
    await uploadAll();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose} className="max-w-xl p-0 rounded-2xl border-border shadow-elevation-3">
      {/* Header */}
      <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5 px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <IconUpload className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Upload Documents</h2>
              <p className="text-xs text-muted-foreground">14 formats · Max 20 MB each</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleClose}>{done ? "Done" : "Cancel"}</Button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Drop zone */}
        {!done && (
          <>
            <div
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 cursor-pointer",
                dragOver ? "border-primary bg-primary/5 scale-[1.01]" : files.length > 0 ? "border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-muted-foreground/15 hover:border-muted-foreground/30 hover:bg-muted/10",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => { if (!isUploading) fileInputRef.current?.click(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mb-3">
                <IconUpload className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, JSON, CSV, TXT, HTML, MD, XML, and more</p>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept=".pdf,.docx,.xlsx,.xls,.doc,.rtf,.odt,.json,.csv,.txt,.html,.md,.xml,.png,.jpg,.jpeg,.webp" />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                    <IconDocument className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(f.file.size)}</p>
                    </div>
                    {status === "idle" && (
                      <button type="button" onClick={() => removeFile(i)} className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label={`Remove ${f.name}`}>
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isUploading && <IconSpinner className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            {/* Upload button */}
            <div className="flex justify-end gap-2">
              <Button onClick={handleUpload} disabled={!canUpload} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">
                {isUploading ? <> <IconSpinner className="mr-1.5 h-4 w-4 animate-spin" /> Uploading...</> : `Upload ${files.length} file${files.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </>
        )}

        {/* Done state */}
        {done && (
          <div className="text-center py-8 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
              <IconCheck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Upload Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {okCount} succeeded{failCount > 0 ? `, ${failCount} failed` : ""}
              </p>
            </div>
            {failCount > 0 && (
              <div className="space-y-1 text-left max-w-xs mx-auto">
                {result?.results?.filter(r => r.status === "error").map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                    <IconX className="h-3 w-3 shrink-0" />{r.name ?? "Unknown"}: {r.error}
                  </div>
                ))}
              </div>
            )}
            <Button onClick={handleClose} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">Done</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
