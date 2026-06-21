"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import DocumentTable from "@/components/document-table";
import { useDocuments } from "@/hooks/use-documents";

export default function DocumentsPage() {
  const { documents, total, isLoading, error, search, setSearch, refresh } =
    useDocuments();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Browse uploaded documents, search by name, and select two to compare.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Upload New
          </Link>
          <Link
            href="/compare"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Compare by ID
          </Link>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Document table */}
      <DocumentTable
        documents={documents}
        total={total}
        isLoading={isLoading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        onRefresh={refresh}
      />
    </main>
  );
}
