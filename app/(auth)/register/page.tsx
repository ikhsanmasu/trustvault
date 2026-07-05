"use client";

import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import RegisterForm from "@/components/register-form";
import { IconBrand } from "@/components/icons";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} aria-hidden="true" />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full bg-white/5 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
          <Link href="/" className="flex items-center gap-3">
            <IconBrand className="h-10 w-10" />
            <span className="text-2xl font-bold text-primary-foreground tracking-tight">InTrustVault</span>
          </Link>

          <div className="space-y-6">
            <h1 className="text-3xl xl:text-4xl font-bold text-primary-foreground leading-[1.2] tracking-tight">
              Start securing
              <br />
              your documents
              <br />
              <span className="text-secondary">in minutes.</span>
            </h1>
            <p className="text-lg text-primary-foreground/60 leading-relaxed max-w-md">
              Free during public beta. No credit card required. Get started with cryptographic document integrity today.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-primary-foreground/40">
              <span className="flex items-center gap-2">🔐 SHA-256 hashing</span>
              <span className="flex items-center gap-2">🧠 Intelligent analysis</span>
              <span className="flex items-center gap-2">📁 14 file formats</span>
              <span className="flex items-center gap-2">👥 Team ready</span>
            </div>
          </div>

          <p className="text-sm text-primary-foreground/30">
            &copy; {new Date().getFullYear()} InTrustVault. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: Register form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <IconBrand className="h-8 w-8" />
              <span className="text-xl font-bold tracking-tight">InTrustVault</span>
            </Link>
          </div>

          <AuthProvider>
            <RegisterForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
            <p className="mt-4 text-center text-xs text-muted-foreground/80">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              .
            </p>
          </AuthProvider>
        </div>
      </div>
    </div>
  );
}
