"use client";

import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconSearch,
  IconSparkle,
} from "@/components/icons";

// Feature preview card
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25">
      {/* Gold accent line on hover */}
      <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary group-hover:bg-secondary/10 group-hover:text-secondary transition-colors duration-300 mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function UploadPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Please log in to access the upload page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl hero-gradient mb-2">
        {/* dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        {/* gold blur blob */}
        <div
          className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-6 py-10 sm:py-12">
          <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
            Upload
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
            Coming Soon
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty">
            RAG-powered document Q&A is on the roadmap. Ask natural language
            questions about your documents and get AI-powered answers grounded
            in your uploaded content.
          </p>
        </div>
      </section>

      {/* Feature previews */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Planned Features</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<IconSparkle className="h-4 w-4" />}
            title="Document Q&A"
            description="Ask natural language questions about any document or across your entire project. AI answers grounded in your content, not its training data."
          />
          <FeatureCard
            icon={<IconSearch className="h-4 w-4" />}
            title="Semantic Search"
            description="Find documents by meaning, not just keywords. Search across projects to discover related content even when you don't know the exact terms."
          />
          <FeatureCard
            icon={<IconSparkle className="h-4 w-4" />}
            title="Smart Summaries"
            description="Auto-generate executive summaries of lengthy documents. Compare summaries across versions to quickly spot what changed."
          />
        </div>
      </div>

      {/* Status */}
      <div className="rounded-2xl border bg-muted/20 p-5 flex items-center gap-3">
        <div className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" role="status" aria-label="In development" />
        <p className="text-sm text-muted-foreground">
          These features are planned for a future phase. Check the roadmap for timing.
        </p>
      </div>
    </div>
  );
}
