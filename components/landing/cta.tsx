import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CTA() {
  return (
    <section className="relative bg-background py-20 sm:py-28">
      {/* Decorative top gradient line */}
      <div
        className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent"
        aria-hidden="true"
      />

      <div className="section-container">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 sm:px-12 sm:py-20 lg:px-16">
          {/* Decorative elements */}
          <div
            className="absolute top-0 right-0 w-64 h-64 rounded-full bg-secondary/8 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/[0.03] blur-3xl"
            aria-hidden="true"
          />

          {/* Gold accent corner lines */}
          <div
            className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 border-secondary/20 rounded-tl-2xl"
            aria-hidden="true"
          />
          <div
            className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 border-secondary/20 rounded-br-2xl"
            aria-hidden="true"
          />

          <div className="relative text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-primary-foreground leading-[1.15]">
              AI-powered integrity. Blockchain trust.
            </h2>
            <p className="mt-5 text-lg text-primary-foreground/65 leading-relaxed max-w-lg mx-auto">
              Your documents deserve more than just storage. Get intelligent
              insights, cryptographic verification, and AI agents that work
              where your team does. Start free — no credit card required.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full sm:w-auto bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold shadow-xl shadow-secondary/10 h-12 px-8 text-base",
                )}
              >
                Get Started Free
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20 hover:border-primary-foreground/50 h-12 px-8 text-base font-medium",
                )}
              >
                Sign In
              </Link>
            </div>

            {/* Trust note */}
            <p className="mt-8 text-sm text-primary-foreground/40">
              Built on blockchain. Powered by AI. Trusted by teams.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
