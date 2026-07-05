"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useAuthContext } from "@/components/auth-provider";
import { Separator } from "@/components/ui/separator";
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
          Run the deterministic hash pipeline plus AI materiality assessment.
        </p>
      </div>

      <Separator className="mb-6" />

      {docA && docB && (
        <div className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Pre-filled from document selection. Documents must be in the same
          workspace for comparison to succeed.
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
