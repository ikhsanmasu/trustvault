"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSharePublic } from "@/hooks/use-share";
import { shareChat } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChatMessageBubble, StreamingBubble } from "@/components/chat/chat-message";
import { ChatInput } from "@/components/chat/chat-input";
import { IconBrand, IconDocument, IconDownload, IconLock, IconSparkle } from "@/components/icons";
import { formatBytes, formatDate, cn } from "@/lib/utils";
import { getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import type { Document } from "@/lib/api-client";
import type { ChatMessage } from "@/lib/ai-api-client";

// ---- Local chat message type (no session persistence) -------------------------

interface LocalMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatMessage["citations"];
  created_at: string;
}

// ---- Inline chat streaming hook -----------------------------------------------

function useShareChat(token: string) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    (message: string) => {
      if (!token || isStreaming) return;

      if (abortRef.current) abortRef.current.abort();

      const userMessage: LocalMessage = {
        id: crypto.randomUUID(),
        session_id: "public-share",
        role: "user",
        content: message,
        citations: null,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamContent("");
      setError(null);

      let fullContent = "";

      const controller = shareChat(token, message, {
        onToken: (tok: string) => {
          fullContent += tok;
          setStreamContent(fullContent);
        },
        onDone: (_sessionId: string, _messageId: string) => {
          const assistantMessage: LocalMessage = {
            id: _messageId,
            session_id: _sessionId,
            role: "assistant",
            content: fullContent,
            citations: null,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setStreamContent("");
          setIsStreaming(false);
        },
        onError: (errMsg: string) => {
          setError(errMsg);
          setStreamContent("");
          setIsStreaming(false);
        },
      });

      abortRef.current = controller;
    },
    [token, isStreaming],
  );

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { messages, isStreaming, streamContent, error, sendMessage };
}

// ---- Page ---------------------------------------------------------------------

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;
  const { data, isLoading: isDataLoading, error: dataError } = useSharePublic(token);
  const chat = useShareChat(token);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.streamContent]);

  // ---- Loading ----------------------------------------------------------------

  if (isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-xl mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  // ---- Error ------------------------------------------------------------------

  if (dataError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <IconLock className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {dataError || "Share link not found"}
          </h1>
          <p className="text-sm text-muted-foreground">
            This share link may have been revoked or the token is invalid.
          </p>
        </div>
      </div>
    );
  }

  const { share, documents } = data;
  const showChat = share.allow_chat;

  // ---- Render ----------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/5 via-primary/3 to-secondary/5">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconBrand className="h-6 w-6" />
                <span className="text-xs font-semibold text-secondary uppercase tracking-widest">
                  inTrustVault
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-balance">
                {share.title || "Shared Documents"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {documents.length} document{documents.length !== 1 ? "s" : ""}
                <span className="ml-2 text-muted-foreground/60">
                  {formatDate(share.created_at)}
                </span>
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 self-start px-3 py-1 text-xs font-semibold"
            >
              <IconLock className="h-3 w-3 mr-1.5" />
              Shared Documents
            </Badge>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Documents section */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">
            Documents
          </h2>
          <div className="space-y-2">
            {documents.map((doc: Document) => (
              <div
                key={doc.id}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border bg-card px-4 py-3.5",
                  "border-l-4 border-l-primary/60",
                  "shadow-elevation-1 transition-all duration-200 hover:shadow-elevation-2",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                  <IconDocument className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <Badge
                      variant={getFileTypeVariant(doc.file_type)}
                      className="text-[10px] px-1.5 py-0 font-normal"
                    >
                      {getFileTypeLabel(doc.file_type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(doc.file_size_bytes)}
                    </span>
                  </div>
                </div>

                {share.allow_download && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-lg text-xs"
                    onClick={() => {
                      window.open(
                        `/api/share/${token}/download/${doc.id}`,
                        "_blank",
                      );
                    }}
                  >
                    <IconDownload className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* AI Chat section */}
        {showChat && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <IconSparkle className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                AI Chat
              </h2>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-normal"
              >
                Beta
              </Badge>
              <p className="text-xs text-muted-foreground ml-auto">
                Ask questions about the shared documents
              </p>
            </div>

            <div className="rounded-2xl border bg-card shadow-elevation-1 overflow-hidden">
              {/* Chat messages area */}
              <div className="h-[400px] overflow-y-auto p-4 space-y-4">
                {chat.messages.length === 0 && !chat.isStreaming && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 mb-3">
                      <IconSparkle className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Ask a question about these documents
                    </p>
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      The AI will search the documents for relevant information
                    </p>
                  </div>
                )}

                {chat.messages.map((msg) => (
                  <ChatMessageBubble key={msg.id} message={msg} />
                ))}

                {chat.isStreaming && (
                  <StreamingBubble content={chat.streamContent} />
                )}

                {chat.error && (
                  <Alert variant="destructive" className="animate-fade-in">
                    <AlertDescription>{chat.error}</AlertDescription>
                  </Alert>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <ChatInput
                onSend={chat.sendMessage}
                isStreaming={chat.isStreaming}
                placeholder="Ask a question about the shared documents..."
              />
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <IconLock className="h-3 w-3" />
            <span>
              Powered by inTrustVault — Document Integrity Platform
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
