"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IconShare, IconCheck, IconSpinner, IconDocument, IconLink } from "@/components/icons";
import { useCreateShare } from "@/hooks/use-share";
import type { Document } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---- Props --------------------------------------------------------------------

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  documents: Document[];
  onCreated: () => void;
}

// ---- Component ----------------------------------------------------------------

export function ShareModal({
  open,
  onOpenChange,
  projectId,
  documents,
  onCreated,
}: ShareModalProps) {
  const [title, setTitle] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowChat, setAllowChat] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const { createLink, isLoading, error } = useCreateShare();

  const toggleDocument = useCallback((docId: string) => {
    setSelectedIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId],
    );
  }, []);

  const canCreate = selectedIds.length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canCreate) return;

    const result = await createLink({
      projectId,
      documentIds: selectedIds,
      allowDownload,
      allowChat,
      title: title.trim() || undefined,
    });

    if (result) {
      setCreatedLink(result.url);
      onCreated();
    }
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById("share-link-input") as HTMLInputElement;
      if (el) {
        el.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleOpen = (open: boolean) => {
    if (open) {
      setTitle("");
      setSelectedIds(documents.filter((d) => !d.deleted_at).map((d) => d.id));
      setAllowDownload(true);
      setAllowChat(true);
      setCreatedLink(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {/* Header */}
      <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5 px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <IconShare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                {createdLink ? "Share Link Created" : "Share Documents"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {createdLink
                  ? "Copy the link below to share"
                  : "Create a public link to share documents"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {createdLink ? "Done" : "Cancel"}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!createdLink ? (
          <>
            {/* Title input */}
            <div className="space-y-1.5">
              <label
                htmlFor="share-title"
                className="text-xs font-semibold text-muted-foreground"
              >
                Title (optional)
              </label>
              <input
                id="share-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Contract v1 Review"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isLoading}
              />
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                  disabled={isLoading}
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  Allow download
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={allowChat}
                  onChange={(e) => setAllowChat(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                  disabled={isLoading}
                />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                  Allow AI chat
                </span>
              </label>
            </div>

            {/* Document selection */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Select Documents
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border bg-muted/20 p-2">
                {documents
                  .filter((d) => !d.deleted_at)
                  .map((doc) => (
                    <label
                      key={doc.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                        selectedIds.includes(doc.id)
                          ? "bg-primary/5"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => toggleDocument(doc.id)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                        disabled={isLoading}
                      />
                      <IconDocument className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm truncate">{doc.name}</span>
                    </label>
                  ))}
                {documents.filter((d) => !d.deleted_at).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No active documents in this project
                  </p>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                onClick={handleSubmit}
                disabled={!canCreate}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold"
              >
                {isLoading ? (
                  <>
                    <IconSpinner className="mr-1.5 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Share Link"
                )}
              </Button>
            </div>
          </>
        ) : (
          /* Success state with copy link */
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
              <IconCheck className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Your share link is ready
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Anyone with this link can view the shared documents
              </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border bg-muted/30 px-3 py-2">
              <IconLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                id="share-link-input"
                type="text"
                readOnly
                value={createdLink}
                className="flex-1 bg-transparent text-xs text-foreground truncate focus:outline-none"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="h-7 shrink-0 rounded-lg text-xs"
              >
                {copied ? (
                  <>
                    <IconCheck className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  "Copy"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---- Inline Dialog (not using shadcn/ui since the original Dialog imported has custom className) ---

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-50 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background mx-4 shadow-elevation-3">
        {children}
      </div>
    </div>
  );
}
