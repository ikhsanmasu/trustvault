"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAuthContext } from "@/components/auth-provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "intrustvault-onboarding-completed";
const TOTAL_STEPS = 6; // 0-5

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface OnboardingContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  goNext: () => void;
  goBack: () => void;
  skip: () => void;
  complete: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    return {
      isActive: false,
      currentStep: 0,
      totalSteps: TOTAL_STEPS,
      goNext: () => {},
      goBack: () => {},
      skip: () => {},
      complete: () => {},
    };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuthContext();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasChecked, setHasChecked] = useState(false);

  // Check if onboarding should be shown
  useEffect(() => {
    if (authLoading || !user || hasChecked) return;

    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (completed === "true") {
        setHasChecked(true);
        return;
      }

      // Check if this is a new user (no onboarding flag + signed up recently)
      // We show onboarding only once — the localStorage flag persists
      setHasChecked(true);
      setIsActive(true);
    } catch {
      // localStorage unavailable — skip onboarding
      setHasChecked(true);
    }
  }, [user, authLoading, hasChecked]);

  const dismiss = useCallback(() => {
    setIsActive(false);
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const skip = useCallback(() => {
    dismiss();
  }, [dismiss]);

  const complete = useCallback(() => {
    dismiss();
  }, [dismiss]);

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: TOTAL_STEPS,
        goNext,
        goBack,
        skip,
        complete,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
