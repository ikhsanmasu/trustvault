"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { AgentWithDetails, Document } from "@/lib/api-client";

// ---- Props ------------------------------------------------------------------

interface AgentSettingsProps {
  agent: AgentWithDetails;
  /** All available documents in the tenant for the knowledge-base selector */
  allDocuments: Document[];
  onSave: (data: {
    name: string;
    system_prompt: string;
    document_ids: string[];
    is_active: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

// ---- Component --------------------------------------------------------------

export function AgentSettings({
  agent,
  allDocuments,
  onSave,
  isSaving,
}: AgentSettingsProps) {
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
  const [isActive, setIsActive] = useState(agent.is_active);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    agent.documents.map((d) => d.id),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Sync form state when agent changes
  useEffect(() => {
    setName(agent.name);
    setSystemPrompt(agent.system_prompt);
    setIsActive(agent.is_active);
    setSelectedDocIds(agent.documents.map((d) => d.id));
    setHasChanges(false);
    setNameError(null);
    setPromptError(null);
  }, [agent]);

  const checkChanges = useCallback(
    (
      newName: string,
      newPrompt: string,
      newActive: boolean,
      newDocIds: string[],
    ) => {
      const originalDocIds = agent.documents.map((d) => d.id);
      const docsChanged =
        newDocIds.length !== originalDocIds.length ||
        !newDocIds.every((id) => originalDocIds.includes(id));

      if (
        newName !== agent.name ||
        newPrompt !== agent.system_prompt ||
        newActive !== agent.is_active ||
        docsChanged
      ) {
        setHasChanges(true);
      } else {
        setHasChanges(false);
      }
    },
    [agent],
  );

  const toggleDocument = useCallback(
    (docId: string) => {
      setSelectedDocIds((prev) => {
        const next = prev.includes(docId)
          ? prev.filter((id) => id !== docId)
          : [...prev, docId];
        checkChanges(name, systemPrompt, isActive, next);
        return next;
      });
    },
    [name, systemPrompt, isActive, checkChanges],
  );

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (nameError) setNameError(null);
      checkChanges(value, systemPrompt, isActive, selectedDocIds);
    },
    [systemPrompt, isActive, selectedDocIds, nameError, checkChanges],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      setSystemPrompt(value);
      if (promptError) setPromptError(null);
      checkChanges(name, value, isActive, selectedDocIds);
    },
    [name, isActive, selectedDocIds, promptError, checkChanges],
  );

  const handleActiveToggle = useCallback(
    (value: boolean) => {
      setIsActive(value);
      checkChanges(name, systemPrompt, value, selectedDocIds);
    },
    [name, systemPrompt, selectedDocIds, checkChanges],
  );

  const handleSave = useCallback(async () => {
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

    await onSave({
      name: name.trim(),
      system_prompt: systemPrompt.trim(),
      document_ids: selectedDocIds,
      is_active: isActive,
    });
    setHasChanges(false);
  }, [name, systemPrompt, selectedDocIds, isActive, onSave]);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-1.5">
        <label
          htmlFor="settings-agent-name"
          className="text-sm font-medium text-foreground"
        >
          Name
        </label>
        <input
          id="settings-agent-name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm
                     placeholder:text-muted-foreground/50
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                     disabled:cursor-not-allowed disabled:opacity-50"
          maxLength={255}
          disabled={isSaving}
        />
        {nameError && (
          <p className="text-xs text-destructive">{nameError}</p>
        )}
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <label
          htmlFor="settings-agent-prompt"
          className="text-sm font-medium text-foreground"
        >
          System Prompt
        </label>
        <textarea
          id="settings-agent-prompt"
          value={systemPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          className="w-full min-h-[140px] rounded-lg border border-input bg-background px-3 py-2 text-sm
                     placeholder:text-muted-foreground/50 resize-y
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                     disabled:cursor-not-allowed disabled:opacity-50"
          maxLength={10000}
          disabled={isSaving}
        />
        <p className="text-[11px] text-muted-foreground/60 text-right">
          {systemPrompt.length}/10,000
        </p>
        {promptError && (
          <p className="text-xs text-destructive">{promptError}</p>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm font-medium text-foreground">Active</p>
          <p className="text-xs text-muted-foreground">
            When inactive, the agent will not respond on connected channels.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => handleActiveToggle(!isActive)}
          disabled={isSaving}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
            "transition-colors duration-200 ease-in-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isActive ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow",
              "transform transition-transform duration-200 ease-in-out",
              isActive ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* Knowledge base documents */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Knowledge Base Documents
        </label>
        <p className="text-xs text-muted-foreground">
          Documents the agent can reference in its responses.
        </p>
        {allDocuments.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic py-2">
            No documents available. Upload documents to use as knowledge base.
          </p>
        ) : (
          <div className="max-h-[220px] overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/30">
            {allDocuments.map((doc) => (
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
                  disabled={isSaving}
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

      {/* Save button */}
      <div className="pt-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// Inline cn helper
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
