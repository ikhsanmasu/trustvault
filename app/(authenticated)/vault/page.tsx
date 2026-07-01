"use client";

import { useState, useMemo } from "react";
import { useSort } from "@/hooks/use-sort";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompareModal } from "@/components/compare-modal";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { AnchorModal } from "@/components/anchor-modal";
import { ShareModal } from "@/components/share/share-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { VaultDocumentRow, getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import { useDocuments } from "@/hooks/use-documents";
import { useProjects } from "@/hooks/use-projects";
import type { Document } from "@/lib/api-client";
import { deleteDocument, restoreDocument, anchorAllDocuments } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  IconSearch,
  IconGrid,
  IconList,
  IconRefresh,
  IconPlus,
  IconFolder,
  IconShield,
} from "@/components/icons";

// ---- Type filter chips with counts -----------------------------------------

interface FilterChip {
  value: string;
  label: string;
}

const TYPE_FILTERS: FilterChip[] = [
  { value: "", label: "All" },
  { value: "application/pdf", label: "PDF" },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "XLSX" },
  { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX" },
  { value: "application/json", label: "JSON" },
  { value: "text/csv", label: "CSV" },
  { value: "text/plain", label: "TXT" },
  { value: "image/", label: "Images" },
];

// ---- Page -------------------------------------------------------------------

type ViewMode = "table" | "grid";

export default function VaultPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const {
    documents,
    total,
    isLoading: isLoadingDocs,
    error: docError,
    search,
    setSearch,
    fileType,
    setFileType,
    refresh,
  } = useDocuments({
    projectId: selectedProjectId || undefined,
    includeDeleted: true, // Default: show deleted docs (grayed out)
  });

  const [showDeleted, setShowDeleted] = useState(false);

  const { projects, isLoading: isLoadingProjects } = useProjects();

  const { sorted: sortedDocs, toggleSort, sortIndicator } = useSort(documents, "created_at", "desc");
  const visibleDocs = showDeleted ? sortedDocs : sortedDocs.filter((d: Document) => !d.deleted_at);
  const deletedCount = documents.filter((d: Document) => !!d.deleted_at).length;

  const [compareDoc, setCompareDoc] = useState<Document | null>(null);
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const [anchorDoc, setAnchorDoc] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ---- Per-type counts (from currently loaded documents) --------------------
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counts.set("", total); // "All" gets the API total
    for (const chip of TYPE_FILTERS) {
      if (chip.value === "") continue;
      const matching =
        chip.value === "image/"
          ? visibleDocs.filter((d) => d.file_type.startsWith("image/")).length
          : visibleDocs.filter((d) => d.file_type === chip.value).length;
      if (matching > 0) counts.set(chip.value, matching);
    }
    return counts;
  }, [documents, total]);

  // ---- Project lookup map ---------------------------------------------------

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  // ---- Project chips --------------------------------------------------------

  const projectChips = useMemo(() => {
    return [
      { value: "", label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ];
  }, [projects]);

  // ---- Auth gate -------------------------------------------------------------

  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Please log in to view the vault.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return <VaultSkeleton />;
  }

  const hasActiveFilters =
    search !== "" || selectedProjectId !== "" || fileType !== "";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ---- Hero Header ------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl hero-gradient mb-2">
        {/* dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        {/* gold blur blob */}
        <div
          className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
                My Vault
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
                {total.toLocaleString()} document{total !== 1 ? "s" : ""}
                {selectedProjectId ? " in project" : " across projects"}
              </h1>
              <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty">
                Manage, search, and compare your document versions with confidence.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-elevation-1" role="radiogroup" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    viewMode === "table"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  role="radio"
                  aria-checked={viewMode === "table"}
                  aria-label="List view"
                >
                  <IconList className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  role="radio"
                  aria-checked={viewMode === "grid"}
                  aria-label="Grid view"
                >
                  <IconGrid className="h-3.5 w-3.5" />
                  Grid
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                className="transition-all duration-200 rounded-xl"
                aria-label="Refresh documents"
              >
                <IconRefresh className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const r = await anchorAllDocuments();
                    setToast(`Anchored ${r.anchored} document${r.anchored !== 1 ? "s" : ""}${r.failed > 0 ? `, ${r.failed} failed` : ""}`);
                    setTimeout(() => setToast(null), 4000);
                    refresh();
                  } catch { setToast("Anchor failed"); setTimeout(() => setToast(null), 4000); }
                }}
                className="transition-all duration-200 rounded-xl"
                title="Anchor all un-anchored documents"
                aria-label="Anchor all documents"
              >
                <IconShield className="h-4 w-4 mr-1.5" />
                Anchor All
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Search bar ------------------------------------------------------- */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <IconSearch className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <label htmlFor="vault-search" className="sr-only">Search documents</label>
        <Input
          id="vault-search"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-11 pr-20 h-12 text-sm rounded-2xl border-border/80 bg-card shadow-elevation-1 focus-visible:ring-primary/30 focus-visible:border-primary/40 transition-all duration-200 placeholder:text-muted-foreground/50"
        />
        {/* Keyboard shortcut hint */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70 font-mono">
            <span className="text-[11px]">&#8984;</span>K
          </kbd>
        </div>
      </div>

      {/* ---- Filter: File types ---------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0 uppercase tracking-wider">
          Type
        </span>
        {TYPE_FILTERS.map((chip) => {
          const count = typeCounts.get(chip.value);
          const isActive = fileType === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => setFileType(chip.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground hover:shadow-sm",
              )}
              aria-pressed={isActive}
            >
              {chip.label}
              {count !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Filter: Projects ------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0 uppercase tracking-wider">
          Project
        </span>
        {isLoadingProjects ? (
          <>
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </>
        ) : (
          projectChips.map((chip) => {
            const isActive = selectedProjectId === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setSelectedProjectId(chip.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground hover:shadow-sm",
                )}
                aria-pressed={isActive}
              >
                {chip.label}
              </button>
            );
          })
        )}
      </div>

      {/* ---- Filter: Deleted ------------------------------------------------- */}
      {deletedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0 uppercase tracking-wider">Status</span>
          <button
            type="button"
            onClick={() => setShowDeleted(!showDeleted)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
              showDeleted
                ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700"
                : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground hover:shadow-sm",
            )}
          >
            {showDeleted ? "Hide deleted" : `Show deleted (${deletedCount})`}
          </button>
        </div>
      )}

      {/* ---- Error ------------------------------------------------------------ */}
      {docError && (
        <Alert variant="destructive" className="animate-fade-in" role="alert">
          <AlertDescription>{docError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="animate-fade-in" role="alert"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3 text-sm font-medium shadow-lg animate-fade-in">{toast}</div>
      )}

      {/* ---- Content: Loading | Empty | Grid | Table ------------------------- */}
      {isLoadingDocs ? (
        <DocumentListSkeleton viewMode={viewMode} />
      ) : visibleDocs.length === 0 ? (
        /* ---- Empty state --------------------------------------------------- */
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/5">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl" />
            <IconFolder className="relative h-20 w-20 text-muted-foreground/25" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {hasActiveFilters ? "No matching documents" : "Your vault is empty"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            {hasActiveFilters
              ? "Try adjusting your filters or search query to find what you are looking for."
              : "Upload documents to your projects to start tracking their integrity over time."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => {
                setSearch("");
                setFileType("");
                setSelectedProjectId("");
              }}
            >
              Clear all filters
            </Button>
          )}
          {!hasActiveFilters && (
            <Link
              href="/upload"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-elevation-1 hover:bg-primary/90 transition-colors"
            >
              Upload Documents
              <IconPlus className="h-4 w-4" />
            </Link>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ---- Grid view ------------------------------------------------------ */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleDocs.map((doc) => (
            <VaultDocumentRow
              key={doc.id}
              document={doc}
              variant="card"
              projectName={projectMap.get(doc.project_id)}
              onCompare={(d) => setCompareDoc(d)}
              onView={(d) => setViewDoc(d)}
              onShare={(d) => setShareDoc(d)}
              onAnchor={(d) => setAnchorDoc(d)}
              onDelete={(d) => setConfirmDelete(d)}
            />
          ))}
        </div>
      ) : (
        /* ---- Table view ----------------------------------------------------- */
        <div className="overflow-hidden rounded-2xl border bg-card shadow-elevation-1">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                    Name <span className="ml-0.5">{sortIndicator("name")}</span>
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_type")}>
                    Type <span className="ml-0.5">{sortIndicator("file_type")}</span>
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Project
                  </th>
                  <th className="hidden md:table-cell px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_size_bytes")}>
                    Size <span className="ml-0.5">{sortIndicator("file_size_bytes")}</span>
                  </th>
                  <th className="hidden xl:table-cell px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("created_at")}>
                    Date <span className="ml-0.5">{sortIndicator("created_at")}</span>
                  </th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase w-[80px]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map((doc) => {
                  const projName = projectMap.get(doc.project_id);
                  return (
                    <tr
                      key={doc.id}
                      className={cn(
                        "border-b border-border/50 transition-colors duration-150 hover:bg-muted/30 last:border-b-0 group",
                        doc.deleted_at && "bg-muted/20 opacity-60 dark:bg-neutral-900/30 dark:opacity-50",
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <span className={cn("text-sm font-medium truncate block max-w-[220px]", doc.deleted_at && "line-through text-muted-foreground/60")}>
                          {doc.name}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3.5">
                        <Badge
                          variant={getFileTypeVariant(doc.file_type)}
                          className="text-[10px] px-1.5 py-0 font-medium"
                        >
                          {getFileTypeLabel(doc.file_type)}
                        </Badge>
                        {doc.deleted_at && (
                          <Badge className="ml-1 text-[10px] px-1.5 py-0 font-medium bg-neutral-400/20 text-neutral-600 dark:bg-neutral-700/50 dark:text-neutral-300 border-0">Deleted</Badge>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3.5">
                        <span className="text-sm text-muted-foreground truncate block max-w-[140px]">
                          {projName ?? "—"}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => setAnchorDoc(doc)} className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors", doc.fingerprint ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950" : "text-muted-foreground hover:text-secondary hover:bg-secondary/10")} title={doc.fingerprint ? "View anchor details" : "Anchor on blockchain"} aria-label={doc.fingerprint ? `Anchor details for ${doc.name}` : `Anchor ${doc.name}`}>
                            <IconShield className="h-[15px] w-[15px]" />
                          </button>
                          <button type="button" onClick={() => setCompareDoc(doc)} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Compare" aria-label={`Compare ${doc.name}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                          </button>
                          <button type="button" onClick={() => setViewDoc(doc)} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="View" aria-label={`View ${doc.name}`}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(doc)} className={doc.deleted_at ? "inline-flex items-center justify-center h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" : "inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"} title={doc.deleted_at ? "Restore" : "Delete"} aria-label={doc.deleted_at ? `Restore ${doc.name}` : `Delete ${doc.name}`}>
                            {doc.deleted_at ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Compare Modal --------------------------------------------------- */}
      {compareDoc && (
        <CompareModal document={compareDoc} open={compareDoc !== null} onOpenChange={(open) => { if (!open) setCompareDoc(null); }} />
      )}
      {viewDoc && (
        <DocumentPreviewModal document={viewDoc} open={viewDoc !== null} onOpenChange={(open) => { if (!open) setViewDoc(null); }} />
      )}
      {anchorDoc && (
        <AnchorModal
          document={anchorDoc}
          open={anchorDoc !== null}
          onOpenChange={(open) => { if (!open) setAnchorDoc(null); }}
          onAnchored={() => { refresh(); }}
        />
      )}
      {shareDoc && (
        <ShareModal
          open={shareDoc !== null}
          onOpenChange={(open) => { if (!open) setShareDoc(null); }}
          projectId={shareDoc.project_id}
          documents={visibleDocs}
          onCreated={() => { setShareDoc(null); refresh(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={confirmDelete !== null}
          onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
          title={confirmDelete.deleted_at ? "Restore Document" : "Delete Document"}
          description={confirmDelete.deleted_at ? `Restore "${confirmDelete.name}"? The integrity hashes remain, but you will need to upload the file again.` : `Permanently delete "${confirmDelete.name}"? The file will be removed from storage. Its integrity hashes and metadata will be preserved for audit purposes. This cannot be fully undone.`}
          confirmLabel={confirmDelete.deleted_at ? "Restore" : "Delete"}
          variant={confirmDelete.deleted_at ? "default" : "destructive"}
          onConfirm={async () => {
            const d = confirmDelete;
            setConfirmDelete(null);
            try {
              if (d.deleted_at) { await restoreDocument(d.id); setToast("Document restored. You will need to re-upload the file."); } else { await deleteDocument(d.id); setToast("File deleted. Integrity hashes preserved."); }
              setTimeout(() => setToast(null), 3000);
              refresh();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Failed to update document";
              setError(message);
              setTimeout(() => setError(null), 5000);
            }
          }}
        />
      )}
    </div>
  );
}

// ---- Document List Skeleton -------------------------------------------------

function DocumentListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_v, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 border-l-4 border-l-muted">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2 mb-3" />
            <div className="border-t border-border/60 pt-3 mt-1">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="mt-3">
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3.5">
        <div className="flex gap-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_v, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-b-0">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-12 rounded-full hidden sm:block" />
          <Skeleton className="h-4 w-20 hidden lg:block" />
          <Skeleton className="h-4 w-14 hidden md:block" />
          <Skeleton className="h-4 w-32 hidden xl:block" />
          <Skeleton className="h-8 w-20 rounded-md ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ---- Initial Auth Loading Skeleton ------------------------------------------

function VaultSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Skeleton className="h-9 w-40 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-12 w-full rounded-2xl" />

      {/* Type filter chips */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-12 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-14 rounded-full" />
        <Skeleton className="h-7 w-14 rounded-full" />
      </div>

      {/* Project filter chips */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b border-border bg-muted/30 px-4 py-3.5">
          <div className="flex gap-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_v, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-b-0">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-12 rounded-full hidden sm:block" />
            <Skeleton className="h-4 w-20 hidden lg:block" />
            <Skeleton className="h-4 w-14 hidden md:block" />
            <Skeleton className="h-4 w-32 hidden xl:block" />
            <Skeleton className="h-8 w-20 rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
