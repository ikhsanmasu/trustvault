"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_MIME_TYPES } from "@/lib/core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useBulkUpload } from "@/hooks/use-bulk-upload";
import type { BulkUploadItem } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";

interface BulkUploadProps {
  onComplete?: () => void;
}

export default function BulkUpload({ onComplete }: BulkUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    files,
    addFiles,
    removeFile,
    updateFileName,
    clearFiles,
    uploadAll,
    status,
    result,
    error,
  } = useBulkUpload();

  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const allowed = selected.filter((f) => (ALLOWED_MIME_TYPES as readonly string[]).includes(f.type));
    addFiles(allowed);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = Array.from(e.dataTransfer.files);
      const allowed = dropped.filter((f) => (ALLOWED_MIME_TYPES as readonly string[]).includes(f.type));
      addFiles(allowed);
    },
    [addFiles],
  );

  async function handleUpload() {
    await uploadAll();
    onComplete?.();
  }

  const isUploading = status === "uploading";
  const canUpload = files.length > 0 && !isUploading;

  // Count results
  const okCount = result ? result.succeeded : 0;
  const failCount = result ? result.failed : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bulk Upload</CardTitle>
            <CardDescription>
              Upload up to 10 files at once. Each file can have a custom display name.
            </CardDescription>
          </div>
          {files.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearFiles} disabled={isUploading}>
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p className="text-sm text-muted-foreground mb-2">
            Drag and drop files here, or click to browse.
          </p>
          <label htmlFor="bulk-file-input" className="sr-only">Select files</label>
          <Input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(",")}
            multiple
            onChange={handleFileSelect}
            disabled={isUploading}
            className="hidden"
            id="bulk-file-input"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            Browse Files
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Max 10 files, 20 MB each. 14 formats supported.
          </p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <Label>Selected Files ({files.length}/10)</Label>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {files.map((entry, idx) => (
                <div
                  key={`${entry.file.name}-${idx}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground w-6">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => updateFileName(idx, e.target.value)}
                    disabled={isUploading}
                    className="flex-1 bg-transparent text-sm outline-none min-w-0"
                    maxLength={255}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatBytes(entry.file.size)}
                  </span>
                  {entry.status === "ok" && (
                    <Badge variant="success" className="shrink-0">OK</Badge>
                  )}
                  {entry.status === "error" && (
                    <Badge variant="destructive" className="shrink-0">Failed</Badge>
                  )}
                  {!isUploading && entry.status !== "ok" && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0 ml-1"
                      aria-label={`Remove ${entry.name}`}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Upload button */}
        {files.length > 0 && (
          <Button onClick={handleUpload} disabled={!canUpload} className="w-full">
            {isUploading
              ? "Uploading…"
              : `Upload ${files.length} File${files.length !== 1 ? "s" : ""}`}
          </Button>
        )}

        {/* Results summary */}
        {result && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={failCount > 0 ? "warning" : "success"}>
                  {okCount} succeeded
                </Badge>
                {failCount > 0 && (
                  <Badge variant="destructive">{failCount} failed</Badge>
                )}
              </div>
              {result.results.filter((r: BulkUploadItem) => r.status === "error").length > 0 && (
                <div className="space-y-1">
                  {result.results
                    .filter((r: BulkUploadItem) => r.status === "error")
                    .map((r: BulkUploadItem, idx: number) => (
                      <Alert key={idx} variant="destructive" className="py-2">
                        <AlertDescription>
                          <span className="font-medium">{r.name}</span>: {r.error}
                          {r.code && (
                            <code className="ml-1 text-xs bg-destructive/20 px-1 rounded">
                              {r.code}
                            </code>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
