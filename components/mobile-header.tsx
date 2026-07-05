"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconBrand, IconHamburger } from "@/components/icons";

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-4",
        "lg:hidden", // Only show on mobile
      )}
    >
      {/* Hamburger button */}
      <button
        type="button"
        onClick={onMenuToggle}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
        aria-label="Toggle navigation menu"
      >
        <IconHamburger className="h-5 w-5" />
      </button>

      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
        aria-label="InTrustVault Dashboard"
      >
        <IconBrand className="h-7 w-7 shrink-0" />
        <span className="text-sm">InTrustVault</span>
      </Link>

      {/* Spacer to push anything on the right */}
      <div className="flex-1" />
    </header>
  );
}
