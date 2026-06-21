"use client";

import { useState, useCallback } from "react";
import {
  compareDocuments,
  type CompareResponse,
  ApiClientError,
} from "@/lib/api-client";

interface UseCompareReturn {
  result: CompareResponse | null;
  isLoading: boolean;
  error: string | null;
  runCompare: (docAId: string, docBId: string) => Promise<void>;
  reset: () => void;
}

export function useCompare(): UseCompareReturn {
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCompare = useCallback(async (docAId: string, docBId: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await compareDocuments(docAId, docBId);
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
