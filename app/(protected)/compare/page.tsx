"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { useAuthContext } from "@/components/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const projectId = searchParams.get("projectId") ?? undefined;

  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to compare documents.</AlertDescription>
        </Alert>
      </main>
    );
  }

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
          {projectId ? (
            <Link
              href={`/projects/${projectId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to Project
            </Link>
          ) : (
            <Link
              href="/projects"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Projects
            </Link>
          )}
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Home
          </Link>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Context hints */}
      {projectId && (
        <div className="mb-4 rounded-md border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Comparing documents within project{" "}
            <Badge variant="secondary" className="font-mono text-xs">
              {projectId.slice(0, 8)}…
            </Badge>
          </p>
        </div>
      )}

      {docA && docB && (
        <div className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Pre-filled from document selection. Documents must be in the same
          project for comparison to succeed.
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
