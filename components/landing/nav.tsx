"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IconBrand } from "@/components/icons";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "bg-background/90 backdrop-blur-md shadow-elevation-1 border-b border-border"
          : "bg-transparent",
      )}
    >
      <div className="section-container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 select-none">
          <IconBrand className="h-8 w-8 shrink-0" />
          <span className="text-xl font-bold tracking-tight text-foreground">
            TrustVault
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          <button
            type="button"
            onClick={() => scrollTo("features")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => scrollTo("how-it-works")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => scrollTo("use-cases")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Use Cases
          </button>
          <button
            type="button"
            onClick={() => scrollTo("current-usage")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Current Usage
          </button>
        </div>

        {/* CTA buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden sm:inline-flex border-border hover:bg-accent",
            )}
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "shadow-sm",
            )}
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
