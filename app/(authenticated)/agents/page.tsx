"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { useAgents, useCreateAgent } from "@/hooks/use-agents";
import { useDocuments } from "@/hooks/use-documents";
import { AgentCard } from "@/components/agent-card";
import { AgentCreateModal } from "@/components/agent-create-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToastState } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";
import type { ToastData } from "@/hooks/use-toast-state";

// ---- Toast component --------------------------------------------------------

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg",
        "text-sm transition-all duration-300 animate-in slide-in-from-bottom-2",
        toast.variant === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        toast.variant === "success" &&
          "border-success/30 bg-success/10 text-success",
        toast.variant === "info" &&
          "border-primary/30 bg-primary/10 text-primary",
      )}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <p className="flex-1">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-0.5 hover:bg-muted/50 transition-colors"
          aria-label="Dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---- Empty state ------------------------------------------------------------

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8 text-primary"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="9" cy="10" r="1.5" />
          <circle cx="15" cy="10" r="1.5" />
          <path d="M8 16c0-2 1.5-3 4-3s4 1 4 3" />
          <line x1="9" y1="3" x2="9" y2="5" />
          <line x1="15" y1="3" x2="15" y2="5" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        No Agents Yet
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Create a custom AI agent with a persona and knowledge base.
        Agents can connect to WhatsApp and Telegram to respond automatically.
      </p>
      <Button onClick={onCreateClick}>Create Your First Agent</Button>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function AgentsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const { agents, isLoading: isAgentsLoading, error: agentsError, refresh } = useAgents();
  const { create, isCreating } = useCreateAgent();
  const { documents } = useDocuments({ limit: 200 });
  const { toast, showToast, dismissToast } = useToastState();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [isAuthLoading, user, router]);

  // Show errors as toasts
  useEffect(() => {
    if (agentsError) {
      showToast(agentsError, "error");
    }
  }, [agentsError, showToast]);

  // Handle agent creation
  const handleCreateAgent = useCallback(
    async (data: {
      name: string;
      system_prompt: string;
      document_ids: string[];
    }) => {
      const agent = await create(data);
      if (agent) {
        showToast(`Agent "${agent.name}" created.`, "success");
        setCreateModalOpen(false);
        refresh();
        router.push(`/agents/${agent.id}`);
      }
    },
    [create, refresh, router, showToast],
  );

  // Loading state
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Custom AI agents with configurable personas and multi-channel
            messaging.
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 mr-1.5"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Agent
        </Button>
      </div>

      {/* Content */}
      {isAgentsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-card p-5"
            >
              <Skeleton className="h-5 w-32 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4 mb-4" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <EmptyState onCreateClick={() => setCreateModalOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              channelCount={0}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <AgentCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreateAgent}
        isSubmitting={isCreating}
        documents={documents}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
