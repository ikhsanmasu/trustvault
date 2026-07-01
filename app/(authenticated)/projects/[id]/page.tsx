"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthContext } from "@/components/auth-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useProject } from "@/hooks/use-project";
import { useDocuments } from "@/hooks/use-documents";
import { CompareModal } from "@/components/compare-modal";
import { DocumentPreviewModal } from "@/components/document-preview-modal";
import { AnchorModal } from "@/components/anchor-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { VaultDocumentRow } from "@/components/vault-document-row";
import { deleteDocument, restoreDocument } from "@/lib/api-client";
import MemberList from "@/components/member-list";
import ProjectForm from "@/components/project-form";
import type { Document } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { IconChevronLeft, IconDocument, IconSearch, IconRefresh, IconUsers, IconStar, IconUpload, IconPlus } from "@/components/icons";
import { UploadModal } from "@/components/upload-modal";

type Tab = "documents" | "members";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("documents");

  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { project, members, currentUserRole, isLoadingProject, error: projectError, updateProjectDetails, addProjectMember, changeMemberRole, removeProjectMember, refreshMembers } = useProject(projectId, user?.id);
  const { documents, total: docTotal, isLoading: isLoadingDocs, error: docError, search, setSearch, refresh: refreshDocs } = useDocuments({ projectId });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [compareDoc, setCompareDoc] = useState<Document | null>(null);
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const [anchorDoc, setAnchorDoc] = useState<Document | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);

  const canUpload = currentUserRole === "admin" || currentUserRole === "editor";
  const isAdmin = currentUserRole === "admin";

  if (!isAuthLoading && !user) { router.push("/login"); return <div className="flex min-h-[50vh] items-center justify-center"><Alert variant="destructive"><AlertDescription>Please log in to access projects.</AlertDescription></Alert></div>; }
  if (isAuthLoading || isLoadingProject) return <ProjectDetailSkeleton />;
  if (projectError || !project) return <div className="space-y-4"><Alert variant="destructive"><AlertDescription>{projectError || "Project not found."}</AlertDescription></Alert><Link href="/projects" className={buttonVariants({ variant: "outline" })}>Back to Projects</Link></div>;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "documents", label: "Documents", icon: <IconDocument className="h-4 w-4" />, count: docTotal },
    { key: "members", label: "Members", icon: <IconUsers className="h-4 w-4" />, count: members.length },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Hero Header */}
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-4">
          <IconChevronLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <section className="relative overflow-hidden rounded-2xl hero-gradient">
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "24px 24px" }} aria-hidden="true" />
          <div className="absolute -top-20 right-0 w-[250px] h-[250px] rounded-full bg-secondary/5 blur-3xl" aria-hidden="true" />
          <div className="relative px-6 py-8 sm:py-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 min-w-0">
                <span className="text-xs font-semibold text-secondary uppercase tracking-widest">Project</span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground text-balance truncate">{project.name}</h1>
                {project.description && <p className="text-sm text-muted-foreground leading-relaxed max-w-xl line-clamp-2">{project.description}</p>}
                {members.length > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex -space-x-1.5">
                      {members.slice(0, 5).map((m) => <Avatar key={m.id} size="sm" className="h-6 w-6 text-[8px] ring-2 ring-background"><AvatarFallback initials={m.user_id.slice(0, 2).toUpperCase()} /></Avatar>)}
                      {members.length > 5 && <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-background text-[8px] font-semibold text-muted-foreground">+{members.length - 5}</div>}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {currentUserRole && <Badge variant={currentUserRole === "admin" ? "default" : currentUserRole === "editor" ? "secondary" : "outline"} className={cn("px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", currentUserRole === "admin" && "shadow-sm ring-1 ring-primary/20")}>{currentUserRole === "admin" && <IconStar className="h-3 w-3 mr-1 -ml-0.5" />}{currentUserRole}</Badge>}
                {isAdmin && <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)} className="rounded-lg">Edit</Button>}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-border gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors duration-200 border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full tabular-nums", activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1 border-b-2 border-transparent" />
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="flex items-center gap-2">
                {canUpload && (
                  <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground text-sm font-medium transition-colors">
                    <IconUpload className="h-3.5 w-3.5" />Upload
                  </button>
                )}
                <Button variant="outline" size="sm" onClick={refreshDocs} className="rounded-lg"><IconRefresh className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
              </div>
            </div>

            {docError && <Alert variant="destructive"><AlertDescription>{docError}</AlertDescription></Alert>}

            {isLoadingDocs ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 mb-4"><IconDocument className="h-7 w-7 text-muted-foreground/30" /></div>
                <p className="text-sm font-semibold text-muted-foreground">{search ? "No documents match your search." : "No documents yet."}</p>
                {!search && canUpload && <p className="text-sm text-muted-foreground/60 mt-1">Switch to the Upload tab to add documents.</p>}
              </div>
            ) : (
              <div className="space-y-1.5">
                {documents.map((doc) => (
                  <VaultDocumentRow key={doc.id} document={doc} onCompare={(d) => setCompareDoc(d)} onView={(d) => setViewDoc(d)} onAnchor={(d) => setAnchorDoc(d)} onDelete={(d) => setConfirmDelete(d)} />
                ))}
              </div>
            )}
          </div>
        )}


        {/* Members Tab */}
        {activeTab === "members" && (
          <MemberList
            members={members}
            currentUserId={user?.id}
            currentRole={currentUserRole}
            isLoading={isLoadingProject}
            onAddMember={addProjectMember}
            onChangeRole={changeMemberRole}
            onRemoveMember={async (userId) => { const ok = await removeProjectMember(userId); if (ok) refreshMembers(); return ok; }}
          />
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} projectId={projectId} onSuccess={() => { refreshDocs(); setUploadOpen(false); }} />
      {/* Modals */}
      {project && <ProjectForm open={editDialogOpen} onOpenChange={setEditDialogOpen} onSubmit={async (data) => await updateProjectDetails(data)} title="Edit Project" initialName={project.name} initialDescription={project.description} isEdit />}
      {compareDoc && <CompareModal document={compareDoc} open={compareDoc !== null} onOpenChange={(open) => { if (!open) setCompareDoc(null); }} />}
      {viewDoc && <DocumentPreviewModal document={viewDoc} open={viewDoc !== null} onOpenChange={(open) => { if (!open) setViewDoc(null); }} />}
      {anchorDoc && (
        <AnchorModal
          document={anchorDoc}
          open={anchorDoc !== null}
          onOpenChange={(open) => { if (!open) setAnchorDoc(null); }}
          onAnchored={() => { refreshDocs(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
          title={confirmDelete.deleted_at ? "Restore Document" : "Delete Document"}
          description={confirmDelete.deleted_at ? `Restore "${confirmDelete.name}"? The hashes are intact, but you will need to re-upload the file.` : `Permanently delete "${confirmDelete.name}"? The file is removed from storage. Integrity hashes and metadata are preserved for audit. This cannot be fully undone.`}
          confirmLabel={confirmDelete.deleted_at ? "Restore" : "Delete"}
          variant={confirmDelete.deleted_at ? "default" : "destructive"}
          onConfirm={async () => {
            const d = confirmDelete; setConfirmDelete(null);
            try { if (d.deleted_at) { await restoreDocument(d.id); } else { await deleteDocument(d.id); } refreshDocs(); } catch (_) { }
          }}
        />
      )}
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-72" /><Skeleton className="h-4 w-96" /></div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
    </div>
  );
}
