"use client";

import { useState, useCallback } from "react";
import {
  anchorDocument,
  verifyDocument,
  type AnchorResponse,
  type VerifyResponse,
  ApiClientError,
} from "@/lib/api-client";

interface UseAnchorReturn {
  /** Result from the last anchor operation (null until first anchor). */
  anchorResult: AnchorResponse | null;
  /** Result from the last verify operation (null until first verify). */
  verifyResult: VerifyResponse | null;
  /** True while an anchor transaction is pending. */
  isAnchoring: boolean;
  /** True while a verify RPC call is in flight. */
  isVerifying: boolean;
  /** Error message from the last failed operation. */
  error: string | null;
  /** Triggers POST /api/anchor for the given document. */
  anchor: (documentId: string) => Promise<void>;
  /** Triggers POST /api/verify for the given document. */
  verify: (documentId: string) => Promise<void>;
  /** Clears all state (anchorResult, verifyResult, error). */
  reset: () => void;
}

export function useAnchor(): UseAnchorReturn {
  const [anchorResult, setAnchorResult] = useState<AnchorResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anchor = useCallback(async (documentId: string) => {
    setIsAnchoring(true);
    setError(null);
    setAnchorResult(null);
    try {
      const data = await anchorDocument(documentId);
      setAnchorResult(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Anchor failed. Please try again.");
      }
    } finally {
      setIsAnchoring(false);
    }
  }, []);

  const verify = useCallback(async (documentId: string) => {
    setIsVerifying(true);
    setError(null);
    setVerifyResult(null);
    try {
      const data = await verifyDocument(documentId);
      setVerifyResult(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const reset = useCallback(() => {
    setAnchorResult(null);
    setVerifyResult(null);
    setError(null);
  }, []);

  return {
    anchorResult,
    verifyResult,
    isAnchoring,
    isVerifying,
    error,
    anchor,
    verify,
    reset,
  };
}
