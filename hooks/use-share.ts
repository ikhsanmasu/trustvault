"use client";

import { useState, useEffect, useCallback } from "react";
import {
  createShare,
  listShares,
  revokeShare,
  getShareByToken,
  type CreateShareRequest,
  type SharedLink,
  type SharePublicData,
  ApiClientError,
} from "@/lib/api-client";

// ---- useShares ----------------------------------------------------------------

interface UseSharesReturn {
  shares: SharedLink[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useShares(projectId: string | undefined): UseSharesReturn {
  const [shares, setShares] = useState<SharedLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listShares(projectId);
      setShares(result.shares);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load share links.");
      }
      setShares([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  return { shares, isLoading, error, refresh: fetchShares };
}

// ---- useCreateShare -----------------------------------------------------------

interface UseCreateShareReturn {
  createLink: (data: CreateShareRequest) => Promise<{ share: SharedLink; url: string } | null>;
  isLoading: boolean;
  error: string | null;
}

export function useCreateShare(): UseCreateShareReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = useCallback(
    async (data: CreateShareRequest): Promise<{ share: SharedLink; url: string } | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await createShare(data);
        return result;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to create share link.");
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { createLink, isLoading, error };
}

// ---- useRevokeShare -----------------------------------------------------------

interface UseRevokeShareReturn {
  revokeLink: (token: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export function useRevokeShare(): UseRevokeShareReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revokeLink = useCallback(async (token: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await revokeShare(token);
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to revoke share link.");
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { revokeLink, isLoading, error };
}

// ---- useSharePublic -----------------------------------------------------------

interface UseSharePublicReturn {
  data: SharePublicData | null;
  isLoading: boolean;
  error: string | null;
}

export function useSharePublic(token: string | undefined): UseSharePublicReturn {
  const [data, setData] = useState<SharePublicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setError("No share token provided.");
      return;
    }

    let cancelled = false;

    async function fetch() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getShareByToken(token!);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(err.message);
          } else {
            setError("Failed to load shared documents.");
          }
          setData(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetch();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return { data, isLoading, error };
}
