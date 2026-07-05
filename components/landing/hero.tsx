"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/landing/reveal";

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * Product-representative mock: a verification report card showing the actual
 * pipeline output — hash comparison, then an AI materiality verdict.
 */
function VerificationReportMock() {
  return (
    <div className="relative w-full max-w-md mx-auto select-none" aria-hidden="true">
      {/* Soft glow behind the card */}
      <div className="absolute -inset-10 rounded-[2.5rem] bg-gradient-to-br from-primary/15 via-transparent to-secondary/15 blur-3xl" />

      {/* Depth layer behind the card */}
      <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-[2deg] rounded-2xl border border-border/60 bg-card/50" />

      {/* Report card */}
      <div className="relative rotate-[-1deg] rounded-2xl border border-border bg-card shadow-elevation-4 overflow-hidden transition-transform duration-500 hover:rotate-0">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/40" />
          <span className="ml-3 font-hash text-[10px] text-muted-foreground/70">
            intrustvault — verification report
          </span>
        </div>

        {/* Card header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <svg className="h-[18px] w-[18px]" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Service_Agreement_v4.pdf
            </p>
            <p className="text-xs text-muted-foreground">
              Compared against verified baseline · v3
            </p>
          </div>
        </div>

        {/* Deterministic checks */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Binary hash</p>
              <p className="font-hash text-[11px] text-muted-foreground truncate">
                9f2c…41a7 → 4e77…8bd0
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
              Changed
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Extracted text hash</p>
              <p className="font-hash text-[11px] text-muted-foreground truncate">
                c1d8…03be → 77aa…f412
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
              Changed
            </span>
          </div>
        </div>

        {/* AI verdict */}
        <div className="border-t border-border bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive">
              Material
            </span>
            <span className="text-xs text-muted-foreground">
              AI assessment · 94% confidence
            </span>
          </div>
          <p className="mt-3 border-l-2 border-destructive/40 pl-3 text-[13px] leading-relaxed text-foreground">
            Clause 4.2 — payment amount changed from{" "}
            <span className="font-hash">$250,000</span> to{" "}
            <span className="font-hash">$2,500,000</span>. Financial obligation
            altered.
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="h-3.5 w-3.5 text-success" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            3 cosmetic changes ignored — re-saved metadata, footer date, line wrap
          </p>
        </div>
      </div>

      {/* Floating chip: on-chain anchor */}
      <div className="absolute -top-5 -right-3 sm:-right-8 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-elevation-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-foreground">Anchored on-chain</p>
            <p className="font-hash text-[10px] text-muted-foreground">tx 0x8a3f…c2e1</p>
          </div>
        </div>
      </div>

      {/* Floating chip: verified baseline */}
      <div className="absolute -bottom-5 -left-3 sm:-left-8 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-elevation-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
            <svg className="h-3.5 w-3.5" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-foreground">Baseline verified</p>
            <p className="text-[10px] text-muted-foreground">v3 · 12 Jun 2026</p>
          </div>
        </div>
      </div>
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

      <div className="relative section-container pt-16 pb-24 sm:pt-24 sm:pb-28 lg:pt-28 lg:pb-36">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-20 items-center">
          {/* Text content */}
          <Reveal className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 mb-7 shadow-elevation-1">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Deterministic hashing + AI judgment
              </span>
            </div>

            <h1 className="font-display text-[2.6rem] sm:text-6xl lg:text-[4rem] font-semibold tracking-tight text-foreground leading-[1.05] text-balance">
              Know when a document change{" "}
              <em className="text-secondary">actually matters</em>
            </h1>

            <p className="mt-7 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Any tool can tell you a file changed. InTrustVault tells you
              whether the change is <strong className="font-semibold text-foreground">material</strong> —
              a shifted payment amount, an altered obligation — or just cosmetic
              noise. With cryptographic proof behind every verdict.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "w-full sm:w-auto rounded-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold shadow-lg shadow-secondary/25 h-12 px-8 text-base",
                )}
              >
                Start verifying free
              </Link>
              <button
                type="button"
                onClick={() => scrollTo("how-it-works")}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full sm:w-auto rounded-full border-border text-foreground hover:bg-accent h-12 px-8 text-base cursor-pointer",
                )}
              >
                See how it works
                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Honest trust indicators */}
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 justify-center lg:justify-start text-sm text-muted-foreground">
              {[
                "Free plan — no credit card",
                "Tamper-evident, on-chain proofs",
                "Verdicts backed by cited evidence",
              ].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Visual: product-representative verification report */}
          <Reveal delay={150} className="hidden md:flex items-center justify-center lg:justify-end px-4">
            <VerificationReportMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
