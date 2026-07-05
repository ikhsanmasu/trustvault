import Link from "next/link";
import { IconBrand } from "@/components/icons";
import { Footer } from "@/components/landing/footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shared shell for legal / policy pages: lightweight header + landing footer.
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="section-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 select-none">
            <IconBrand className="h-8 w-8 shrink-0" />
            <span className="text-xl font-bold tracking-tight text-foreground">
              InTrustVault
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "hidden sm:inline-flex border-border hover:bg-accent",
              )}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold shadow-sm",
              )}
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}
