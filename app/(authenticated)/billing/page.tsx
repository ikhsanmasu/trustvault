"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { IconSparkle, IconCreditCard } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  createCheckoutSession,
  createBillingSession,
  getBilling,
  type BillingInfo,
  ApiClientError,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Plan display helpers
// ---------------------------------------------------------------------------

const PLAN_BADGE: Record<string, { variant: "default" | "secondary"; label: string }> = {
  free: { variant: "secondary", label: "Free" },
  pro: { variant: "default", label: "Pro" },
  enterprise: { variant: "default", label: "Enterprise" },
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  trialing: "Trialing",
  none: "No subscription",
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-success",
  past_due: "text-destructive",
  canceled: "text-warning",
  incomplete: "text-warning",
  trialing: "text-success",
  none: "text-muted-foreground",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  const fetchBilling = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getBilling();
      setBilling(result.billing);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load billing information.");
      }
      setBilling(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // -----------------------------------------------------------------------
  // Checkout flow
  // -----------------------------------------------------------------------

  const handleUpgrade = useCallback(async () => {
    setIsSubscribing(true);
    setError(null);
    try {
      const result = await createCheckoutSession({
        priceId: "price_pro_monthly_placeholder",
      });
      window.location.href = result.url;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to start checkout. Please try again.");
      }
      setIsSubscribing(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Billing portal
  // -----------------------------------------------------------------------

  const handleManageBilling = useCallback(async () => {
    setIsManaging(true);
    setError(null);
    try {
      const result = await createBillingSession();
      window.location.href = result.url;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to open billing portal. Please try again.");
      }
      setIsManaging(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Checkout success / canceled messages
  // -----------------------------------------------------------------------

  const checkoutStatus = searchParams.get("checkout");

  // -----------------------------------------------------------------------
  // Auth guard
  if (!isAuthLoading && !user) {
    router.push("/login");
    return <div className="flex min-h-[50vh] items-center justify-center"><Skeleton className="h-8 w-48" /></div>;
  }

  // Loading state
  if (isAuthLoading || isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <Skeleton className="h-8 w-36 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error || !billing) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {checkoutStatus === "success" && (
          <Alert>
            <AlertDescription>
              Your payment is being processed. Your plan will update shortly.
            </AlertDescription>
          </Alert>
        )}
        <Alert variant="destructive">
          <AlertDescription>
            {error ?? "Failed to load billing information."}
          </AlertDescription>
        </Alert>
        <button
          type="button"
          onClick={fetchBilling}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const planInfo = PLAN_BADGE[billing.plan] ?? {
    variant: "secondary" as const,
    label: billing.plan,
  };
  const statusLabel = STATUS_LABEL[billing.subscriptionStatus] ?? billing.subscriptionStatus;

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and payment method.
        </p>
      </div>

      {/* Checkout result alerts */}
      {checkoutStatus === "success" && (
        <Alert>
          <IconSparkle className="h-4 w-4" />
          <AlertDescription>
            Your payment is being processed. Your plan will update in a few
            moments.{" "}
            <button
              type="button"
              onClick={fetchBilling}
              className="underline hover:no-underline"
            >
              Refresh
            </button>
          </AlertDescription>
        </Alert>
      )}
      {checkoutStatus === "canceled" && (
        <Alert variant="destructive">
          <AlertDescription>
            Checkout was canceled. Your plan has not been changed.
          </AlertDescription>
        </Alert>
      )}

      {/* Current plan card */}
      <Card className="rounded-2xl shadow-elevation-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={planInfo.variant}
                  className="px-3 py-1 text-sm capitalize"
                >
                  {planInfo.label}
                </Badge>
                {billing.subscriptionStatus !== "none" && (
                  <span
                    className={cn(
                      "text-xs font-medium capitalize",
                      STATUS_COLOR[billing.subscriptionStatus] ?? "text-muted-foreground",
                    )}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>

              {billing.currentPeriodEnd && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {billing.cancelAtPeriodEnd
                    ? "Your subscription ends on "
                    : "Next billing date: "}
                  {formatDate(billing.currentPeriodEnd)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {billing.plan === "free" && (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={isSubscribing}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "rounded-xl bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold",
                    isSubscribing && "opacity-60 pointer-events-none",
                  )}
                >
                  <IconSparkle className="mr-1.5 h-3.5 w-3.5" />
                  {isSubscribing ? "Redirecting…" : "Upgrade to Pro"}
                </button>
              )}

              {billing.plan !== "free" && billing.subscriptionStatus !== "none" && (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={isManaging}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-xl",
                    isManaging && "opacity-60 pointer-events-none",
                  )}
                >
                  <IconCreditCard className="mr-1.5 h-3.5 w-3.5" />
                  {isManaging ? "Opening…" : "Manage billing"}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan features summary */}
      <Card className="rounded-2xl shadow-elevation-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available plans
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Free */}
            <div className="rounded-xl border border-border p-4">
              <h3 className="font-semibold text-foreground">Free</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                10 documents · 50 AI verdicts/mo · 100 MB storage
              </p>
            </div>

            {/* Pro */}
            <div
              className={cn(
                "rounded-xl border p-4",
                billing.plan === "pro"
                  ? "border-secondary/50 bg-secondary/5"
                  : "border-border",
              )}
            >
              <h3 className="font-semibold text-foreground">
                Pro{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  $29/mo
                </span>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Unlimited documents · 500 AI verdicts/mo · 5 GB storage · On-chain
                anchoring · Vault assistant · Sharing
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border p-4">
            <h3 className="font-semibold text-foreground">
              Enterprise{" "}
              <span className="text-xs font-normal text-muted-foreground">
                Custom
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlimited everything · SSO/SAML · Audit logs · SLA · Dedicated
              support
            </p>
            <a
              href="mailto:sales@trustvault.app"
              className="mt-2 inline-block text-xs font-medium text-secondary hover:underline"
            >
              Contact sales →
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
