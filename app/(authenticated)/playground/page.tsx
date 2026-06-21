"use client";

import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

function IconPlayground() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-16 w-16 text-muted-foreground/50"
    >
      <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M12 8v2" />
      <path d="M8 12h8" />
      <path d="M5 15l3-3-3-3" />
      <path d="M19 15l-3-3 3-3" />
    </svg>
  );
}

export default function PlaygroundPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to access the playground.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
        <p className="text-sm text-muted-foreground">
          Experimental features and future capabilities
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <IconPlayground />
        <h2 className="mt-6 text-xl font-semibold">Coming Soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          RAG-powered document Q&A is coming in a future phase. Ask natural
          language questions about your documents and get AI-powered answers
          grounded in your uploaded content.
        </p>
      </div>
    </div>
  );
}
