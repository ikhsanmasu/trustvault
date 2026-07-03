"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getProfile,
  type Profile,
  type TenantRole,
  ApiClientError,
} from "@/lib/api-client";

interface UseProfileReturn {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  role: TenantRole | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that fetches the current user's profile and exposes the tenant-level role.
 * Uses a module-level cache so multiple consumers share the same profile data.
 */
let _cachedProfile: Profile | null = null;
let _fetchPromise: Promise<Profile | null> | null = null;

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<Profile | null>(_cachedProfile);
  const [isLoading, setIsLoading] = useState(!_cachedProfile);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Deduplicate concurrent fetches
      if (!_fetchPromise) {
        _fetchPromise = getProfile().then((r) => r.profile);
      }
      const p = await _fetchPromise;
      _fetchPromise = null;
      _cachedProfile = p;
      setProfile(p);
    } catch (err) {
      _fetchPromise = null;
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load profile.");
      }
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_cachedProfile) {
      setProfile(_cachedProfile);
      setIsLoading(false);
      return;
    }
    fetchProfile();
  }, [fetchProfile]);

  const refresh = useCallback(async () => {
    _cachedProfile = null;
    _fetchPromise = null;
    await fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    role: profile?.role ?? null,
    refresh,
  };
}

/**
 * Returns whether the given role has at least "editor" permissions (can mutate).
 */
export function isEditorOrAbove(role: TenantRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin" || role === "editor";
}

/**
 * Returns whether the given role has at least "admin" permissions (can manage members).
 */
export function isAdminOrAbove(role: TenantRole | null): boolean {
  if (!role) return false;
  return role === "owner" || role === "admin";
}

/**
 * Returns whether the given role is "owner".
 */
export function isOwner(role: TenantRole | null): boolean {
  return role === "owner";
}
