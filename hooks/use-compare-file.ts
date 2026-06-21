"use client";

import { useState, useCallback } from "react";
import {
  compareWithFile,
  type CompareResult,
  ApiClientError,
} from "@/lib/api-client";

interface UseCompareFileReturn {
  result: CompareResult | null;
  isLoading: boolean;
  error: string | null;
  runCompare: (docId: string, file: File) => Promise<void>;
  reset: () => void;
}

export function useCompareFile(): UseCompareFileReturn {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCompare = useCallback(async (docId: string, file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await compareWithFile(docId, file);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Comparison failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, runCompare, reset };
}
