"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getDashboard,
  type DashboardStats,
  ApiClientError,
} from "@/lib/api-client";

interface UseDashboardReturn {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboard(): UseDashboardReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getDashboard();
      setStats(result.stats);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard stats.");
      }
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchDashboard,
  };
}
