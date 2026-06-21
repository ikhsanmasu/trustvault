"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Skeleton } from "@/components/ui/skeleton";
import { LandingNav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { UseCases } from "@/components/landing/use-cases";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          setIsAuthenticated(true);
          router.push("/dashboard");
        } else {
          setIsAuthenticated(false);
          setIsChecking(false);
        }
      } catch {
        // If Supabase is unreachable (offline dev), show the landing page.
        if (!cancelled) {
          setIsAuthenticated(false);
          setIsChecking(false);
        }
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // While redirecting authenticated users, show a minimal loading state.
  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-8 w-48" />
      </main>
    );
  }

  // While checking auth, show a minimal loading state.
  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-8 w-48" />
      </main>
    );
  }

  // Unauthenticated visitor — render the full landing page.
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <Hero />
      <Features />
      <HowItWorks />
      <UseCases />
      <CTA />
      <Footer />
    </div>
  );
}
