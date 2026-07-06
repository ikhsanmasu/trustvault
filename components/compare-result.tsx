"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDocuments } from "@/hooks/use-documents";
import {
  compareDocuments,
  compareWithFile,
  type CompareResult,
  type Document,
  ApiClientError,
} from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { IconDocument, IconUpload, IconSearch, IconX, IconCheck } from "@/components/icons";

// ---- Searchable document picker ----------------------------------------------

function DocPicker({
  label,
  documents,
  value,
  onChange,
  excludeId,
  disabled,
}: {
  label: string;
  documents: Document[];
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = documents.find((d) => d.id === value) ?? null;

  const filtered = useMemo(() => {
    const pool = documents.filter((d) => d.id !== excludeId);
    if (!query.trim()) return pool;
    const q = query.toLowerCase();
    return pool.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, excludeId, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen(!open); setQuery(""); }}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-xl border bg-card px-3 text-left text-sm shadow-elevation-1 transition-colors",
            selected ? "border-border text-foreground" : "border-border text-muted-foreground",
            !disabled && "hover:border-primary/30",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <IconDocument className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <span className="flex-1 truncate">
            {selected ? selected.name : "Choose a document…"}
          </span>
          {selected && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange(""); } }}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
              aria-label="Clear selection"
            >
              <IconX className="h-3.5 w-3.5" />
            </span>
          ) : (
            <svg className="h-3 w-3 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          )}
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-xl border border-border bg-card shadow-elevation-3 overflow-hidden">
            <div className="relative border-b border-border/60 p-2">
              <IconSearch className="absolute left-[18px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                autoFocus
                placeholder="Search documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-xs rounded-lg"
                aria-label="Search documents"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground/60">
                  No documents match.
                </li>
              )}
              {filtered.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={doc.id === value}
                    onClick={() => { onChange(doc.id); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      doc.id === value && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    {doc.id === value ? (
                      <IconCheck className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <IconDocument className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className="flex-1 truncate">{doc.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
                      {formatBytes(doc.file_size_bytes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- File drop zone ------------------------------------------------------------

function FileDropZone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">New file to check</span>
      {file ? (
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm shadow-elevation-1">
          <IconDocument className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <span className="flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
            {formatBytes(file.size)}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => { onFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
              aria-label="Remove file"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (disabled) return;
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) onFile(dropped);
          }}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-sm transition-colors",
            dragging
              ? "border-secondary bg-secondary/5 text-foreground"
              : "border-border text-muted-foreground hover:border-secondary/50 hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <IconUpload className="h-4 w-4" />
          Drop a file here or click to browse
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
        }}
        aria-label="Choose a file to compare"
      />
    </div>
  );
}

// ---- Verdict presentation --------------------------------------------------------

const VERDICT_META: Record<
  CompareResult["verdict"],
  { label: string; sub: string; chip: string }
> = {
  IDENTICAL: {
    label: "Identical",
    sub: "Byte-for-byte the same file. Nothing changed.",
    chip: "bg-success/10 text-success",
  },
  BINARY_DIFF_ONLY: {
    label: "Same content",
    sub: "The file bytes differ (e.g. re-saved or re-exported), but the extracted text is identical.",
    chip: "bg-primary/10 text-primary",
  },
  NOT_MATERIAL: {
    label: "Not material",
    sub: "The content changed, but the AI judged the changes cosmetic — no meaning, value, or obligation altered.",
    chip: "bg-success/10 text-success",
  },
  MATERIAL: {
    label: "Material change",
    sub: "The AI found changes that alter meaning, value, or obligation. Review before acting on this document.",
    chip: "bg-destructive/10 text-destructive",
  },
};

function PipelineSteps({ stage }: { stage: CompareResult["stage"] }) {
  const steps = [
    {
      title: "Binary hash",
      detail:
        stage === "BINARY_MATCH"
          ? "Identical — resolved here, no AI involved"
          : "Different — continuing to text comparison",
      resolved: stage === "BINARY_MATCH",
      reached: true,
    },
    {
      title: "Extracted text hash",
      detail:
        stage === "BINARY_MATCH"
          ? "Not needed"
          : stage === "TEXT_MATCH"
            ? "Identical — binary difference only, no AI involved"
            : "Different — AI assessment triggered",
      resolved: stage === "TEXT_MATCH",
      reached: stage !== "BINARY_MATCH",
    },
    {
      title: "AI materiality assessment",
      detail:
        stage === "AI_COMPARE"
          ? "Completed — verdict above"
          : "Not needed — hashes resolved the comparison",
      resolved: stage === "AI_COMPARE",
      reached: stage === "AI_COMPARE",
    },
  ];

  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li
          key={step.title}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-3.5 py-2.5",
            step.resolved
              ? "border-success/25 bg-success/5"
              : step.reached
                ? "border-border bg-muted/30"
                : "border-border/60 bg-muted/10 opacity-60",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
              step.resolved
                ? "bg-success text-success-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {step.resolved ? <IconCheck className="h-3 w-3" /> : i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---- Main view ---------------------------------------------------------------

type Mode = "file" | "stored";

interface CompareResultProps {
  initialDocAId?: string;
  initialDocBId?: string;
}

export default function CompareResultView({
  initialDocAId,
  initialDocBId,
}: CompareResultProps) {
  const { documents, isLoading: docsLoading } = useDocuments({ limit: 200 });
  const activeDocs = useMemo(
    () => documents.filter((d) => !d.deleted_at),
    [documents],
  );

  const [mode, setMode] = useState<Mode>(
    initialDocAId && initialDocBId ? "stored" : "file",
  );
  const [baselineId, setBaselineId] = useState(initialDocAId ?? "");
  const [otherDocId, setOtherDocId] = useState(initialDocBId ?? "");
  const [file, setFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [resultContext, setResultContext] = useState<{
    baselineName: string;
    candidateName: string;
  } | null>(null);

  const baselineDoc = activeDocs.find((d) => d.id === baselineId) ?? null;
  const otherDoc = activeDocs.find((d) => d.id === otherDocId) ?? null;

  const canRun =
    !isLoading &&
    !!baselineDoc &&
    (mode === "file" ? !!file : !!otherDoc && otherDocId !== baselineId);

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!canRun || !baselineDoc) return;
    setError(null);
    setResult(null);
    setIsLoading(true);
    try {
      if (mode === "file" && file) {
        const compareResult = await compareWithFile(baselineDoc.id, file);
        setResult(compareResult);
        setResultContext({ baselineName: baselineDoc.name, candidateName: file.name });
      } else if (mode === "stored" && otherDoc) {
        const compareResult = await compareDocuments(baselineDoc.id, otherDoc.id);
        setResult(compareResult);
        setResultContext({ baselineName: baselineDoc.name, candidateName: otherDoc.name });
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Comparison failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  const verdictMeta = result ? VERDICT_META[result.verdict] : null;

  return (
    <div className="space-y-5">
      {/* ---- Setup card ---- */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-elevation-1">
        {/* Mode switch */}
        <div className="inline-flex items-center rounded-xl border border-border bg-muted/40 p-0.5" role="radiogroup" aria-label="Comparison mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "file"}
            onClick={() => { setMode("file"); setResult(null); setError(null); }}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
              mode === "file"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Check a new file
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "stored"}
            onClick={() => { setMode("stored"); setResult(null); setError(null); }}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
              mode === "stored"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Compare stored documents
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {mode === "file"
            ? "Received a new version of a document? Check it against the verified baseline in your vault before you act on it."
            : "Compare two documents already stored in your vault."}
        </p>

        {/* Empty vault */}
        {!docsLoading && activeDocs.length === 0 ? (
          <div className="mt-5 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/5 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your vault is empty — upload a document first to set a baseline.
            </p>
            <Link
              href="/vault?upload=1"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-elevation-1 hover:bg-secondary/90 transition-colors"
            >
              <IconUpload className="h-4 w-4" />
              Upload document
            </Link>
          </div>
        ) : (
          <form onSubmit={handleCompare} className="mt-5 space-y-4">
            {docsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <DocPicker
                  label="Baseline (stored in your vault)"
                  documents={activeDocs}
                  value={baselineId}
                  onChange={setBaselineId}
                  excludeId={mode === "stored" ? otherDocId : undefined}
                  disabled={isLoading}
                />
                {mode === "file" ? (
                  <FileDropZone file={file} onFile={setFile} disabled={isLoading} />
                ) : (
                  <DocPicker
                    label="Compare against"
                    documents={activeDocs}
                    value={otherDocId}
                    onChange={setOtherDocId}
                    excludeId={baselineId}
                    disabled={isLoading}
                  />
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={!canRun}
              className="rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold px-6"
            >
              {isLoading ? "Comparing…" : "Run comparison"}
            </Button>
          </form>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* ---- Loading ---- */}
      {isLoading && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-elevation-1 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* ---- Result ---- */}
      {result && verdictMeta && resultContext && !isLoading && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-1">
          {/* Verdict banner */}
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={cn("rounded-md px-3 py-1 text-sm font-bold uppercase tracking-wide", verdictMeta.chip)}>
                {verdictMeta.label}
              </span>
              {result.confidence && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {result.confidence.toLowerCase()} confidence
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {verdictMeta.sub}
            </p>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            {/* What was compared */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Baseline
                </p>
                <p className="mt-1 truncate text-sm font-medium text-foreground" title={resultContext.baselineName}>
                  {resultContext.baselineName}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {mode === "file" ? "New file" : "Compared against"}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-foreground" title={resultContext.candidateName}>
                  {resultContext.candidateName}
                </p>
              </div>
            </div>

            {/* Pipeline steps */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                How this verdict was reached
              </h4>
              <PipelineSteps stage={result.stage} />
            </div>

            {/* AI Reasoning */}
            {result.reasoning && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI reasoning
                </h4>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.reasoning}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border/60 bg-muted/20 px-5 py-3 sm:px-6">
            <p className="text-xs text-muted-foreground">
              Deterministic first, AI second — exact hash checks always run
              before any AI call.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
