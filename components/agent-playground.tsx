"use client";

import { useCallback, useRef, useEffect } from "react";
import { StreamingBubble } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatSessionList } from "@/components/chat/chat-session-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type {
  AgentSession,
  AgentMessage,
  AgentCitation,
} from "@/lib/api-client";

// ---- Empty state ------------------------------------------------------------

function EmptyState({ agentName }: { agentName: string }) {
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
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <circle cx="9" cy="10" r="1.5" />
            <circle cx="15" cy="10" r="1.5" />
            <path d="M8 16c0-2 1.5-3 4-3s4 1 4 3" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Test {agentName}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Start a conversation in the playground to test how the agent responds
          using its system prompt and knowledge base.
        </p>
      </div>
    </div>
  );
}

// ---- Citation chip ----------------------------------------------------------

function CitationChip({ citation }: { citation: AgentCitation }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60
                 bg-muted/50 px-2 py-1 text-xs text-muted-foreground max-w-[260px]"
      title={`${citation.document_name} — chunk ${citation.chunk_index}: ${citation.snippet}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0"
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate">{citation.document_name}</span>
    </span>
  );
}

// ---- Agent message bubble (same layout as ChatMessageBubble but with channel info) ----

function AgentMessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-secondary/60 text-secondary-foreground rounded-tl-sm"
        }`}
      >
        <span className="sr-only">{isUser ? "You" : "Agent"}:</span>

        {message.channel && (
          <span className="block text-[10px] text-muted-foreground/60 mb-1 uppercase tracking-wider">
            via {message.channel}
          </span>
        )}

        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground/60 w-full">
              Sources
            </span>
            {message.citations.map((c) => (
              <CitationChip
                key={`${c.document_id}-${c.chunk_index}`}
                citation={c}
              />
            ))}
          </div>
        )}

        <p
          className={`mt-1.5 text-[10px] ${
            isUser ? "text-primary-foreground/50" : "text-muted-foreground/50"
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ---- Props ------------------------------------------------------------------

interface AgentPlaygroundProps {
  agentName: string;
  messages: AgentMessage[];
  sessions: AgentSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  onSendMessage: (message: string) => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
}

// ---- Component --------------------------------------------------------------

export function AgentPlayground({
  agentName,
  messages,
  sessions,
  currentSessionId,
  isLoading,
  isStreaming,
  streamingContent,
  error,
  onSendMessage,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: AgentPlaygroundProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSendMessage = useCallback(
    (message: string) => {
      onSendMessage(message);
    },
    [onSendMessage],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId);
    },
    [onSelectSession],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-4 pt-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex flex-1 min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* Session sidebar */}
        <div className="w-[260px] shrink-0 border-r border-border/60 bg-muted/30 flex flex-col">
          <ChatSessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={sessions.length === 0 && isLoading}
            onSelectSession={handleSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!currentSessionId && messages.length === 0 && !isStreaming ? (
            <EmptyState agentName={agentName} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {isLoading && messages.length === 0 ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`flex ${
                          i % 2 === 1 ? "justify-end" : "justify-start"
                        }`}
                      >
                        <Skeleton
                          className={`h-16 rounded-2xl ${
                            i % 2 === 1 ? "w-[60%]" : "w-[70%]"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <AgentMessageBubble key={msg.id} message={msg} />
                    ))}

                    {isStreaming && <StreamingBubble content={streamingContent} />}

                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          )}

          <ChatInput
            onSend={handleSendMessage}
            isStreaming={isStreaming}
            isLoading={isLoading}
            disabled={false}
            placeholder={`Message ${agentName}…`}
          />
        </div>
      </div>
    </div>
  );
}
