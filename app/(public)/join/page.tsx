"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { acceptInvitation, ApiClientError } from "@/lib/api-client";
import { useAuthContext } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBrand, IconCheck, IconAlertTriangle, IconSpinner } from "@/components/icons";

type JoinState =
  | { kind: "loading" }
  | { kind: "need-auth" }
  | { kind: "success"; tenantId: string; role: string }
  | { kind: "error"; message: string };

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

  const [state, setState] = useState<JoinState>({ kind: "loading" });

  const token = searchParams.get("token");

  const tryJoin = useCallback(async () => {
    if (!token) {
      setState({ kind: "error", message: "No invitation token provided. Check your invitation link." });
      return;
    }

    if (!user) {
      setState({ kind: "need-auth" });
      return;
    }

    setState({ kind: "loading" });
    try {
      const result = await acceptInvitation(token);
      setState({
        kind: "success",
        tenantId: result.tenant_id,
        role: result.role,
      });
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        let message = err.message;
        if (err.code === "INVITATION_NOT_FOUND") {
          message = "This invitation link is invalid or has been revoked.";
        } else if (err.code === "INVITATION_EXPIRED") {
          message = "This invitation has expired. Please ask your administrator to send a new one.";
        } else if (err.code === "INVITATION_ALREADY_ACCEPTED") {
          message = "This invitation has already been accepted.";
        } else if (err.code === "EMAIL_MISMATCH") {
          message = "The email on your account does not match the invitation. Please sign in with the correct account.";
        } else if (err.code === "ALREADY_IN_TENANT") {
          message = "You already belong to a tenant. Leave your current tenant before accepting this invitation.";
        }
        setState({ kind: "error", message });
      } else {
        setState({
          kind: "error",
          message: "Failed to process the invitation. Please try again or contact your administrator.",
        });
      }
    }
  }, [token, user, router]);

  useEffect(() => {
    tryJoin();
  }, [tryJoin]);

  // ---- Loading ----------------------------------------------------------------

  if (isAuthLoading || state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="w-full max-w-md px-4">
          <div className="rounded-2xl border bg-card shadow-elevation-2 p-8 text-center space-y-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <IconSpinner className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-40 mx-auto" />
              <Skeleton className="h-3 w-56 mx-auto" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Need auth --------------------------------------------------------------

  if (state.kind === "need-auth") {
    const returnUrl = `/join?token=${encodeURIComponent(token || "")}`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="w-full max-w-md px-4">
          <div className="rounded-2xl border bg-card shadow-elevation-2 p-8 text-center space-y-6">
            {/* Brand */}
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconBrand className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                You have been invited
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sign in or create an account to accept the invitation.
                Make sure you use the email address the invitation was sent to.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href={`/login?redirect=${encodeURIComponent(returnUrl)}`}
                className="w-full"
              >
                <Button className="w-full rounded-xl h-11" type="button">
                  Sign In
                </Button>
              </Link>
              <Link
                href={`/register?redirect=${encodeURIComponent(returnUrl)}`}
                className="w-full"
              >
                <Button variant="outline" className="w-full rounded-xl h-11" type="button">
                  Create Account
                </Button>
              </Link>
            </div>

            <p className="text-xs text-muted-foreground/60">
              Already signed in with a different account? Sign out first, then use the correct account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Success ----------------------------------------------------------------

  if (state.kind === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="w-full max-w-md px-4">
          <div className="rounded-2xl border bg-card shadow-elevation-2 p-8 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
              <IconCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Welcome aboard!
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have successfully joined as a{" "}
                <span className="font-semibold capitalize text-foreground">
                  {state.role}
                </span>
                . You will be redirected to your dashboard shortly.
              </p>
            </div>

            <Button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl h-11"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error ------------------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20">
      <div className="w-full max-w-md px-4">
        <div className="rounded-2xl border bg-card shadow-elevation-2 p-8 text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <IconAlertTriangle className="h-7 w-7 text-destructive" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Invitation Error
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {state.message}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => router.push("/dashboard")}
              variant="outline"
              className="rounded-xl h-11"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
