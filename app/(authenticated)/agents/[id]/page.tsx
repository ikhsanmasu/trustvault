"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import {
  useAgent,
  useUpdateAgent,
  useDeleteAgent,
  useAgentChannels,
  useAgentChat,
} from "@/hooks/use-agents";
import { useDocuments } from "@/hooks/use-documents";
import { AgentSettings } from "@/components/agent-settings";
import { AgentChannels } from "@/components/agent-channels";
import { AgentPlayground } from "@/components/agent-playground";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToastState } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";
import type { ToastData } from "@/hooks/use-toast-state";

// ---- Tabs -------------------------------------------------------------------

type Tab = "playground" | "settings" | "channels";

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

// ---- Page -------------------------------------------------------------------

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = (params?.id as string) ?? "";

  const { user, isLoading: isAuthLoading } = useAuthContext();
  const {
    agent,
    isLoading: isAgentLoading,
    error: agentError,
    refresh: refreshAgent,
  } = useAgent(agentId);
  const { update, isUpdating } = useUpdateAgent();
  const { remove, isDeleting } = useDeleteAgent();
  const channelsHook = useAgentChannels();
  const { documents } = useDocuments({ limit: 200 });
  const { toast, showToast, dismissToast } = useToastState();
  const [activeTab, setActiveTab] = useState<Tab>("playground");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Agent chat hook (always active so sessions load even on other tabs)
  const chat = useAgentChat(agentId);

  // Auth guard
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [isAuthLoading, user, router]);

  // Show errors as toasts
  useEffect(() => {
    if (agentError) {
      showToast(agentError, "error");
    }
  }, [agentError, showToast]);

  useEffect(() => {
    if (channelsHook.error) {
      showToast(channelsHook.error, "error");
    }
  }, [channelsHook.error, showToast]);

  // ---- Handlers -------------------------------------------------------------

  const handleSaveSettings = useCallback(
    async (data: {
      name: string;
      system_prompt: string;
      document_ids: string[];
      is_active: boolean;
    }) => {
      const updated = await update(agentId, data);
      if (updated) {
        showToast("Agent settings saved.", "success");
        refreshAgent();
      }
    },
    [agentId, update, refreshAgent, showToast],
  );

  const handleDeleteAgent = useCallback(async () => {
    const ok = await remove(agentId);
    if (ok) {
      showToast("Agent deleted.", "success");
      router.push("/agents");
    }
    setDeleteConfirmOpen(false);
  }, [agentId, remove, router, showToast]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      return chat.deleteSession(sessionId);
    },
    [chat],
  );

  // ---- Loading state --------------------------------------------------------

  if (isAuthLoading || isAgentLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user || !agent) return null;

  return (
    <div>
      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/agents")}
          className="h-8 px-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="sr-only">Back</span>
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
              {agent.name}
            </h1>
            {agent.is_active ? (
              <Badge
                variant="default"
                className="text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px]">
                Inactive
              </Badge>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteConfirmOpen(true)}
          className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
        >
          Delete
        </Button>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border/60 mb-6">
        {[
          { key: "playground" as Tab, label: "Playground" },
          { key: "settings" as Tab, label: "Settings" },
          { key: "channels" as Tab, label: "Channels" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "playground" && (
        <div className="h-[calc(100vh-16rem)] max-h-[800px]">
          <AgentPlayground
            agentName={agent.name}
            messages={chat.messages}
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            isLoading={chat.isLoading}
            isStreaming={chat.isStreaming}
            streamingContent={chat.streamingContent}
            error={chat.error}
            onSendMessage={chat.sendMessage}
            onSelectSession={chat.selectSession}
            onNewSession={chat.newSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="max-w-2xl">
          <AgentSettings
            agent={agent}
            allDocuments={documents}
            onSave={handleSaveSettings}
            isSaving={isUpdating}
          />
        </div>
      )}

      {activeTab === "channels" && (
        <div className="max-w-2xl">
          <AgentChannels
            channels={agent.channels}
            onConnectWhatsApp={async (phoneNumberId: string, accessToken: string) => {
              const result = await channelsHook.connectWa(agentId, phoneNumberId, accessToken);
              if (result) {
                refreshAgent();
                return result;
              }
              return null;
            }}
            onDisconnectWhatsApp={async () => {
              const ok = await channelsHook.disconnectWa(agentId);
              if (ok) {
                showToast("WhatsApp disconnected.", "success");
                refreshAgent();
              }
              return ok;
            }}
            onWhatsAppStatus={async () => {
              const status = await channelsHook.getWaStatus(agentId);
              if (status) return status;
              return null;
            }}
            onConnectTelegram={async (botToken: string) => {
              const result = await channelsHook.connectTg(agentId, botToken);
              if (result) {
                showToast(
                  `Telegram bot @${result.bot_username} connected.`,
                  "success",
                );
                refreshAgent();
                return result;
              }
              return null;
            }}
            onDisconnectTelegram={async () => {
              const ok = await channelsHook.disconnectTg(agentId);
              if (ok) {
                showToast("Telegram disconnected.", "success");
                refreshAgent();
              }
              return ok;
            }}
            onRemoveChannel={async (channelId: string) => {
              const ok = await channelsHook.removeChannel(agentId, channelId);
              if (ok) {
                showToast("Channel removed.", "success");
                refreshAgent();
              }
              return ok;
            }}
            isOperating={channelsHook.isOperating}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
      >
        <DialogHeader>
          <DialogTitle>Delete Agent</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{agent.name}&rdquo;? This
            action cannot be undone. All associated channels, sessions, and
            messages will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteConfirmOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteAgent}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete Agent"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
