"use client";

import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import LoginForm from "@/components/login-form";
import { IconBrand } from "@/components/icons";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} aria-hidden="true" />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
        <div className="absolute top-16 left-16 w-32 h-32 border border-white/[0.06] rounded-3xl" aria-hidden="true" />
        <div className="absolute bottom-32 right-20 w-24 h-24 border border-white/[0.04] rounded-2xl" aria-hidden="true" />

        <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
          <Link href="/" className="flex items-center gap-3">
            <IconBrand className="h-10 w-10" />
            <span className="text-2xl font-bold text-primary-foreground tracking-tight">inTrustVault</span>
          </Link>

          <div className="space-y-6">
            <h1 className="text-4xl xl:text-5xl font-bold text-primary-foreground leading-[1.15] tracking-tight">
              Every document.
              <br />
              <span className="text-secondary">Every version.</span>
              <br />
              Fully accounted for.
            </h1>
            <p className="text-lg text-primary-foreground/60 leading-relaxed max-w-md">
              Upload, track, and verify your critical documents with cryptographic integrity and intelligent analysis.
            </p>
            <div className="flex items-center gap-6 text-sm text-primary-foreground/40">
              <span className="flex items-center gap-2">✓ End-to-end hashed</span>
              <span className="flex items-center gap-2">✓ Change detection</span>
              <span className="flex items-center gap-2">✓ Multi-format</span>
            </div>
          </div>

          <p className="text-sm text-primary-foreground/30">
            &copy; {new Date().getFullYear()} inTrustVault. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <IconBrand className="h-8 w-8" />
              <span className="text-xl font-bold tracking-tight">inTrustVault</span>
            </Link>
          </div>

          <AuthProvider>
            <LoginForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:text-primary/80 transition-colors">
                Sign up
              </Link>
            </p>
          </AuthProvider>
        </div>
      </div>
    </div>
  );
}
