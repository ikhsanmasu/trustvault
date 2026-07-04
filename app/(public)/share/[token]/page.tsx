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
import { IconBrand, IconDocument, IconDownload, IconFile, IconLock, IconShield, IconSparkle } from "@/components/icons";
import { formatBytes, formatDate, cn } from "@/lib/utils";
import { getFileTypeLabel, getFileTypeVariant } from "@/components/vault-document-row";
import { buildExplorerUrl } from "@/lib/explorers";
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
                  InTrustVault
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
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
        {showChat ? (
          /* Split layout: documents left, chat right */
          <div className="flex gap-6 h-[calc(100vh-14rem)] min-h-[500px]">
            {/* Documents panel */}
            <div className="w-[320px] shrink-0 flex flex-col min-h-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground mb-3 shrink-0">
                Documents
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {documents.map((doc: Document) => (
                  <div
                    key={doc.id}
                    className={cn(
                      "rounded-xl border bg-card px-3 py-3",
                      "shadow-elevation-1 transition-all duration-200 hover:shadow-elevation-2",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground mt-0.5">
                        <IconDocument className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant={getFileTypeVariant(doc.file_type)} className="text-[10px] px-1 py-0 font-normal">
                            {getFileTypeLabel(doc.file_type)}
                          </Badge>
                          {doc.fingerprint && (() => {
                            const explorerUrl = buildExplorerUrl(doc.chain, doc.tx_hash);
                            const shield = (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium" title={`Anchored on ${doc.chain ?? "blockchain"}${doc.tx_hash ? ` (${doc.tx_hash.slice(0, 10)}…)` : ""}`}>
                                <IconShield className="h-3 w-3" />
                              </span>
                            );
                            return explorerUrl ? (
                              <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                                {shield}
                              </a>
                            ) : shield;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 ml-[42px]">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg text-[11px]"
                        onClick={() => window.open(`/api/share/${token}/documents/${doc.id}/file`, "_blank")}
                      >
                        <IconFile className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      {share.allow_download && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg text-[11px]"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `/api/share/${token}/documents/${doc.id}/file?dl=1`;
                            a.download = doc.name;
                            a.click();
                          }}
                        >
                          <IconDownload className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat panel */}
            <div className="flex-1 flex flex-col min-w-0 rounded-2xl border bg-card shadow-elevation-1 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <IconSparkle className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold">AI Chat</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Beta</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chat.messages.length === 0 && !chat.isStreaming && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30 mb-3">
                      <IconSparkle className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Ask a question about these documents</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">The AI will search the documents for relevant information</p>
                  </div>
                )}
                {chat.messages.map((msg) => (
                  <ChatMessageBubble key={msg.id} message={msg} />
                ))}
                {chat.isStreaming && <StreamingBubble content={chat.streamContent} />}
                {chat.error && (
                  <Alert variant="destructive" className="animate-fade-in">
                    <AlertDescription>{chat.error}</AlertDescription>
                  </Alert>
                )}
                <div ref={chatEndRef} />
              </div>
              <ChatInput
                onSend={chat.sendMessage}
                isStreaming={chat.isStreaming}
                placeholder="Ask a question about the shared documents..."
              />
            </div>
          </div>
        ) : (
          /* Full-width documents when no chat */
          <section>
            <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">Documents</h2>
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
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={getFileTypeVariant(doc.file_type)} className="text-[10px] px-1.5 py-0 font-normal">
                        {getFileTypeLabel(doc.file_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(doc.file_size_bytes)}</span>
                      {doc.fingerprint && (() => {
                        const explorerUrl = buildExplorerUrl(doc.chain, doc.tx_hash);
                        const shield = (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium" title={`Anchored on ${doc.chain ?? "blockchain"}${doc.tx_hash ? ` (${doc.tx_hash.slice(0, 10)}…)` : ""}`}>
                            <IconShield className="h-3 w-3" />
                          </span>
                        );
                        return explorerUrl ? (
                          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            {shield}
                          </a>
                        ) : shield;
                      })()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 rounded-lg text-xs"
                    onClick={() => window.open(`/api/share/${token}/documents/${doc.id}/file`, "_blank")}
                  >
                    <IconFile className="h-3.5 w-3.5 mr-1.5" />
                    View
                  </Button>
                  {share.allow_download && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 rounded-lg text-xs"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/share/${token}/documents/${doc.id}/file?dl=1`;
                        a.download = doc.name;
                        a.click();
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
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <IconLock className="h-3 w-3" />
            <span>
              Powered by InTrustVault — Document Integrity Platform
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
