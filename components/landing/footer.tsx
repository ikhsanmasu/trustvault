import Link from "next/link";
import { IconBrand } from "@/components/icons";

const footerLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Sign In", href: "/login" },
  { label: "Get Started", href: "/register" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="section-container py-10 sm:py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo + copyright */}
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-2">
              <IconBrand className="h-6 w-6 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                inTrustVault
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your Intelligent Document Vault
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground/70">
            &copy; {new Date().getFullYear()} inTrustVault. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/50">
            Secure storage. Blockchain integrity. AI intelligence.
          </p>
        </div>
      </div>
    </footer>
  );
}
