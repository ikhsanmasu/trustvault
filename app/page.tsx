"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import UploadForm from "@/components/upload-form";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          TrustVault
        </h1>
        <p className="text-lg text-muted-foreground">
          Document-integrity platform. Upload, hash, compare, and assess the
          materiality of document changes.
        </p>
      </div>

      <Separator className="my-6" />

      {/* Pipeline explainer */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="mb-1 text-sm font-semibold">Step 1</div>
          <p className="text-sm text-muted-foreground">
            Upload a PDF. Binary and text hashes are computed and stored.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="mb-1 text-sm font-semibold">Step 2</div>
          <p className="text-sm text-muted-foreground">
            Compare two versions. Deterministic hash checks run first.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="mb-1 text-sm font-semibold">Step 3</div>
          <p className="text-sm text-muted-foreground">
            AI assesses whether text changes are MATERIAL or NOT MATERIAL.
          </p>
        </div>
      </div>

      {/* Upload form */}
      <UploadForm />

      <Separator className="my-8" />

      {/* Navigation footer */}
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground">
          P1 core engine — single tenant, no auth.
        </p>
        <Link
          href="/documents"
          className={buttonVariants({ variant: "outline" })}
        >
          View All Documents
        </Link>
      </div>
    </main>
  );
}
