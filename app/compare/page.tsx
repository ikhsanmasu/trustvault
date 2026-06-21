"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import CompareResultView from "@/components/compare-result";

function ComparePageInner() {
  const searchParams = useSearchParams();
  const docA = searchParams.get("docA") ?? undefined;
  const docB = searchParams.get("docB") ?? undefined;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compare</h1>
          <p className="text-sm text-muted-foreground">
            Run the deterministic hash pipeline plus AI materiality assessment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to Documents
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Upload New
          </Link>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Pre-filled hint */}
      {docA && docB && (
        <div className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Pre-filled from document selection. You can change the IDs below.
        </div>
      )}

      <CompareResultView initialDocAId={docA} initialDocBId={docB} />
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:py-12">
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      }
    >
      <ComparePageInner />
    </Suspense>
  );
}
