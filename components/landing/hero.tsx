"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
}

/** Abstract geometric visual -- pure CSS shapes referencing design tokens. */
function GeometricVisual() {
  return (
    <div
      className="relative w-full max-w-md mx-auto aspect-square select-none"
      aria-hidden="true"
    >
      {/* Large circle -- navy */}
      <div className="absolute top-[10%] left-[5%] w-[55%] aspect-square rounded-full bg-primary/8 border border-primary/15" />
      {/* Medium circle -- gold */}
      <div className="absolute top-[25%] right-[8%] w-[40%] aspect-square rounded-full bg-secondary/12 border border-secondary/25" />
      {/* Small circle -- navy */}
      <div className="absolute bottom-[15%] left-[20%] w-[30%] aspect-square rounded-full bg-primary/6 border border-primary/10" />

      {/* Shield shape -- centerpiece */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] aspect-square">
        <svg
          viewBox="0 0 120 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <path
            d="M60 10L10 35V65C10 95 35 115 60 125C85 115 110 95 110 65V35L60 10Z"
            className="fill-primary"
            opacity="0.9"
          />
          <path
            d="M60 25L28 40V60C28 80 46 92 60 100C74 92 92 80 92 60V40L60 25Z"
            className="fill-secondary"
            opacity="0.8"
          />
          <path d="M60 40L42 48V59C42 69 50 75 60 80C70 75 78 69 78 59V48L60 40Z" className="fill-primary" />
          <path d="M53 60L57 64L67 54" className="stroke-secondary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Decorative lines */}
      <div className="absolute top-[8%] left-[50%] w-[1px] h-[20%] bg-gradient-to-b from-secondary/40 to-transparent" />
      <div className="absolute bottom-[12%] right-[30%] w-[25%] h-[1px] bg-gradient-to-r from-transparent to-primary/30" />

      {/* Small dots */}
      <div className="absolute top-[20%] right-[15%] w-2 h-2 rounded-full bg-secondary/50" />
      <div className="absolute bottom-[25%] left-[10%] w-1.5 h-1.5 rounded-full bg-primary/40" />
      <div className="absolute top-[40%] left-[12%] w-1.5 h-1.5 rounded-full bg-primary/25" />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden hero-gradient">
      {/* Subtle dot-grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      {/* Top-right gold accent blob */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-secondary/5 blur-3xl"
        aria-hidden="true"
      />

      {/* Bottom-left navy accent blob */}
      <div
        className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full bg-primary/4 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative section-container pt-20 pb-24 sm:pt-28 sm:pb-32 lg:pt-36 lg:pb-40">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-accent px-4 py-1.5 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                Intelligent Trusted Vault
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.1]">
              Store. Verify.
              <br />
              <span className="text-secondary">Understand.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Your documents deserve more than just storage. inTrustVault
              combines secure vault storage, blockchain integrity, and AI
              intelligence to protect, prove, and unlock the value of every
              document.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full sm:w-auto bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold shadow-lg shadow-secondary/10 h-12 px-8 text-base",
                )}
              >
                Get Started Free
              </Link>
              <button
                type="button"
                onClick={() => scrollTo("features")}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto border-border text-foreground hover:bg-accent h-12 px-8 text-base cursor-pointer",
                )}
              >
                See How It Works
                <svg
                  className="ml-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex items-center gap-6 justify-center lg:justify-start text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-4 w-4 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                AI-powered
              </span>
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-4 w-4 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Blockchain verified
              </span>
            </div>
          </div>

          {/* Visual */}
          <div className="hidden lg:flex items-center justify-center">
            <GeometricVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
