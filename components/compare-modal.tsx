"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { useCompareFile } from "@/hooks/use-compare-file";
import type { Document } from "@/lib/api-client";
import { getFileTypeLabel } from "@/components/vault-document-row";
import { formatBytes, formatDate, cn } from "@/lib/utils";
import { IconUpload, IconDocument, IconSpinner, IconCheck, IconX, IconAlertTriangle, IconFile } from "@/components/icons";

// ---- Helpers ----------------------------------------------------------------

function verdictConfig(v: string) {
  switch (v) {
    case "IDENTICAL": return { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800", text: "text-emerald-800 dark:text-emerald-200", badge: "success" as const, label: "Identical — No Changes", icon: IconCheck };
    case "BINARY_DIFF_ONLY": return { bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800", text: "text-amber-800 dark:text-amber-200", badge: "warning" as const, label: "Binary Difference Only", icon: IconAlertTriangle };
    case "MATERIAL": return { bg: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800", text: "text-red-800 dark:text-red-200", badge: "destructive" as const, label: "Material Change Detected", icon: IconX };
    case "NOT_MATERIAL": return { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800", text: "text-emerald-800 dark:text-emerald-200", badge: "success" as const, label: "Not Material", icon: IconCheck };
    default: return { bg: "bg-muted/30 border-border", text: "text-foreground", badge: "secondary" as const, label: v, icon: IconFile };
  }
}

function confidenceLabel(c: "HIGH" | "MEDIUM" | "LOW" | null): string {
  switch (c) { case "HIGH": return "High Confidence"; case "MEDIUM": return "Medium Confidence"; case "LOW": return "Low Confidence"; default: return ""; }
}

// ---- Main Component ---------------------------------------------------------

interface CompareModalProps {
  document: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompareModal({ document, open, onOpenChange }: CompareModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { result, isLoading, error, runCompare, reset } = useCompareFile();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => modalRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) { setSelectedFile(e.target.files?.[0] ?? null); }
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); setSelectedFile(e.dataTransfer.files?.[0] ?? null); }, []);

  function handleOpenChange(o: boolean) { if (!o) { setSelectedFile(null); reset(); } onOpenChange(o); }
  async function handleCompare() { if (!selectedFile) return; await runCompare(document.id, selectedFile); }
  function handleCompareAnother() { reset(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  const canCompare = selectedFile !== null && !isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} className="max-w-5xl max-h-[92vh] p-0 rounded-3xl border-border shadow-elevation-4">
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Compare document" className="focus:outline-none">

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5 px-6 py-4 border-b border-border">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-secondary/5 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">Compare: {document.name}</h2>
                <p className="text-xs text-muted-foreground">Upload a newer version to detect changes</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} aria-label="Close">Close</Button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* ── Result View ─────────────────────────────────────── */}
          {result ? (
            <CompareResult result={result} storedDocName={document.name} onCompareAnother={handleCompareAnother} onClose={() => handleOpenChange(false)} />
          ) : (
            <>
              {/* ── Two-Column Upload Layout ───────────────────── */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Left: Stored document */}
                <div className="rounded-2xl border border-border bg-card p-4 shadow-elevation-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stored Document</div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <IconDocument className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{document.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">{getFileTypeLabel(document.file_type)}</Badge>
                        <span className="tabular-nums">{formatBytes(document.file_size_bytes)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/50 mt-1.5">{formatDate(document.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Right: Drop zone */}
                <div className={cn("relative rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-300 flex flex-col items-center justify-center", dragOver ? "border-primary bg-primary/5 scale-[1.01]" : selectedFile ? "border-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-muted-foreground/15 hover:border-muted-foreground/30 hover:bg-muted/10 cursor-pointer")}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => { if (!selectedFile) fileInputRef.current?.click(); }}
                  role="button" tabIndex={0} aria-label="Drop file or click to browse"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!selectedFile) fileInputRef.current?.click(); } }}
                >
                  {selectedFile ? (
                    <div className="space-y-1.5">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
                        <IconCheck className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate max-w-[200px]">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{formatBytes(selectedFile.size)}</p>
                      <Button variant="outline" size="sm" className="mt-0.5" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Remove</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                        <IconUpload className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Drop file to compare</p>
                        <p className="text-xs text-muted-foreground mt-0.5">14 formats · Max 20 MB</p>
                      </div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" id="compare-file-input" aria-label="Choose file" />
                </div>
              </div>

              {/* ── Error ──────────────────────────────────────── */}
              {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}

              {/* ── Loading Skeleton ────────────────────────────── */}
              {isLoading && (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-elevation-1" role="status" aria-label="Comparing">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                      <IconSpinner className="h-4 w-4 animate-spin text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Running integrity checks...</p>
                      <p className="text-xs text-muted-foreground">Hashing, extracting text, analyzing differences</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-8 w-full rounded-xl" />
                  </div>
                </div>
              )}

              {/* ── Actions ────────────────────────────────────── */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button onClick={handleCompare} disabled={!canCompare} size="sm" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">
                  {isLoading ? <> <IconSpinner className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Comparing...</> : "Start Comparison"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---- Sub-component: Compare Result View -------------------------------------

interface CompareResultProps {
  result: NonNullable<ReturnType<typeof useCompareFile>["result"]>;
  storedDocName: string;
  onCompareAnother: () => void;
  onClose: () => void;
}

function CompareResult({ result, storedDocName, onCompareAnother, onClose }: CompareResultProps) {
  const cfg = verdictConfig(result.verdict);
  const Icon = cfg.icon;

  return (
    <div className="space-y-5">
      {/* ── Documents Compared ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Baseline</div>
          <p className="text-sm font-semibold text-foreground truncate">{storedDocName}</p>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Currently stored version</p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Comparison File</div>
          <p className="text-sm font-semibold text-foreground truncate">{result.uploadedFileName}</p>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Uploaded for this check</p>
        </div>
      </div>

      {/* ── Verdict Card ──────────────────────────────────────── */}
      <div className={cn("rounded-2xl border-2 p-5", cfg.bg)} role="status" aria-live="polite">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", result.verdict === "MATERIAL" ? "bg-red-100 dark:bg-red-900/40" : result.verdict === "IDENTICAL" ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-amber-100 dark:bg-amber-900/40")}>
            <Icon className={cn("h-6 w-6", cfg.text)} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={cn("text-lg font-bold", cfg.text)}>{cfg.label}</h3>
            {result.confidence && <p className="text-sm text-muted-foreground">{confidenceLabel(result.confidence)}</p>}
          </div>
          <Badge variant={cfg.badge} className="shrink-0 px-3 py-1.5 text-sm font-bold">{cfg.label.split(" —")[0]}</Badge>
        </div>
      </div>

      {/* ── Pipeline + Reasoning side-by-side ───────────────── */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Integrity Pipeline</h4>
          <div className="flex items-center gap-0">
            {[
              { step: 1, label: "Binary Hash", done: true },
              { step: 2, label: "Text Hash", done: true },
              { step: 3, label: "Analysis", done: result.stage === "AI_COMPARE" },
            ].map((s, i) => (
              <div key={s.step} className="flex items-center flex-1">
                <div className={cn("flex flex-col items-center gap-0.5 flex-1", s.done ? "opacity-100" : "opacity-40")}>
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-mono font-bold", s.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                    {s.done ? <IconCheck className="h-3.5 w-3.5" /> : s.step}
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight">{s.label}</span>
                </div>
                {i < 2 && <div className={cn("h-0.5 flex-1 -mt-2 mx-0.5 rounded-full", s.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-muted-foreground/15")} />}
              </div>
            ))}
          </div>
        </div>
        {result.reasoning ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Analysis Notes</h4>
            <div className={cn("rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap", cfg.bg)}>{result.reasoning}</div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground/40 italic py-6">No additional notes</div>
        )}
      </div>

      {/* ── Footer Actions ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">Deterministic hashing verified before analysis.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={onCompareAnother} className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">Compare Another</Button>
        </div>
      </div>
    </div>
  );
}
