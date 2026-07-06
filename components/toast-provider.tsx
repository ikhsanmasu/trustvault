"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Toast, type ToastItem, type ToastVariant } from "@/components/ui/toast";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback for usage outside the provider (noop)
    const noop = (msg: string) => { console.log(`[toast] ${msg}`); };
    return { toast: { success: noop, error: noop, info: noop, warning: noop } };
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_TOASTS = 4;

let nextId = 0;
function genId(): string {
  nextId += 1;
  return `toast-${nextId}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = genId();
    setToasts((prev) => {
      const next = [...prev, { id, message, variant, createdAt: Date.now() }];
      // Keep only the last MAX_TOASTS
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: useCallback((msg: string) => addToast(msg, "success"), [addToast]),
    error: useCallback((msg: string) => addToast(msg, "error"), [addToast]),
    info: useCallback((msg: string) => addToast(msg, "info"), [addToast]),
    warning: useCallback((msg: string) => addToast(msg, "warning"), [addToast]),
  };

  const value: ToastContextValue = { toast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(
          <div
            aria-label="Notifications"
            className="fixed bottom-0 right-0 z-[100] flex flex-col-reverse items-end gap-2 p-4 sm:p-6 pointer-events-none max-w-full"
          >
            {toasts.map((item) => (
              <Toast key={item.id} item={item} onDismiss={dismissToast} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
