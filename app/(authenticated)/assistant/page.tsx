"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { useProjects } from "@/hooks/use-projects";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { ChatMessageBubble, StreamingBubble } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatSessionList } from "@/components/chat/chat-session-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToastState } from "@/hooks/use-toast-state";
import type { ToastData } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";

// ---- Empty state ------------------------------------------------------------

function EmptyState({ hasProject }: { hasProject: boolean }) {
  if (!hasProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Select a Project
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose a project above to start asking questions about your documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Ask a Question About Your Documents
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Start a new chat to ask questions about the documents in this project.
          The AI will search through your documents and provide answers with citations.
        </p>

        <div className="space-y-2 text-left">
          <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
            Example Questions
          </p>
          {[
            "What are the key terms in the contract?",
            "Summarize the main obligations of each party.",
            "What changed between these versions?",
            "Find all mentions of payment deadlines.",
          ].map((example) => (
            <p
              key={example}
              className={cn(
                "text-[13px] text-muted-foreground/70 leading-relaxed",
                "border-l-2 border-border/60 pl-3",
              )}
            >
              &ldquo;{example}&rdquo;
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Toast component (lightweight) -----------------------------------------

function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  if (!toast) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-lg",
        "text-sm transition-all duration-300 animate-in slide-in-from-bottom-2",
        toast.variant === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        toast.variant === "success" && "border-success/30 bg-success/10 text-success",
        toast.variant === "info" && "border-primary/30 bg-primary/10 text-primary",
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

export default function AssistantPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const {
    projects,
    isLoading: isProjectsLoading,
  } = useProjects();

  const {
    messages,
    sessions,
    currentSessionId,
    isLoading: isChatLoading,
    isStreaming,
    streamingContent,
    error: chatError,
    sendMessage,
    selectSession,
    newSession,
    deleteSession,
    refreshSessions,
  } = useAssistantChat();

  const { toast, showToast, dismissToast } = useToastState();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Auth guard -----------------------------------------------------------

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [isAuthLoading, user, router]);

  // ---- Load sessions when project changes -----------------------------------

  useEffect(() => {
    if (selectedProjectId) {
      refreshSessions(selectedProjectId);
      newSession();
    }
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Show chat errors as toasts -------------------------------------------

  useEffect(() => {
    if (chatError) {
      showToast(chatError, "error");
    }
  }, [chatError, showToast]);

  // ---- Auto-scroll to bottom on new messages --------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ---- Handlers -------------------------------------------------------------

  const handleSendMessage = useCallback(
    (message: string) => {
      if (!selectedProjectId) return;
      sendMessage(selectedProjectId, message);
    },
    [selectedProjectId, sendMessage],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
    },
    [selectSession],
  );

  // ---- Loading state --------------------------------------------------------

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) {
    // Redirecting — show nothing
    return null;
  }

  const hasProject = selectedProjectId !== "";
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[860px]">
      {/* ---- Header with project selector ---- */}
      <div className="shrink-0 flex items-center gap-4 pb-4">
        <div className="flex-1 max-w-xs">
          {isProjectsLoading ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background",
                "px-3 py-2 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              aria-label="Select a project"
            >
              <option value="" disabled>
                Select a project…
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Active project name display */}
        {selectedProject && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
            <span className="font-medium text-foreground">
              {selectedProject.name}
            </span>
          </div>
        )}
      </div>

      {/* ---- Main split layout ---- */}
      <div className="flex flex-1 min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* ---- Left: Session sidebar ---- */}
        <div className="w-[260px] shrink-0 border-r border-border/60 bg-muted/30 flex flex-col">
          <ChatSessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={isProjectsLoading || (hasProject && sessions.length === 0 && isChatLoading)}
            onSelectSession={handleSelectSession}
            onNewSession={newSession}
            onDeleteSession={deleteSession}
          />
        </div>

        {/* ---- Right: Chat area ---- */}
        <div className="flex-1 flex flex-col min-w-0">
          {!hasProject ? (
            <EmptyState hasProject={false} />
          ) : !currentSessionId && messages.length === 0 && !isStreaming ? (
            <EmptyState hasProject={true} />
          ) : (
            <>
              {/* Error banner */}
              {chatError && (
                <div className="shrink-0 px-4 pt-3">
                  <Alert variant="destructive">
                    <AlertDescription>{chatError}</AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {isChatLoading && messages.length === 0 ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex",
                          i % 2 === 1 ? "justify-end" : "justify-start",
                        )}
                      >
                        <Skeleton
                          className={cn(
                            "h-16 rounded-2xl",
                            i % 2 === 1 ? "w-[60%]" : "w-[70%]",
                          )}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatMessageBubble key={msg.id} message={msg} />
                    ))}

                    {/* Streaming bubble when assistant is responding */}
                    {isStreaming && <StreamingBubble content={streamingContent} />}

                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          )}

          {/* ---- Chat input ---- */}
          <ChatInput
            onSend={handleSendMessage}
            isStreaming={isStreaming}
            isLoading={isChatLoading}
            disabled={!hasProject}
            placeholder={
              hasProject
                ? "Ask a question about your documents…"
                : "Select a project to start chatting…"
            }
          />
        </div>
      </div>

      {/* ---- Toast notifications ---- */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
