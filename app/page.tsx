"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setIsAuthenticated(true);
        router.push("/dashboard");
      } else {
        setIsAuthenticated(false);
        setIsChecking(false);
      }
    });
  }, [router]);

  // Redirect authenticated users to dashboard
  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </main>
    );
  }

  // Show loading while checking
  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        TrustVault
      </h1>

      <p className="mt-4 max-w-xl text-center text-lg text-muted-foreground">
        A multi-tenant document-integrity platform. Upload PDFs, DOCX,
        spreadsheets, images, and more. Compare versions and let AI
        assess whether changes are MATERIAL or NOT MATERIAL.
      </p>

      <div className="mt-10 flex items-center gap-4">
        <Link href="/register">
          <Button size="lg">Get Started</Button>
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Sign In
        </Link>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Step 1</div>
          <p className="text-sm text-muted-foreground">
            Create a project and upload documents. Supported formats
            include PDF, DOCX, XLSX, JSON, CSV, images, and more.
          </p>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Step 2</div>
          <p className="text-sm text-muted-foreground">
            Compare a stored document against a new upload.
            Deterministic hash checks detect identical or purely
            binary-different files before AI is involved.
          </p>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Step 3</div>
          <p className="text-sm text-muted-foreground">
            AI assesses whether text changes are MATERIAL or
            NOT MATERIAL, providing reasoning and a confidence
            level for every comparison.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Dashboard</div>
          <p className="text-sm text-muted-foreground">
            See total documents, recent uploads, project counts, and
            storage usage at a glance on your personal dashboard.
          </p>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Bulk Upload</div>
          <p className="text-sm text-muted-foreground">
            Upload up to 10 files at once. Each file is processed
            independently with individual results -- any supported
            format, mixed in a single batch.
          </p>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm font-semibold">Multi-Tenant</div>
          <p className="text-sm text-muted-foreground">
            Row-level security ensures each tenant&apos;s data is
            isolated. Role-based access at the project level with
            admin, editor, and viewer roles.
          </p>
        </div>
      </div>
    </main>
  );
}
