"use client";

import { useCallback, useRef, useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { useAssistantChat } from "@/hooks/useAssistantChat";
import { useDocuments } from "@/hooks/use-documents";
import { ChatMessageBubble, StreamingBubble } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatSessionList } from "@/components/chat/chat-session-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToastState } from "@/hooks/use-toast-state";
import type { ToastData } from "@/hooks/use-toast-state";
import { cn } from "@/lib/utils";

// ---- Cookie helpers for per-session KB selection -------------------------

const KB_COOKIE_PREFIX = "tv-kb-";

function saveSessionDocIds(sessionId: string, docIds: string[]) {
  if (typeof document === "undefined") return;
  const value = docIds.join(",");
  document.cookie = `${KB_COOKIE_PREFIX}${sessionId}=${encodeURIComponent(value)};path=/;max-age=2592000;SameSite=Lax`;
}

function loadSessionDocIds(sessionId: string): string[] {
  if (typeof document === "undefined") return [];
  const prefix = `${KB_COOKIE_PREFIX}${sessionId}=`;
  const match = document.cookie.split("; ").find(row => row.startsWith(prefix));
  if (!match) return [];
  const value = decodeURIComponent(match.slice(prefix.length));
  return value ? value.split(",").filter(Boolean) : [];
}

function clearSessionDocIds(sessionId: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${KB_COOKIE_PREFIX}${sessionId}=;path=/;max-age=0;SameSite=Lax`;
}

// ---- Default system prompt (mirrors the backend default) ---------------------

const DEFAULT_SYSTEM_PROMPT = `You are InTrustVault AI Assistant, a document-integrity and knowledge assistant.
You answer questions based on the document excerpts provided to you.
When you use information from the excerpts, cite which document the information came from.
If the answer cannot be found in the provided excerpts, say so honestly — do not fabricate information.
Keep your answers concise and professional.`;

const STORAGE_KEY_PROMPT = "trustvault-assistant-system-prompt";

function loadPrompt(): string {
  if (typeof window === "undefined") return DEFAULT_SYSTEM_PROMPT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PROMPT);
    return stored && stored.trim() ? stored : DEFAULT_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

function savePrompt(value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PROMPT, value);
  } catch {
    // Silently ignore (e.g., quota exceeded)
  }
}

// ---- Empty state ------------------------------------------------------------

function EmptyState() {
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
          Start a new chat to ask questions about your documents.
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

// ---- Knowledge Base (right panel) ------------------------------------------

function KnowledgeBasePanel({
  documents,
  isLoadingDocs,
  selectedDocIds,
  onToggleDoc,
  onSelectAll,
  onClearAll,
  docSearch,
  onDocSearchChange,
  customPrompt,
  onCustomPromptChange,
  showPanel,
  onTogglePanel,
}: {
  documents: Array<{ id: string; name: string }>;
  isLoadingDocs: boolean;
  selectedDocIds: Set<string>;
  onToggleDoc: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  docSearch: string;
  onDocSearchChange: (value: string) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  showPanel: boolean;
  onTogglePanel: () => void;
}) {
  const filteredDocs = useMemo(() => {
    if (!docSearch.trim()) return documents;
    const q = docSearch.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, docSearch]);

  if (!showPanel) return null;

  return (
    <div className="w-[280px] shrink-0 border-l border-border/60 bg-muted/30 flex flex-col min-h-0">
      {/* ---- Header ---- */}
      <div className="shrink-0 px-3 py-3 flex items-center justify-between border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground">Knowledge Base</h3>
        <button
          type="button"
          onClick={onTogglePanel}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close knowledge base panel"
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

      {/* ---- Document selection ---- */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search */}
        <div className="shrink-0 px-3 py-2">
          <Input
            type="search"
            placeholder="Search documents..."
            value={docSearch}
            onChange={(e) => onDocSearchChange(e.target.value)}
            className="h-8 text-xs"
            aria-label="Search documents"
          />
        </div>

        {/* Selection controls + count */}
        <div className="shrink-0 px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              className="h-6 px-1.5 text-[11px]"
              disabled={isLoadingDocs}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-6 px-1.5 text-[11px]"
              disabled={selectedDocIds.size === 0}
            >
              Clear all
            </Button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {selectedDocIds.size} selected
          </span>
        </div>

        {/* Scrollable document list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {isLoadingDocs && documents.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded-md" />
              ))}
            </div>
          ) : filteredDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">
              {documents.length === 0
                ? "No documents found."
                : "No documents match your search."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filteredDocs.map((doc) => {
                const isChecked = selectedDocIds.has(doc.id);
                return (
                  <li key={doc.id}>
                    <label
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer",
                        "text-sm transition-colors duration-100",
                        "hover:bg-muted/60",
                        isChecked && "bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleDoc(doc.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded-sm border-primary/40 accent-primary"
                      />
                      <span className="truncate text-[13px] leading-tight text-foreground">
                        {doc.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---- System Prompt editor (below docs) ---- */}
        <div className="shrink-0 border-t border-border/40 px-3 py-3">
          <label
            htmlFor="system-prompt-editor"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            System Prompt
          </label>
          <Textarea
            id="system-prompt-editor"
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            rows={5}
            className="resize-none text-xs leading-relaxed min-h-[100px]"
          />
        </div>
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Skeleton className="h-8 w-48" /></div>}>
      <AssistantContent />
    </Suspense>
  );
}

function AssistantContent() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuthContext();

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
  } = useAssistantChat();

  const { documents, isLoading: isDocsLoading } = useDocuments({ limit: 200 });

  const { toast, showToast, dismissToast } = useToastState();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Knowledge Base state -------------------------------------------------

  const searchParams = useSearchParams();
  const urlDocIds = searchParams.get("docs")?.split(",").filter(Boolean) ?? [];

  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(
    () => new Set(urlDocIds),
  );
  const [docSearch, setDocSearch] = useState("");
  const [customPrompt, setCustomPrompt] = useState(() => loadPrompt());
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(true);

  // Persist customPrompt to localStorage on change
  useEffect(() => {
    savePrompt(customPrompt);
  }, [customPrompt]);

  // ---- Per-session KB selection: restore on session change -------------------
  const prevSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevSessionRef.current;
    // Save previous session's selection before switching
    if (prev && prev !== currentSessionId) {
      saveSessionDocIds(prev, Array.from(selectedDocIds));
    }
    // Restore saved selection for the new session
    if (currentSessionId) {
      const saved = loadSessionDocIds(currentSessionId);
      // Merge: prefer saved cookie, but also keep URL docs if this is the initial load
      if (saved.length > 0) {
        setSelectedDocIds(new Set(saved));
      } else if (prev === null) {
        // Initial load — URL docs already set via useState initializer
        // Save them so they persist when switching back
        if (selectedDocIds.size > 0) {
          saveSessionDocIds(currentSessionId, Array.from(selectedDocIds));
        }
      } else {
        // Switched to a session with no saved selection — clear
        setSelectedDocIds(new Set());
      }
    } else {
      // New session (currentSessionId is null) — clear selection
      setSelectedDocIds(new Set());
    }
    prevSessionRef.current = currentSessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // Save KB selection to cookies whenever it changes (for current session)
  useEffect(() => {
    if (currentSessionId && selectedDocIds.size > 0) {
      saveSessionDocIds(currentSessionId, Array.from(selectedDocIds));
    }
  }, [selectedDocIds, currentSessionId]);

  // ---- Auth guard -----------------------------------------------------------

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
    }
  }, [isAuthLoading, user, router]);

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
      const docIdsArray =
        selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;
      const promptToSend =
        customPrompt !== DEFAULT_SYSTEM_PROMPT ? customPrompt : undefined;
      sendMessage(message, {
        selectedDocIds: docIdsArray,
        customPrompt: promptToSend,
      });
    },
    [sendMessage, selectedDocIds, customPrompt],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
    },
    [selectSession],
  );

  // ---- Knowledge Base handlers ---------------------------------------------

  const handleToggleDoc = useCallback((id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedDocIds(new Set(documents.map((d) => d.id)));
  }, [documents]);

  const handleClearAll = useCallback(() => {
    setSelectedDocIds(new Set());
  }, []);

  const handleToggleKnowledgePanel = useCallback(() => {
    setShowKnowledgePanel((prev) => !prev);
  }, []);

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

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[860px]">
      {/* ---- Toolbar ---- */}
      <div className="shrink-0 flex items-center gap-2 pb-4">
        <div className="flex-1" />
        {/* Toggle knowledge base panel */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleKnowledgePanel}
          className={cn(
            "h-8 gap-1.5 text-xs",
            showKnowledgePanel
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={showKnowledgePanel ? "Hide knowledge base" : "Show knowledge base"}
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Knowledge Base
        </Button>
      </div>

      {/* ---- 3-panel layout ---- */}
      <div className="flex flex-1 min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* ---- Left: Session sidebar ---- */}
        <div className="w-[200px] shrink-0 border-r border-border/60 bg-muted/30 flex flex-col">
          <ChatSessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={sessions.length === 0 && isChatLoading}
            onSelectSession={handleSelectSession}
            onNewSession={newSession}
            onDeleteSession={deleteSession}
          />
        </div>

        {/* ---- Middle: Chat area ---- */}
        <div className="flex-1 flex flex-col min-w-0">
          {!currentSessionId && messages.length === 0 && !isStreaming ? (
            <EmptyState />
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
            disabled={false}
            placeholder="Ask a question about your documents…"
          />
        </div>

        {/* ---- Right: Knowledge Base ---- */}
        <KnowledgeBasePanel
          documents={documents}
          isLoadingDocs={isDocsLoading}
          selectedDocIds={selectedDocIds}
          onToggleDoc={handleToggleDoc}
          onSelectAll={handleSelectAll}
          onClearAll={handleClearAll}
          docSearch={docSearch}
          onDocSearchChange={setDocSearch}
          customPrompt={customPrompt}
          onCustomPromptChange={setCustomPrompt}
          showPanel={showKnowledgePanel}
          onTogglePanel={handleToggleKnowledgePanel}
        />
      </div>

      {/* ---- Toast notifications ---- */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
