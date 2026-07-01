"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DocumentsRedirectPage() {
  const router = useRouter();
  const { user, isLoading } = useAuthContext();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace("/projects");
      } else {
        router.replace("/login");
      }
    }
  }, [isLoading, user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      {isLoading ? (
        <Skeleton className="h-8 w-48" />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>Redirecting to groups…</AlertDescription>
        </Alert>
      )}
    </main>
  );
}
