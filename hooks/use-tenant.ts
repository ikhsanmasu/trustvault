"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getTenant,
  updateTenant,
  type Tenant,
  ApiClientError,
} from "@/lib/api-client";

interface UseTenantReturn {
  tenant: Tenant | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  updateTenantName: (name: string) => Promise<boolean>;
  isUpdating: boolean;
  updateError: string | null;
}

export function useTenant(): UseTenantReturn {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchTenant = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getTenant();
      setTenant(result.tenant);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load tenant.");
      }
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const updateTenantName = useCallback(
    async (name: string): Promise<boolean> => {
      setIsUpdating(true);
      setUpdateError(null);
      try {
        const result = await updateTenant({ name });
        setTenant(result.tenant);
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setUpdateError(err.message);
        } else {
          setUpdateError("Failed to update tenant.");
        }
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  return {
    tenant,
    isLoading,
    error,
    refresh: fetchTenant,
    updateTenantName,
    isUpdating,
    updateError,
  };
}
