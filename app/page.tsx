import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TrustVault — P2",
  description:
    "Multi-tenant document-integrity platform — P2 adds auth, projects, and role-based access control.",
};

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">TrustVault</h1>

      <p className="mt-4 text-center text-lg text-muted-foreground">
        Document-integrity platform — multi-tenant, with authentication,
        projects, and role-based access control.
      </p>

      <p className="mt-2 text-sm text-muted-foreground">P2 milestone.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
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
    </main>
  );
}
