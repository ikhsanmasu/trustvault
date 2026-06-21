"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getProject,
  updateProject,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
  type Project,
  type ProjectMember,
  type UpdateProjectRequest,
  type AddMemberRequest,
  type UpdateMemberRoleRequest,
  type MemberRole,
  ApiClientError,
} from "@/lib/api-client";

interface UseProjectReturn {
  project: Project | null;
  members: ProjectMember[];
  currentUserRole: MemberRole | null;
  isLoadingProject: boolean;
  isLoadingMembers: boolean;
  error: string | null;
  refreshProject: () => void;
  refreshMembers: () => void;
  updateProjectDetails: (data: UpdateProjectRequest) => Promise<boolean>;
  addProjectMember: (data: AddMemberRequest) => Promise<ProjectMember | null>;
  changeMemberRole: (userId: string, role: MemberRole) => Promise<boolean>;
  removeProjectMember: (userId: string) => Promise<boolean>;
}

export function useProject(
  projectId: string | undefined,
  userId: string | undefined,
): UseProjectReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingProject(true);
    setError(null);
    try {
      const result = await getProject(projectId);
      setProject(result.project);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load project.");
      }
      setProject(null);
    } finally {
      setIsLoadingProject(false);
    }
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingMembers(true);
    try {
      const result = await listMembers(projectId);
      setMembers(result.members);
    } catch (_err) {
      setMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchMembers();
  }, [fetchProject, fetchMembers]);

  // Derive current user's role
  const currentUserRole: MemberRole | null = userId
    ? (members.find((m) => m.user_id === userId)?.role ?? null)
    : null;

  const updateProjectDetails = useCallback(
    async (data: UpdateProjectRequest): Promise<boolean> => {
      if (!projectId) return false;
      try {
        const result = await updateProject(projectId, data);
        setProject(result.project);
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to update project.");
        }
        return false;
      }
    },
    [projectId],
  );

  const addProjectMember = useCallback(
    async (data: AddMemberRequest): Promise<ProjectMember | null> => {
      if (!projectId) return null;
      try {
        const result = await addMember(projectId, data);
        setMembers((prev) => [...prev, result.member]);
        return result.member;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to add member.");
        }
        return null;
      }
    },
    [projectId],
  );

  const changeMemberRole = useCallback(
    async (userId: string, role: MemberRole): Promise<boolean> => {
      if (!projectId) return false;
      try {
        const result = await updateMemberRole(projectId, userId, { role });
        setMembers((prev) =>
          prev.map((m) => (m.user_id === userId ? result.member : m)),
        );
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to update member role.");
        }
        return false;
      }
    },
    [projectId],
  );

  const removeProjectMember = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!projectId) return false;
      try {
        await removeMember(projectId, userId);
        setMembers((prev) => prev.filter((m) => m.user_id !== userId));
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to remove member.");
        }
        return false;
      }
    },
    [projectId],
  );

  return {
    project,
    members,
    currentUserRole,
    isLoadingProject,
    isLoadingMembers,
    error,
    refreshProject: fetchProject,
    refreshMembers: fetchMembers,
    updateProjectDetails,
    addProjectMember,
    changeMemberRole,
    removeProjectMember,
  };
}
