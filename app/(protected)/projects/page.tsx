"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useProjects } from "@/hooks/use-projects";
import ProjectCard from "@/components/project-card";
import ProjectForm from "@/components/project-form";

export default function ProjectsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const {
    projects,
    total,
    isLoading,
    error,
    search,
    setSearch,
    createNewProject,
    removeProject,
  } = useProjects();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to access projects.</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (isAuthLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </main>
    );
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await removeProject(id);
    setDeletingId(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {total} project{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 sm:w-64"
          />
          <Button onClick={() => setCreateDialogOpen(true)}>
            New Project
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Project grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search
              ? "No projects match your search."
              : "Create your first project to start uploading documents."}
          </p>
          {!search && (
            <Button
              className="mt-4"
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              isDeleting={deletingId === project.id}
            />
          ))}
        </div>
      )}

      {/* Create project dialog */}
      <ProjectForm
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (data) => {
          const created = await createNewProject(data);
          return created !== null;
        }}
      />
    </main>
  );
}
