"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Document } from "@/lib/api-client";

// ---- Props ------------------------------------------------------------------

interface AgentCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    system_prompt: string;
    document_ids: string[];
  }) => Promise<void>;
  isSubmitting: boolean;
  documents: Document[];
  preselectedDocumentIds?: string[];
}

// ---- Component --------------------------------------------------------------

export function AgentCreateModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  documents,
  preselectedDocumentIds,
}: AgentCreateModalProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(preselectedDocumentIds ?? []);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setSystemPrompt("");
    setSelectedDocIds(preselectedDocumentIds ?? []);
    setNameError(null);
    setPromptError(null);
  }, [preselectedDocumentIds]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const toggleDocument = useCallback((docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    let valid = true;
    if (!name.trim()) {
      setNameError("Agent name is required.");
      valid = false;
    } else if (name.trim().length > 255) {
      setNameError("Name must be 255 characters or fewer.");
      valid = false;
    } else {
      setNameError(null);
    }

    if (!systemPrompt.trim()) {
      setPromptError("System prompt is required.");
      valid = false;
    } else if (systemPrompt.trim().length > 10000) {
      setPromptError("System prompt must be 10,000 characters or fewer.");
      valid = false;
    } else {
      setPromptError(null);
    }

    if (!valid) return;

    await onSubmit({
      name: name.trim(),
      system_prompt: systemPrompt.trim(),
      document_ids: selectedDocIds,
    });
    resetForm();
  }, [name, systemPrompt, selectedDocIds, onSubmit, resetForm]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle>Create Agent</DialogTitle>
        <DialogDescription>
          Configure a custom AI agent with a persona and knowledge base.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4">
          {/* Agent name */}
          <div className="space-y-1.5">
            <label
              htmlFor="agent-name"
              className="text-sm font-medium text-foreground"
            >
              Agent Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g., Contract Reviewer"
              className="w-full h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground/50
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                         disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={255}
              disabled={isSubmitting}
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <label
              htmlFor="agent-prompt"
              className="text-sm font-medium text-foreground"
            >
              System Prompt
            </label>
            <textarea
              id="agent-prompt"
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                if (promptError) setPromptError(null);
              }}
              placeholder="You are a helpful contract review assistant. Always cite specific clauses when answering questions…"
              className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground/50 resize-y
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                         disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={10000}
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-muted-foreground/60 text-right">
              {systemPrompt.length}/10,000
            </p>
            {promptError && (
              <p className="text-xs text-destructive">{promptError}</p>
            )}
          </div>

          {/* Knowledge base document selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Knowledge Base Documents
            </label>
            <p className="text-xs text-muted-foreground">
              Select documents the agent can reference when answering questions.
            </p>
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic py-2">
                No documents available. Upload documents first to use as
                knowledge base.
              </p>
            ) : (
              <div className="max-h-[180px] overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/30">
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                      "hover:bg-muted/50",
                      selectedDocIds.includes(doc.id) && "bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={() => toggleDocument(doc.id)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30
                                 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-sm text-foreground leading-tight line-clamp-1">
                      {doc.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedDocIds.length > 0 && (
              <p className="text-[11px] text-muted-foreground/60">
                {selectedDocIds.length} document
                {selectedDocIds.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        </div>
      </DialogContent>

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpenChange(false)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim() || !systemPrompt.trim()}
        >
          {isSubmitting ? "Creating…" : "Create Agent"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// Helper for className concatenation (avoids importing cn for a single use)
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
