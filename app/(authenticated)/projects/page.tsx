"use client";

import { useState, useEffect } from "react";
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
import { listMembers, type MemberRole } from "@/lib/api-client";
import { IconSearch, IconPlus, IconBriefcase } from "@/components/icons";

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

  // Per-project member counts and roles
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [memberIdsMap, setMemberIdsMap] = useState<Record<string, string[]>>({});
  const [userRoles, setUserRoles] = useState<Record<string, MemberRole>>({});

  useEffect(() => {
    const userId = user?.id;
    if (projects.length === 0 || !userId) return;

    let cancelled = false;
    async function fetchMemberData() {
      const counts: Record<string, number> = {};
      const idsMap: Record<string, string[]> = {};
      const roles: Record<string, MemberRole> = {};
      await Promise.all(
        projects.map(async (p) => {
          try {
            const res = await listMembers(p.id);
            counts[p.id] = res.members.length;
            idsMap[p.id] = res.members.map((m) => m.user_id);
            const myRole = res.members.find((m) => m.user_id === userId)?.role;
            if (myRole) roles[p.id] = myRole;
          } catch {
            counts[p.id] = 0;
            idsMap[p.id] = [];
          }
        }),
      );
      if (!cancelled) {
        setMemberCounts(counts);
        setMemberIdsMap(idsMap);
        setUserRoles(roles);
      }
    }
    fetchMemberData();
    return () => {
      cancelled = true;
    };
  }, [projects, user?.id]);

  // Redirect if not authenticated
  if (!isAuthLoading && !user) {
    router.push("/login");
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Alert variant="destructive">
          <AlertDescription>Please log in to access projects.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAuthLoading) {
    return <ProjectsSkeleton />;
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await removeProject(id);
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Hero / Header section */}
      <section className="relative overflow-hidden rounded-2xl hero-gradient">
        {/* dot-grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        {/* gold blur blob */}
        <div
          className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-6 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
                Projects
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
                Organize your work
              </h1>
              <p className="mt-3 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-pretty">
                Organize your documents into projects. Each project has its own
                members, roles, and document vault.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-52 sm:w-64 rounded-xl h-10 border-muted-foreground/20 transition-all duration-200 focus:w-72"
                />
              </div>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="rounded-xl h-10 px-5 shadow-sm"
              >
                <IconPlus className="h-4 w-4 mr-1.5" />
                New Project
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {!isLoading && !error && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
          <span className="tabular-nums font-semibold text-foreground">
            {total.toLocaleString()}
          </span>
          project{total !== 1 ? "s" : ""}
          {search && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span>
                matching &ldquo;{search}&rdquo;
              </span>
            </>
          )}
        </div>
      )}

      <Separator />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Project grid */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border-2 border-dashed border-muted-foreground/15 bg-muted/10 dark:bg-muted/10">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/30 mb-6">
            {search ? (
              <IconSearch className="h-10 w-10 text-muted-foreground/30" />
            ) : (
              <IconBriefcase className="h-10 w-10 text-muted-foreground/30" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-foreground/70">
            {search ? "No projects match your search" : "No projects yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground/50 max-w-md">
            {search
              ? "Try adjusting your search term or clear it to see all projects."
              : "Create your first project to start organizing documents and collaborating with your team."}
          </p>
          {!search && (
            <Button
              className="mt-6 rounded-xl h-10 px-6"
              onClick={() => setCreateDialogOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 mr-1.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Your First Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              userRole={userRoles[project.id]}
              memberCount={memberCounts[project.id]}
              memberIds={memberIdsMap[project.id] ?? []}
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
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
