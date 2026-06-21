"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthContext } from "@/components/auth-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useProject } from "@/hooks/use-project";
import { useDocuments } from "@/hooks/use-documents";
import { CompareModal } from "@/components/compare-modal";
import { VaultDocumentRow } from "@/components/vault-document-row";
import UploadForm from "@/components/upload-form";
import BulkUpload from "@/components/bulk-upload";
import MemberList from "@/components/member-list";
import ProjectForm from "@/components/project-form";
import type { Document } from "@/lib/api-client";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const { user, isLoading: isAuthLoading } = useAuthContext();
  const {
    project,
    members,
    currentUserRole,
    isLoadingProject,
    error: projectError,
    updateProjectDetails,
    addProjectMember,
    changeMemberRole,
    removeProjectMember,
    refreshMembers,
  } = useProject(projectId, user?.id);

  const {
    documents,
    total: docTotal,
    isLoading: isLoadingDocs,
    error: docError,
    search,
    setSearch,
    refresh: refreshDocs,
  } = useDocuments({ projectId });

  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [compareDoc, setCompareDoc] = useState<Document | null>(null);

  const canUpload = currentUserRole === "admin" || currentUserRole === "editor";
  const isAdmin = currentUserRole === "admin";

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

  if (isAuthLoading || isLoadingProject) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            {projectError || "Project not found."}
          </AlertDescription>
        </Alert>
        <Link
          href="/projects"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Projects
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentUserRole && (
              <Badge
                variant={
                  currentUserRole === "admin"
                    ? "default"
                    : currentUserRole === "editor"
                      ? "secondary"
                      : "outline"
                }
              >
                {currentUserRole}
              </Badge>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditDialogOpen(true)}
              >
                Edit Project
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Upload area */}
      {canUpload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add Documents</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkUpload(!showBulkUpload)}
            >
              {showBulkUpload ? "Single Upload" : "Bulk Upload"}
            </Button>
          </div>
          {showBulkUpload ? (
            <BulkUpload
              projectId={projectId}
              onComplete={() => {
                refreshDocs();
                setShowBulkUpload(false);
              }}
            />
          ) : (
            <UploadForm
              projectId={projectId}
              onSuccess={refreshDocs}
            />
          )}
        </div>
      )}

      {/* Document list */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                {docTotal} document{docTotal !== 1 ? "s" : ""} in {project.name}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-64"
              />
              <Button variant="outline" size="sm" onClick={refreshDocs}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {docError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{docError}</AlertDescription>
            </Alert>
          )}

          {isLoadingDocs ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No documents match your search."
                  : "No documents in this project yet."}
              </p>
              {!search && canUpload && (
                <p className="text-sm text-muted-foreground mt-2">
                  Use the upload form above to add documents.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <VaultDocumentRow
                  key={doc.id}
                  document={doc}
                  onCompare={(d) => setCompareDoc(d)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Members section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Members</CardTitle>
          <CardDescription>
            Manage who has access to this project and their roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            currentUserId={user?.id}
            currentRole={currentUserRole}
            isLoading={isLoadingProject}
            onAddMember={addProjectMember}
            onChangeRole={changeMemberRole}
            onRemoveMember={async (userId) => {
              const success = await removeProjectMember(userId);
              if (success) refreshMembers();
              return success;
            }}
          />
        </CardContent>
      </Card>

      {/* Edit project dialog */}
      {project && (
        <ProjectForm
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSubmit={async (data) => {
            return await updateProjectDetails(data);
          }}
          title="Edit Project"
          initialName={project.name}
          initialDescription={project.description}
          isEdit
        />
      )}

      {/* Compare Modal */}
      {compareDoc && (
        <CompareModal
          document={compareDoc}
          open={compareDoc !== null}
          onOpenChange={(open) => {
            if (!open) setCompareDoc(null);
          }}
        />
      )}
    </div>
  );
}
