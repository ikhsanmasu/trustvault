"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CompareModal } from "@/components/compare-modal";
import { VaultDocumentRow } from "@/components/vault-document-row";
import { useDocuments } from "@/hooks/use-documents";
import { useProjects } from "@/hooks/use-projects";
import type { Document } from "@/lib/api-client";

// ---- File type filter options -----------------------------------------------

const FILE_TYPE_OPTIONS = [
  { value: "", label: "All file types" },
  { value: "application/pdf", label: "PDF" },
  {
    value:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  {
    value:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
  { value: "application/json", label: "JSON" },
  { value: "text/csv", label: "CSV" },
  { value: "text/plain", label: "TXT" },
  { value: "text/html", label: "HTML" },
  { value: "text/markdown", label: "Markdown" },
  { value: "image/", label: "Images (PNG, JPEG, WEBP)" },
];

// ---- Page -------------------------------------------------------------------

export default function VaultPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedFileType, setSelectedFileType] = useState("");

  const {
    documents,
    total,
    isLoading: isLoadingDocs,
    error: docError,
    search,
    setSearch,
    refresh,
  } = useDocuments({
    projectId: selectedProjectId || undefined,
    fileType: selectedFileType || undefined,
  });

  const {
    projects,
    isLoading: isLoadingProjects,
  } = useProjects();

  const [compareDoc, setCompareDoc] = useState<Document | null>(null);

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to view the vault.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Vault</h1>
          <p className="text-sm text-muted-foreground">
            {total} document{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          placeholder="All projects"
          options={[
            { value: "", label: "All projects" },
            ...(isLoadingProjects
              ? [{ value: "", label: "Loading…" }]
              : projects.map((p) => ({ value: p.id, label: p.name }))),
          ]}
          className="sm:max-w-[200px]"
        />
        <Select
          value={selectedFileType}
          onChange={(e) => setSelectedFileType(e.target.value)}
          options={FILE_TYPE_OPTIONS}
          className="sm:max-w-[200px]"
        />
      </div>

      {/* Error */}
      {docError && (
        <Alert variant="destructive">
          <AlertDescription>{docError}</AlertDescription>
        </Alert>
      )}

      {/* Document list */}
      {isLoadingDocs ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search || selectedProjectId || selectedFileType
              ? "Try adjusting your filters."
              : "Upload documents to your projects to see them here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <VaultDocumentRow
              key={doc.id}
              document={doc}
              projectName={
                projects.find((p) => p.id === doc.project_id)?.name
              }
              onCompare={(d) => setCompareDoc(d)}
            />
          ))}
        </div>
      )}

      {/* Compare Modal */}
      {compareDoc && (
        <CompareModal
          document={compareDoc}
          open={compareDoc !== null}
          onOpenChange={(open) => {
            if (!open) setCompareDoc(null);
          }}
        />
      )}
    </div>
  );
}
