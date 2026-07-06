"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/5 text-primary",
  warning: "border-warning/30 bg-warning/10 text-warning",
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success: "✓",   // checkmark
  error: "✗",     // X mark
  info: "i",
  warning: "!",
};

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

export interface ToastProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ item, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const DURATION = 5000;

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Progress bar
  useEffect(() => {
    const tick = () => {
      if (pausedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(remaining);
    };
    timerRef.current = setInterval(tick, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-dismiss
  const dismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => onDismiss(item.id), 300);
  }, [item.id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, DURATION);
    return () => clearTimeout(timer);
  }, [dismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; startTimeRef.current = Date.now() - (DURATION - (progress / 100) * DURATION); }}
      className={cn(
        "pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-elevation-3 transition-all duration-300",
        VARIANT_STYLES[item.variant],
        isVisible ? "translate-y-0 opacity-100 scale-100" : "translate-y-2 opacity-0 scale-95",
      )}
    >
      {/* Icon */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold leading-none">
        {VARIANT_ICONS[item.variant]}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm leading-snug">{item.message}</p>

      {/* Dismiss */}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 -mr-1 -mt-1 rounded-lg p-1 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-current/10"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-current/30 transition-[width] duration-75 linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
