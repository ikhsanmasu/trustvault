"use client";

import { useState, useEffect, useCallback } from "react";

export interface ToastData {
  message: string;
  variant: "success" | "error" | "info";
}

export function useToastState() {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback(
    (message: string, variant: "success" | "error" | "info" = "success") => {
      setToast({ message, variant });
    },
    [],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, 4500);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  return { toast, showToast, dismissToast };
}
