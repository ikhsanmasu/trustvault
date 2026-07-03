"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  listSessions,
  getSession,
  deleteSession as deleteSessionApi,
  type ChatSession,
  type ChatMessage,
  type Citation,
  ApiClientError,
} from "@/lib/ai-api-client";

// ---- Return type -----------------------------------------------------------

export interface UseAssistantChatReturn {
  messages: ChatMessage[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  citations: Citation[] | null;
  error: string | null;
  sendMessage: (
    message: string,
    options?: { selectedDocIds?: string[]; customPrompt?: string },
  ) => Promise<void>;
  selectSession: (sessionId: string) => void;
  newSession: () => void;
  deleteSession: (sessionId: string) => Promise<boolean>;
  refreshSessions: () => Promise<void>;
}

// ---- Hook ------------------------------------------------------------------

export function useAssistantChat(): UseAssistantChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- Load sessions for a project -----------------------------------------

  const refreshSessions = useCallback(async () => {
    try {
      const result = await listSessions();
      setSessions(result.sessions);
    } catch (err) {
      // Session list failure is non-critical — log but do not block UI
      console.error("Failed to load sessions:", err);
    }
  }, []);

  // ---- Select an existing session (load its messages) -----------------------

  const selectSession = useCallback(async (sessionId: string) => {
    // Cancel any in-progress stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setCurrentSessionId(sessionId);
    setIsLoading(true);
    setError(null);
    setCitations(null);
    setStreamingContent("");
    setIsStreaming(false);

    try {
      const result = await getSession(sessionId);
      setMessages(result.messages);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load session messages.");
      }
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Start a new chat session --------------------------------------------

  const newSession = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setCurrentSessionId(null);
    setMessages([]);
    setStreamingContent("");
    setCitations(null);
    setError(null);
    setIsStreaming(false);
  }, []);

  // ---- Delete a session ----------------------------------------------------

  const deleteSessionFn = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        await deleteSessionApi(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          newSession();
        }
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to delete session.");
        }
        return false;
      }
    },
    [currentSessionId, newSession],
  );

  // ---- Send a message (streaming SSE) --------------------------------------

  const sendMessage = useCallback(
    async (
      message: string,
      options?: { selectedDocIds?: string[]; customPrompt?: string },
    ) => {
      // Cancel any previous in-progress stream
      if (abortRef.current) {
        abortRef.current.abort();
      }

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");
      setCitations(null);

      // Optimistically append the user message
      const optimisticUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        session_id: currentSessionId ?? "",
        role: "user",
        content: message,
        citations: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const bodyPayload: Record<string, unknown> = {
          sessionId: currentSessionId || undefined,
          message,
        };
        if (
          options?.selectedDocIds &&
          options.selectedDocIds.length > 0
        ) {
          bodyPayload.documentIds = options.selectedDocIds;
        }
        if (options?.customPrompt) {
          bodyPayload.customPrompt = options.customPrompt;
        }

        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });

        // Non-200 means a JSON error was returned before the SSE stream started
        if (!response.ok) {
          let body: { error?: string; code?: string } = {};
          try {
            body = await response.json();
          } catch {
            // not JSON
          }
          throw new ApiClientError(
            body.error || `HTTP ${response.status}`,
            response.status,
            body.code,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body available for streaming.");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let finalCitations: Citation[] | null = null;
        let finalSessionId: string | null = null;
        let finalMessageId: string | null = null;

        // ---- Read the stream chunk by chunk ---------------------------------
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines
          const parts = buffer.split("\n\n");
          // Last part may be incomplete — keep it in the buffer
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;

            let eventType = "";
            let dataStr = "";

            for (const line of part.split("\n")) {
              const trimmed = line.trim();
              if (trimmed.startsWith("event: ")) {
                eventType = trimmed.slice(7);
              } else if (trimmed.startsWith("data: ")) {
                dataStr = trimmed.slice(6);
              }
            }

            if (!dataStr) continue;

            try {
              const payload = JSON.parse(dataStr);

              switch (eventType) {
                case "token": {
                  const token = (payload as { token: string }).token;
                  if (token) {
                    accumulatedContent += token;
                    setStreamingContent(accumulatedContent);
                  }
                  break;
                }
                case "citations": {
                  finalCitations = (payload as { citations: Citation[] }).citations ?? null;
                  setCitations(finalCitations);
                  break;
                }
                case "done": {
                  finalSessionId = (payload as { sessionId: string; messageId: string }).sessionId;
                  finalMessageId = (payload as { sessionId: string; messageId: string }).messageId;
                  break;
                }
                case "error": {
                  const errPayload = payload as { error: string; code: string };
                  setError(errPayload.error);
                  break;
                }
              }
            } catch {
              // Skip unparseable SSE data
            }
          }
        }

        // ---- Flush remaining data from the decoder ---------------------------
        const remaining = decoder.decode();
        buffer += remaining;

        if (buffer.trim()) {
          let eventType = "";
          let dataStr = "";
          for (const line of buffer.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event: ")) {
              eventType = trimmed.slice(7);
            } else if (trimmed.startsWith("data: ")) {
              dataStr = trimmed.slice(6);
            }
          }
          if (dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (eventType === "done") {
                finalSessionId = (payload as { sessionId: string; messageId: string }).sessionId;
                finalMessageId = (payload as { sessionId: string; messageId: string }).messageId;
              }
            } catch {
              // skip
            }
          }
        }

        // ---- Append the assistant message -----------------------------------
        if (accumulatedContent && finalMessageId) {
          const assistantMsg: ChatMessage = {
            id: finalMessageId,
            session_id: finalSessionId ?? currentSessionId ?? "",
            role: "assistant",
            content: accumulatedContent,
            citations: finalCitations,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }

        // If a new session was created by the backend, update the local state
        if (finalSessionId && finalSessionId !== currentSessionId) {
          setCurrentSessionId(finalSessionId);
          // Refresh the session list so the new session appears
          refreshSessions();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Stream was intentionally aborted — no error to display
        } else if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Failed to send message.");
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setCitations(null);
        abortRef.current = null;
      }
    },
    [currentSessionId, refreshSessions],
  );

  // ---- Cleanup on unmount ---------------------------------------------------

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    sessions,
    currentSessionId,
    isLoading,
    isStreaming,
    streamingContent,
    citations,
    error,
    sendMessage,
    selectSession,
    newSession,
    deleteSession: deleteSessionFn,
    refreshSessions,
  };
}
