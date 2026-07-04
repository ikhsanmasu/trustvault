"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listDocuments,
  type Document,
  type ListDocumentsResponse,
  ApiClientError,
} from "@/lib/api-client";

export interface UseDocumentsParams {
  fileType?: string;
  limit?: number;
  includeDeleted?: boolean;
}

interface UseDocumentsReturn {
  documents: Document[];
  total: number;
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  fileType: string;
  setFileType: (value: string) => void;
  refresh: () => void;
}

export function useDocuments({
  fileType: initialFileType = "",
  limit = 50,
  includeDeleted = true,
}: UseDocumentsParams = {}): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState(initialFileType);
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
        file_type: fileType || undefined,
        search: debouncedSearch || undefined,
        limit,
        include_deleted: includeDeleted,
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
  }, [fileType, debouncedSearch, limit]);

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
    fileType,
    setFileType,
    refresh: fetchDocuments,
  };
}
