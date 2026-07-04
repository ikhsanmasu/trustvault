"use client";

import { useState, useEffect } from "react";
import { useSort } from "@/hooks/use-sort";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
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
import { AgentCreateModal } from "@/components/agent-create-modal";
import { useCreateAgent } from "@/hooks/use-agents";
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

// ---- Page -------------------------------------------------------------------

type ViewMode = "table" | "grid";

export default function VaultPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { role: currentRole } = useProfile();
  const canEdit = isEditorOrAbove(currentRole);
  const { create: createAgent, isCreating: creatingAgent } = useCreateAgent();

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

  const [compareDoc, setCompareDoc] = useState<Document | null>(null);
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const [anchorDoc, setAnchorDoc] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkShareIds, setBulkShareIds] = useState<string[]>([]);
  const [bulkToast, setBulkToast] = useState<string | null>(null);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [actionDropdownDocId, setActionDropdownDocId] = useState<string | null>(null);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [docLabels, setDocLabels] = useState<Map<string, string[]>>(new Map());
  const [deleteLabelId, setDeleteLabelId] = useState<string | null>(null);
  const [showAgentCreate, setShowAgentCreate] = useState(false);
  const [agentPreselectedIds, setAgentPreselectedIds] = useState<string[]>([]);

  // Fetch labels
  useEffect(() => {
    fetch("/api/labels").then(r => r.json()).then(d => setLabels(d.labels ?? [])).catch(() => {});
  }, []);

  // Fetch document labels for visible docs
  useEffect(() => {
    if (visibleDocs.length === 0) return;
    Promise.all(visibleDocs.map(d =>
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
            </div>
          </div>
        </div>
      </section>

      {/* ---- Action bar ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Upload button - left (editor+) */}
        {canEdit && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <IconPlus className="mr-1.5 h-4 w-4" />
            Upload
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search input - right side */}
        <div className="relative w-48 sm:w-56">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <IconSearch className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <label htmlFor="vault-search" className="sr-only">Search documents</label>
          <Input
            id="vault-search"
            placeholder="Search..."
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
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/30 transition-colors whitespace-nowrap"
          >
            {selectedLabelId ? labels.find(l => l.id === selectedLabelId)?.name ?? "Label" : "Label"}
            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {labelDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-lg py-1">
              <button
                type="button"
                onClick={() => { setSelectedLabelId(""); setLabelDropdownOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                  selectedLabelId === "" && "bg-primary/10 text-primary font-medium",
                )}
              >
                <span className="h-3 w-3 rounded-full border border-border shrink-0" />
                All Labels
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

        {/* Type dropdown - right side */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setTypeDropdownOpen(!typeDropdownOpen); }}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/30 transition-colors whitespace-nowrap"
          >
            {fileType ? TYPE_FILTERS.find(f => f.value === fileType)?.label ?? "Type" : "Type"}
            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {typeDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-lg py-1">
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

      </div>

      {/* ---- Filter: Deleted ------------------------------------------------- */}
      {deletedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
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
      {bulkToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-primary text-primary-foreground px-5 py-3 text-sm font-medium shadow-lg animate-fade-in">{bulkToast}</div>
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
              : "Upload documents to start tracking their integrity over time."}
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
              className="mt-5"
              onClick={() => setShowUpload(true)}
            >
              <IconPlus className="mr-1.5 h-4 w-4" />
              Upload Documents
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
                  setBulkToast("Anchoring…");
                  for (const id of selectedIds) {
                    try { await fetch("/api/anchor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: id }) }); } catch {}
                  }
                  setBulkToast(`Anchored ${selectedIds.size} document(s)`);
                  setTimeout(() => setBulkToast(null), 3000);
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
            <Button size="sm" variant="outline" onClick={() => { setAgentPreselectedIds(Array.from(selectedIds)); setShowAgentCreate(true); }}>
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
              Create Agent
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  setBulkToast(`Deleting ${selectedIds.size} document(s)…`);
                  for (const id of selectedIds) {
                    try { await deleteDocument(id); } catch {}
                  }
                  setBulkToast(`Deleted ${selectedIds.size} document(s)`);
                  setTimeout(() => setBulkToast(null), 3000);
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
              onClick={() => { setSelectedIds(new Set()); setMoveDocId(null); }}
              className="ml-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* ---- Table view ----------------------------------------------------- */}
        <div className="rounded-2xl border bg-card shadow-elevation-1">
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
                  <th className="hidden xl:table-cell px-2 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase w-[90px]">
                    ID
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
                    Name <span className="ml-0.5">{sortIndicator("name")}</span>
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Description
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_type")}>
                    Type <span className="ml-0.5">{sortIndicator("file_type")}</span>
                  </th>
                  <th className="hidden lg:table-cell px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                    Labels
                  </th>
                  <th className="hidden xl:table-cell px-4 py-3.5 text-center text-xs font-semibold text-muted-foreground tracking-wide uppercase" style={{ width: 100 }}>
                    Status
                  </th>
                  <th className="hidden md:table-cell px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground tracking-wide uppercase cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("file_size_bytes")}>
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
                      <td className="hidden xl:table-cell px-2 py-3.5">
                        <code className="text-xs font-mono text-muted-foreground/60 select-all">
                          {doc.id.slice(0, 8)}
                        </code>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("text-sm font-medium truncate block max-w-[220px]", doc.deleted_at && "line-through text-muted-foreground/60")}>
                            {doc.name}
                          </span>
                          {doc.original_filename && doc.original_filename !== doc.name ? (
                            <span className="text-[10px] text-muted-foreground/50 truncate block max-w-[220px]" title={doc.original_filename}>
                              {doc.original_filename}
                            </span>
                          ) : !doc.original_filename ? (
                            <span className="text-[10px] text-muted-foreground/30 italic">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3.5">
                        {doc.description ? (
                          <span className="text-sm text-muted-foreground truncate block max-w-[200px]" title={doc.description}>
                            {doc.description}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">No description</span>
                        )}
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
                        {(docLabels.get(doc.id) ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground/50 italic">No label</span>
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
                      <td className="hidden xl:table-cell px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {doc.fingerprint ? (
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                              title={`Anchored on ${doc.chain ?? "blockchain"}${doc.tx_hash ? ` (${doc.tx_hash.slice(0, 10)}…)` : ""}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            </span>
                          ) : null}
                          {doc.extracted_text ? (
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                              title="Text extracted and indexed"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            </span>
                          ) : null}
                          {!doc.fingerprint && !doc.extracted_text ? (
                            <span className="text-xs text-muted-foreground/50 italic">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums">
                        {formatBytes(doc.file_size_bytes)}
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3.5 text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionDropdownDocId(actionDropdownDocId === doc.id ? null : doc.id);
                            }}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Actions"
                            aria-label={`Actions for ${doc.name}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                          {actionDropdownDocId === doc.id && (
                            <div
                              className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl border border-border bg-card shadow-lg py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Compare */}
                              <button
                                type="button"
                                onClick={() => { setActionDropdownDocId(null); setCompareDoc(doc); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                                Compare
                              </button>
                              {/* View */}
                              <button
                                type="button"
                                onClick={() => { setActionDropdownDocId(null); setViewDoc(doc); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                View
                              </button>
                              {/* Download */}
                              <a
                                href={`/api/documents/${doc.id}/file`}
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
                                    onClick={() => { setActionDropdownDocId(null); setAnchorDoc(doc); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                  >
                                    <IconShield className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                                    {doc.fingerprint ? "Anchor details" : "Anchor"}
                                  </button>
                                  {/* Share */}
                                  <button
                                    type="button"
                                    onClick={() => { setActionDropdownDocId(null); setShareDoc(doc); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                  >
                                    <IconShare className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                                    Share
                                  </button>
                                  {/* Ask AI */}
                                  <button
                                    type="button"
                                    onClick={() => { setActionDropdownDocId(null); router.push(`/assistant?docs=${doc.id}`); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    Ask AI
                                  </button>
                                  {/* Create Agent */}
                                  <button
                                    type="button"
                                    onClick={() => { setActionDropdownDocId(null); setAgentPreselectedIds([doc.id]); setShowAgentCreate(true); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
                                    Create Agent
                                  </button>
                                  {/* Edit */}
                                  <button
                                    type="button"
                                    onClick={() => { setActionDropdownDocId(null); setEditDocId(doc.id); setEditName(doc.name); setEditDesc(doc.description ?? ""); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Edit
                                  </button>
                                  {/* Delete / Restore */}
                                  <button
                                    type="button"
                                    onClick={() => { setActionDropdownDocId(null); setConfirmDelete(doc); }}
                                    className={doc.deleted_at
                                      ? "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                                      : "w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"}
                                  >
                                    {doc.deleted_at ? (
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                    ) : (
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    )}
                                    {doc.deleted_at ? "Restore" : "Delete"}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
        </>
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
      <AgentCreateModal
        open={showAgentCreate}
        onOpenChange={setShowAgentCreate}
        onSubmit={async (data) => { await createAgent(data); }}
        isSubmitting={creatingAgent}
        documents={visibleDocs}
        preselectedDocumentIds={agentPreselectedIds}
      />
      {/* ---- Edit Modal -------------------------------------------------------- */}
      {editDocId && (
        <EditDocumentModal
          docId={editDocId}
          initialName={editName}
          initialDesc={editDesc}
          onClose={() => setEditDocId(null)}
          onSaved={() => { setEditDocId(null); setToast("Document updated"); setTimeout(() => setToast(null), 3000); refresh(); }}
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
            setToast("Label deleted");
            setTimeout(() => setToast(null), 3000);
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
