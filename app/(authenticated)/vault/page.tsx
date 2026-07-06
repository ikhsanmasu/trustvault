"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSort } from "@/hooks/use-sort";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { useToast } from "@/components/toast-provider";
import { useProfile, isEditorOrAbove } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompareModal } from "@/components/compare-modal";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { AnchorModal } from "@/components/anchor-modal";
import { ShareModal } from "@/components/share/share-modal";
import { UploadModal } from "@/components/upload-modal";
import { EditDocumentModal } from "@/components/edit-document-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { VaultDocumentRow, getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import { useDocuments } from "@/hooks/use-documents";
import type { Document } from "@/lib/api-client";
import { deleteDocument, restoreDocument } from "@/lib/api-client";
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
  IconShare,
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

// ---- Integrity chip -----------------------------------------------------------

function IntegrityChip({ doc }: { doc: Document }) {
  if (doc.fingerprint) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground dark:text-secondary"
        title={`Anchored on ${doc.chain ?? "blockchain"}${doc.tx_hash ? ` (${doc.tx_hash.slice(0, 10)}…)` : ""}`}
      >
        <IconShield className="h-3 w-3" />
        Anchored
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      title="Cryptographic fingerprint computed; not yet anchored on-chain"
    >
      Hashed
    </span>
  );
}

// ---- Page -------------------------------------------------------------------

type ViewMode = "table" | "grid";

export default function VaultPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { role: currentRole } = useProfile();
  const canEdit = isEditorOrAbove(currentRole);

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
    includeDeleted: true, // Default: show deleted docs (grayed out)
  });

  const [showDeleted, setShowDeleted] = useState(false);

  const { sorted: sortedDocs, toggleSort, sortIndicator } = useSort(documents, "created_at", "desc");
  const visibleDocs = showDeleted ? sortedDocs : sortedDocs.filter((d: Document) => !d.deleted_at);
  const deletedCount = documents.filter((d: Document) => !!d.deleted_at).length;
  const anchoredCount = documents.filter((d: Document) => !!d.fingerprint && !d.deleted_at).length;

  const [compareDoc, setCompareDoc] = useState<Document | null>(null);
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const [anchorDoc, setAnchorDoc] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);

  // Deep link: /vault?upload=1 opens the upload modal directly (used by the
  // dashboard quick action and the /upload redirect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upload") === "1") setShowUpload(true);
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkShareIds, setBulkShareIds] = useState<string[]>([]);
  const [actionDropdownDocId, setActionDropdownDocId] = useState<string | null>(null);
  // Fixed-position coords for the row-actions menu. Rendered through a portal
  // so the table's overflow container cannot clip it.
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [docLabels, setDocLabels] = useState<Map<string, string[]>>(new Map());
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);

  // Fetch labels
  useEffect(() => {
    fetch("/api/labels").then(r => r.json()).then(d => setLabels(d.labels ?? [])).catch(() => {});
  }, []);

  // Fetch document labels. Keyed on the fetched document list (stable per
  // fetch) rather than the sorted/filtered view, which is a new array every
  // render and would refire this effect continuously.
  useEffect(() => {
    if (documents.length === 0) return;
    Promise.all(documents.map(d =>
      fetch(`/api/documents/${d.id}/labels`).then(r => r.json()).then(data => ({ docId: d.id, labels: data.labels as { id: string }[] })).catch(() => ({ docId: d.id, labels: [] }))
    )).then(results => {
      const map = new Map<string, string[]>();
      results.forEach(r => map.set(r.docId, r.labels.map(l => l.id)));
      setDocLabels(map);
    });
  }, [documents]);


  // Filter by label
  const labelFilteredDocs = selectedLabelId
    ? visibleDocs.filter(d => (docLabels.get(d.id) ?? []).includes(selectedLabelId))
    : visibleDocs;

  // Click outside to close dropdowns
  useEffect(() => {
    if (!typeDropdownOpen && !labelDropdownOpen && !actionDropdownDocId) return;
    function handleClick() { setTypeDropdownOpen(false); setLabelDropdownOpen(false); setActionDropdownDocId(null); }
    document.addEventListener("click", handleClick, { once: true });
    return () => document.removeEventListener("click", handleClick);
  }, [typeDropdownOpen, labelDropdownOpen, actionDropdownDocId]);

  // The row-actions menu is fixed-positioned: close it when the page scrolls
  // or resizes so it never floats detached from its row.
  useEffect(() => {
    if (!actionDropdownDocId) return;
    function close() { setActionDropdownDocId(null); }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [actionDropdownDocId]);

  function openActionMenu(e: React.MouseEvent<HTMLButtonElement>, docId: string) {
    e.stopPropagation();
    if (actionDropdownDocId === docId) {
      setActionDropdownDocId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 192; // w-48
    const estHeight = canEdit ? 320 : 132;
    const gap = 4;
    const top =
      window.innerHeight - rect.bottom >= estHeight + gap
        ? rect.bottom + gap
        : Math.max(8, rect.top - estHeight - gap);
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setActionMenuPos({ top, left });
    setActionDropdownDocId(docId);
  }

  const actionMenuDoc = actionDropdownDocId
    ? documents.find((d: Document) => d.id === actionDropdownDocId) ?? null
    : null;

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
    search !== "" || fileType !== "" || selectedLabelId !== "";

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ---- Header: title + primary actions --------------------------------- */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Vault
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString()} document{total !== 1 ? "s" : ""}
            {anchoredCount > 0 && (
              <>
                {" "}· {anchoredCount.toLocaleString()} anchored on-chain
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setShowUpload(true)}
              className="rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold shadow-elevation-1"
            >
              <IconPlus className="mr-1.5 h-4 w-4" />
              Upload
            </Button>
          )}

          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-elevation-1" role="radiogroup" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                viewMode === "table"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="radio"
              aria-checked={viewMode === "table"}
              aria-label="List view"
              title="List view"
            >
              <IconList className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              role="radio"
              aria-checked={viewMode === "grid"}
              aria-label="Grid view"
              title="Grid view"
            >
              <IconGrid className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-elevation-1 transition-all hover:border-secondary/40 hover:text-foreground"
            aria-label="Refresh documents"
            title="Refresh"
          >
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ---- Toolbar: search + filters (single row) --------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <IconSearch className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <label htmlFor="vault-search" className="sr-only">Search documents</label>
          <Input
            id="vault-search"
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm rounded-xl border-border/80 bg-card shadow-elevation-1 focus-visible:ring-primary/30 focus-visible:border-primary/40 transition-all duration-200 placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Label dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLabelDropdownOpen(!labelDropdownOpen)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium transition-colors whitespace-nowrap shadow-elevation-1",
              selectedLabelId
                ? "border-primary/40 text-primary"
                : "border-border text-foreground hover:border-primary/30",
            )}
          >
            {selectedLabelId ? labels.find(l => l.id === selectedLabelId)?.name ?? "Label" : "Label"}
            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {labelDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-elevation-3 py-1">
              <button
                type="button"
                onClick={() => { setSelectedLabelId(""); setLabelDropdownOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                  selectedLabelId === "" && "bg-primary/10 text-primary font-medium",
                )}
              >
                <span className="h-3 w-3 rounded-full border border-border shrink-0" />
                All labels
              </button>
              {labels.map((label) => (
                <div key={label.id} className="flex items-center hover:bg-muted transition-colors">
                  <button
                    type="button"
                    onClick={() => { setSelectedLabelId(label.id); setLabelDropdownOpen(false); }}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-2 text-sm text-left",
                      selectedLabelId === label.id && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                    {label.name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteLabelId(label.id); setLabelDropdownOpen(false); }}
                    className="shrink-0 px-2 py-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                    title={`Delete label ${label.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Type dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setTypeDropdownOpen(!typeDropdownOpen); }}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium transition-colors whitespace-nowrap shadow-elevation-1",
              fileType
                ? "border-primary/40 text-primary"
                : "border-border text-foreground hover:border-primary/30",
            )}
          >
            {fileType ? TYPE_FILTERS.find(f => f.value === fileType)?.label ?? "Type" : "Type"}
            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-elevation-3 py-1">
              {TYPE_FILTERS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => { setFileType(chip.value); setTypeDropdownOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                    fileType === chip.value && "bg-primary/10 text-primary font-medium",
                  )}
                >
                  <span className={cn("h-3 w-3 rounded border border-border flex items-center justify-center shrink-0",
                    fileType === chip.value && "bg-primary border-primary",
                  )}>
                    {fileType === chip.value && (
                      <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </span>
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Deleted toggle */}
        {deletedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDeleted(!showDeleted)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all duration-200 whitespace-nowrap shadow-elevation-1",
              showDeleted
                ? "border-warning/40 bg-warning/10 text-warning"
                : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground",
            )}
          >
            {showDeleted ? "Hide deleted" : `Deleted (${deletedCount})`}
          </button>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFileType(""); setSelectedLabelId(""); }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ---- Error ------------------------------------------------------------ */}
      {docError && (
        <Alert variant="destructive" className="animate-fade-in" role="alert">
          <AlertDescription>{docError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="animate-fade-in" role="alert"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {/* ---- Content: Loading | Empty | Grid | Table ------------------------- */}
      {isLoadingDocs ? (
        <DocumentListSkeleton viewMode={viewMode} />
      ) : labelFilteredDocs.length === 0 ? (
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
              : "Upload a document to set your first verified baseline and start tracking integrity over time."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => {
                setSearch("");
                setFileType("");
                setSelectedLabelId("");
              }}
            >
              Clear all filters
            </Button>
          )}
          {!hasActiveFilters && canEdit && (
            <Button
              size="sm"
              className="mt-5 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold"
              onClick={() => setShowUpload(true)}
            >
              <IconPlus className="mr-1.5 h-4 w-4" />
              Upload documents
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ---- Grid view ------------------------------------------------------ */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {labelFilteredDocs.map((doc) => (
            <VaultDocumentRow
              key={doc.id}
              document={doc}
              variant="card"
              labels={labels.filter(l => (docLabels.get(doc.id) ?? []).includes(l.id))}
              onCompare={(d) => setCompareDoc(d)}
              onView={(d) => setViewDoc(d)}
              onShare={canEdit ? (d) => setShareDoc(d) : undefined}
              onAnchor={canEdit ? (d) => setAnchorDoc(d) : undefined}
              onDelete={canEdit ? (d) => setConfirmDelete(d) : undefined}
            />
          ))}
        </div>
      ) : (
        <>
        {/* ---- Bulk action bar ------------------------------------------------ */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
            <span className="text-sm font-medium text-primary mr-2">
              {selectedIds.size} selected
            </span>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  toast.info("Anchoring…");
                  for (const id of selectedIds) {
                    try { await fetch("/api/anchor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: id }) }); } catch {}
                  }
                  toast.success(`Anchored ${selectedIds.size} document(s)`);
                  setSelectedIds(new Set());
                  refresh();
                }}
              >
                <IconShield className="h-4 w-4 mr-1.5" /> Anchor
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  setBulkShareIds(ids);
                  const firstDoc = visibleDocs.find(d => ids.includes(d.id));
                  if (firstDoc) setShareDoc(firstDoc);
                }}
              >
                <IconShare className="h-4 w-4 mr-1.5" /> Share
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => {
              const ids = Array.from(selectedIds);
              router.push(ids.length > 0 ? `/assistant?docs=${ids.join(",")}` : "/assistant");
            }}>
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Ask AI
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  toast.info(`Deleting ${selectedIds.size} document(s)…`);
                  for (const id of selectedIds) {
                    try { await deleteDocument(id); } catch {}
                  }
                  toast.success(`Deleted ${selectedIds.size} document(s)`);
                  setSelectedIds(new Set());
                  refresh();
                }}
              >
                <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </Button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* ---- Table view ----------------------------------------------------- */}
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-elevation-1">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-3 py-3.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      checked={labelFilteredDocs.length > 0 && selectedIds.size === labelFilteredDocs.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(labelFilteredDocs.map(d => d.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                    Name <span className="ml-0.5">{sortIndicator("name")}</span>
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_type")}>
                    Type <span className="ml-0.5">{sortIndicator("file_type")}</span>
                  </th>
                  <th className="hidden md:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Integrity
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Labels
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_size_bytes")}>
                    Size <span className="ml-0.5">{sortIndicator("file_size_bytes")}</span>
                  </th>
                  <th className="hidden xl:table-cell px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("created_at")}>
                    Date <span className="ml-0.5">{sortIndicator("created_at")}</span>
                  </th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {labelFilteredDocs.map((doc) => {
                  return (
                    <tr
                      key={doc.id}
                      className={cn(
                        "border-b border-border/50 transition-colors duration-150 hover:bg-muted/30 last:border-b-0 group",
                        doc.deleted_at && "bg-muted/20 opacity-60 dark:bg-neutral-900/30 dark:opacity-50",
                      )}
                    >
                      <td className="w-10 px-3 py-3.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          checked={selectedIds.has(doc.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(doc.id)) next.delete(doc.id);
                            else next.add(doc.id);
                            setSelectedIds(next);
                          }}
                          aria-label={`Select ${doc.name}`}
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-sm font-medium truncate block max-w-[260px]", doc.deleted_at && "line-through text-muted-foreground/60")} title={doc.description ?? undefined}>
                            {doc.name}
                          </span>
                          {doc.original_filename && doc.original_filename !== doc.name && (
                            <span className="text-[10px] text-muted-foreground/50 truncate block max-w-[260px]" title={doc.original_filename}>
                              {doc.original_filename}
                            </span>
                          )}
                        </div>
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
                      <td className="hidden md:table-cell px-4 py-3.5">
                        <IntegrityChip doc={doc} />
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3.5">
                        {(docLabels.get(doc.id) ?? []).length === 0 ? (
                          <span className="text-muted-foreground/40">–</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(docLabels.get(doc.id) ?? []).map((labelId) => {
                              const label = labels.find(l => l.id === labelId);
                              if (!label) return null;
                              return (
                                <span key={labelId} className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: label.color }}>
                                  {label.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => openActionMenu(e, doc.id)}
                          className={cn(
                            "inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                            actionDropdownDocId === doc.id && "bg-muted text-foreground",
                          )}
                          title="Actions"
                          aria-label={`Actions for ${doc.name}`}
                          aria-expanded={actionDropdownDocId === doc.id}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
        </>
      )}

      {/* ---- Row actions menu (portal — escapes the table overflow box) ------ */}
      {actionMenuDoc && actionMenuPos && createPortal(
        <div
          style={{ position: "fixed", top: actionMenuPos.top, left: actionMenuPos.left }}
          className="z-50 w-48 rounded-xl border border-border bg-card shadow-elevation-3 py-1"
          onClick={(e) => e.stopPropagation()}
          role="menu"
          aria-label={`Actions for ${actionMenuDoc.name}`}
        >
          {/* Compare */}
          <button
            type="button"
            onClick={() => { setActionDropdownDocId(null); setCompareDoc(actionMenuDoc); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Compare
          </button>
          {/* View */}
          <button
            type="button"
            onClick={() => { setActionDropdownDocId(null); setViewDoc(actionMenuDoc); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            View
          </button>
          {/* Download */}
          <a
            href={`/api/documents/${actionMenuDoc.id}/file`}
            download
            onClick={() => setActionDropdownDocId(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </a>
          {/* Editor+ actions (separated by divider) */}
          {canEdit && (
            <>
              <div className="my-1 border-t border-border" />
              {/* Anchor / Anchor details */}
              <button
                type="button"
                onClick={() => { setActionDropdownDocId(null); setAnchorDoc(actionMenuDoc); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              >
                <IconShield className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                {actionMenuDoc.fingerprint ? "Anchor details" : "Anchor"}
              </button>
              {/* Share */}
              <button
                type="button"
                onClick={() => { setActionDropdownDocId(null); setShareDoc(actionMenuDoc); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              >
                <IconShare className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                Share
              </button>
              {/* Ask AI */}
              <button
                type="button"
                onClick={() => { setActionDropdownDocId(null); router.push(`/assistant?docs=${actionMenuDoc.id}`); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Ask AI
              </button>
              {/* Edit */}
              <button
                type="button"
                onClick={() => { setActionDropdownDocId(null); setEditDocId(actionMenuDoc.id); setEditName(actionMenuDoc.name); setEditDesc(actionMenuDoc.description ?? ""); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              {/* Delete / Restore */}
              <button
                type="button"
                onClick={() => { setActionDropdownDocId(null); setConfirmDelete(actionMenuDoc); }}
                className={actionMenuDoc.deleted_at
                  ? "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-success hover:bg-success/10 transition-colors"
                  : "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"}
              >
                {actionMenuDoc.deleted_at ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                )}
                {actionMenuDoc.deleted_at ? "Restore" : "Delete"}
              </button>
            </>
          )}
        </div>,
        document.body,
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
          onOpenChange={(open) => { if (!open) { setShareDoc(null); setBulkShareIds([]); } }}

          documents={visibleDocs}
          preselectedIds={bulkShareIds.length > 0 ? bulkShareIds : [shareDoc.id]}
          onCreated={() => { setBulkShareIds([]); setSelectedIds(new Set()); refresh(); }}
        />
      )}
      <UploadModal
        open={showUpload}
        onOpenChange={setShowUpload}
        onSuccess={() => { setShowUpload(false); refresh(); }}
      />
      {/* ---- Edit Modal -------------------------------------------------------- */}
      {editDocId && (
        <EditDocumentModal
          docId={editDocId}
          initialName={editName}
          initialDesc={editDesc}
          onClose={() => setEditDocId(null)}
          onSaved={() => { setEditDocId(null); toast.success("Document updated"); refresh(); }}
        />
      )}
      {/* ---- Label delete confirmation --------------------------------------- */}
      {deleteLabelId && (
        <ConfirmDialog
          open={deleteLabelId !== null}
          onOpenChange={(open) => { if (!open) setDeleteLabelId(null); }}
          title="Delete Label"
          description={`Are you sure you want to delete the label "${labels.find(l => l.id === deleteLabelId)?.name ?? ""}"? This will remove it from all documents.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={async () => {
            const id = deleteLabelId;
            setDeleteLabelId(null);
            await fetch(`/api/labels?id=${id}`, { method: "DELETE" });
            setLabels(prev => prev.filter(l => l.id !== id));
            toast.success("Label deleted");
          }}
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
              if (d.deleted_at) { await restoreDocument(d.id); toast.warning("Document restored. You will need to re-upload the file."); } else { await deleteDocument(d.id); toast.success("File deleted. Integrity hashes preserved."); }
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
          <div key={i} className="rounded-2xl border bg-card p-4">
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
    <div className="overflow-hidden rounded-2xl border bg-card">
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
    <div className="space-y-5 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="hidden sm:flex gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-[76px] rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 max-w-md rounded-xl" />
        <Skeleton className="h-9 w-20 rounded-xl" />
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-2xl border bg-card">
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
