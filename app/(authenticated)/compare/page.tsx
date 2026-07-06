"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useAuthContext } from "@/components/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CompareResultView from "@/components/compare-result";

function ComparePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  const docA = searchParams.get("docA") ?? undefined;
  const docB = searchParams.get("docB") ?? undefined;

  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to compare documents.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Compare</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Did this document change — and does the change matter? Hashes answer
          first; AI judges materiality only when the content differs.
        </p>
      </div>

      {docA && docB && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          Documents pre-selected from your vault — run the comparison below.
        </div>
      )}

      <CompareResultView initialDocAId={docA} initialDocBId={docB} />
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ComparePageInner />
    </Suspense>
  );
}
