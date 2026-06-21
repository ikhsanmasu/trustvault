"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listDocuments,
  type Document,
  type ListDocumentsResponse,
  ApiClientError,
} from "@/lib/api-client";

interface UseDocumentsParams {
  projectId: string;
}

interface UseDocumentsReturn {
  documents: Document[];
  total: number;
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  refresh: () => void;
}

export function useDocuments({ projectId }: UseDocumentsParams): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: ListDocumentsResponse = await listDocuments({
        project_id: projectId,
        search: debouncedSearch || undefined,
        limit: 50,
      });
      setDocuments(result.documents);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setError("Please log in to view documents.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to load documents.");
      }
      setDocuments([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, debouncedSearch]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    total,
    isLoading,
    error,
    search,
    setSearch,
    refresh: fetchDocuments,
  };
}
