"use client";

import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { ONBOARDING_STEPS } from "@/components/onboarding/onboarding-steps";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";

// ---------------------------------------------------------------------------
// Onboarding Dialog
// ---------------------------------------------------------------------------

export function OnboardingDialog() {
  const { isActive, currentStep, totalSteps, goNext, goBack, skip, complete } =
    useOnboarding();

  // Keyboard: Escape to skip
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft" && currentStep > 0) goBack();
    },
    [skip, goNext, goBack, currentStep],
  );

  useEffect(() => {
    if (isActive) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [isActive, handleKeyDown]);

  if (!isActive) return null;

  const step = ONBOARDING_STEPS[currentStep];
  if (!step) return null;

  const isLast = currentStep === totalSteps - 1;
  const isFirst = currentStep === 0;
  const Icon = step.icon;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding — Step ${currentStep + 1} of ${totalSteps}: ${step.title}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={skip}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-elevation-4 animate-in zoom-in-95 fade-in duration-300">
        {/* Skip button */}
        <button
          type="button"
          onClick={skip}
          className="absolute top-4 right-4 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip tutorial
        </button>

        {/* Content */}
        <div className="p-6 sm:p-8 text-center">
          {/* Illustration */}
          <div className="mb-4 text-5xl select-none" aria-hidden="true">
            {step.illustration}
          </div>

          {/* Icon + Title */}
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {step.title}
            </h2>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {step.description}
          </p>

          {/* Tips */}
          <ul className="mt-5 space-y-2 text-left max-w-xs mx-auto">
            {step.tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer: Dots + Buttons */}
        <div className="flex items-center justify-between px-6 pb-6 sm:px-8 sm:pb-8">
          {/* Step dots */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === currentStep
                    ? "w-5 bg-secondary"
                    : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goBack}
                className="rounded-xl text-muted-foreground"
              >
                <IconChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={isLast ? complete : goNext}
              className="rounded-xl bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold"
            >
              {isLast ? "Go to My Vault" : "Next"}
              {!isLast && <IconChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
