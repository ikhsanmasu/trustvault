"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listProjects,
  createProject,
  deleteProject,
  type Project,
  type ListProjectsResponse,
  type CreateProjectRequest,
  ApiClientError,
} from "@/lib/api-client";

interface UseProjectsReturn {
  projects: Project[];
  total: number;
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  refresh: () => void;
  createNewProject: (data: CreateProjectRequest) => Promise<Project | null>;
  removeProject: (id: string) => Promise<boolean>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
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

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: ListProjectsResponse = await listProjects({
        search: debouncedSearch || undefined,
        limit: 50,
      });
      setProjects(result.projects);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setError("Please log in to view projects.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to load projects.");
      }
      setProjects([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createNewProject = useCallback(
    async (data: CreateProjectRequest): Promise<Project | null> => {
      try {
        const result = await createProject(data);
        await fetchProjects(); // Refresh list
        return result.project;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to create project.");
        }
        return null;
      }
    },
    [fetchProjects],
  );

  const removeProject = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteProject(id);
        await fetchProjects(); // Refresh list
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to delete project.");
        }
        return false;
      }
    },
    [fetchProjects],
  );

  return {
    projects,
    total,
    isLoading,
    error,
    search,
    setSearch,
    refresh: fetchProjects,
    createNewProject,
    removeProject,
  };
}
