"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  addAgentChannel,
  removeAgentChannel,
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  connectTelegram,
  disconnectTelegram,
  listAgentSessions,
  getAgentSession,
  deleteAgentSession,
  type Agent,
  type AgentWithDetails,
  type AgentSession,
  type AgentMessage,
  type AgentChannel,
  type CreateAgentRequest,
  type UpdateAgentRequest,
  type AddChannelRequest,
  type WhatsAppConnectResponse,
  type WhatsAppStatusResponse,
  type TelegramConnectResponse,
  type AgentCitation,
  ApiClientError,
} from "@/lib/api-client";

// ===== useAgents — list all agents =====

export interface UseAgentsReturn {
  agents: Agent[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listAgents();
      setAgents(result.agents);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load agents.");
      }
      setAgents([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return {
    agents,
    total,
    isLoading,
    error,
    refresh: fetchAgents,
  };
}

// ===== useAgent — get single agent with details =====

export interface UseAgentReturn {
  agent: AgentWithDetails | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgent(id: string): UseAgentReturn {
  const [agent, setAgent] = useState<AgentWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAgent(id);
      setAgent(result.agent);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to load agent.");
      }
      setAgent(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  return {
    agent,
    isLoading,
    error,
    refresh: fetchAgent,
  };
}

// ===== useCreateAgent — create a new agent =====

export interface UseCreateAgentReturn {
  create: (data: CreateAgentRequest) => Promise<AgentWithDetails | null>;
  isCreating: boolean;
  error: string | null;
}

export function useCreateAgent(): UseCreateAgentReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (data: CreateAgentRequest): Promise<AgentWithDetails | null> => {
      setIsCreating(true);
      setError(null);
      try {
        const result = await createAgent(data);
        return result.agent;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to create agent.");
        }
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return { create, isCreating, error };
}

// ===== useUpdateAgent — update an existing agent =====

export interface UseUpdateAgentReturn {
  update: (
    id: string,
    data: UpdateAgentRequest,
  ) => Promise<AgentWithDetails | null>;
  isUpdating: boolean;
  error: string | null;
}

export function useUpdateAgent(): UseUpdateAgentReturn {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (
      id: string,
      data: UpdateAgentRequest,
    ): Promise<AgentWithDetails | null> => {
      setIsUpdating(true);
      setError(null);
      try {
        const result = await updateAgent(id, data);
        return result.agent;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to update agent.");
        }
        return null;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  return { update, isUpdating, error };
}

// ===== useDeleteAgent — delete an agent =====

export interface UseDeleteAgentReturn {
  remove: (id: string) => Promise<boolean>;
  isDeleting: boolean;
  error: string | null;
}

export function useDeleteAgent(): UseDeleteAgentReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAgent(id);
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Failed to delete agent.");
      }
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { remove, isDeleting, error };
}

// ===== useAgentChannels — channel management =====

export interface UseAgentChannelsReturn {
  addChannel: (
    agentId: string,
    data: AddChannelRequest,
  ) => Promise<AgentChannel | null>;
  removeChannel: (agentId: string, channelId: string) => Promise<boolean>;
  connectWa: (agentId: string) => Promise<WhatsAppConnectResponse | null>;
  disconnectWa: (agentId: string) => Promise<boolean>;
  getWaStatus: (agentId: string) => Promise<WhatsAppStatusResponse | null>;
  connectTg: (
    agentId: string,
    botToken: string,
  ) => Promise<TelegramConnectResponse | null>;
  disconnectTg: (agentId: string) => Promise<boolean>;
  isOperating: boolean;
  error: string | null;
}

export function useAgentChannels(): UseAgentChannelsReturn {
  const [isOperating, setIsOperating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addChannel = useCallback(
    async (
      agentId: string,
      data: AddChannelRequest,
    ): Promise<AgentChannel | null> => {
      setIsOperating(true);
      setError(null);
      try {
        const result = await addAgentChannel(agentId, data);
        return result.channel;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to add channel.");
        }
        return null;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  const removeChannel = useCallback(
    async (agentId: string, channelId: string): Promise<boolean> => {
      setIsOperating(true);
      setError(null);
      try {
        await removeAgentChannel(agentId, channelId);
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to remove channel.");
        }
        return false;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  const connectWa = useCallback(
    async (agentId: string): Promise<WhatsAppConnectResponse | null> => {
      setIsOperating(true);
      setError(null);
      try {
        return await connectWhatsApp(agentId);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to connect WhatsApp.");
        }
        return null;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  const disconnectWa = useCallback(
    async (agentId: string): Promise<boolean> => {
      setIsOperating(true);
      setError(null);
      try {
        await disconnectWhatsApp(agentId);
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to disconnect WhatsApp.");
        }
        return false;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  const getWaStatus = useCallback(
    async (agentId: string): Promise<WhatsAppStatusResponse | null> => {
      try {
        return await getWhatsAppStatus(agentId);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to get WhatsApp status.");
        }
        return null;
      }
    },
    [],
  );

  const connectTg = useCallback(
    async (
      agentId: string,
      botToken: string,
    ): Promise<TelegramConnectResponse | null> => {
      setIsOperating(true);
      setError(null);
      try {
        return await connectTelegram(agentId, botToken);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to connect Telegram.");
        }
        return null;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  const disconnectTg = useCallback(
    async (agentId: string): Promise<boolean> => {
      setIsOperating(true);
      setError(null);
      try {
        await disconnectTelegram(agentId);
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("Failed to disconnect Telegram.");
        }
        return false;
      } finally {
        setIsOperating(false);
      }
    },
    [],
  );

  return {
    addChannel,
    removeChannel,
    connectWa,
    disconnectWa,
    getWaStatus,
    connectTg,
    disconnectTg,
    isOperating,
    error,
  };
}

// ===== useAgentChat — agent playground chat with SSE streaming =====

export interface UseAgentChatReturn {
  messages: AgentMessage[];
  sessions: AgentSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  citations: AgentCitation[] | null;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  newSession: () => void;
  deleteSession: (sessionId: string) => Promise<boolean>;
  refreshSessions: () => Promise<void>;
}

export function useAgentChat(agentId: string): UseAgentChatReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [citations, setCitations] = useState<AgentCitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- Load sessions for this agent -----------------------------------------

  const refreshSessions = useCallback(async () => {
    if (!agentId) return;
    try {
      const result = await listAgentSessions(agentId);
      setSessions(result.sessions);
    } catch (err) {
      console.error("Failed to load agent sessions:", err);
    }
  }, [agentId]);

  // Load sessions on mount and when agentId changes
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // ---- Select an existing session (load its messages) -----------------------

  const selectSession = useCallback(
    async (sessionId: string) => {
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
        const result = await getAgentSession(agentId, sessionId);
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
    },
    [agentId],
  );

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
        await deleteAgentSession(agentId, sessionId);
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
    [agentId, currentSessionId, newSession],
  );

  // ---- Send a message (streaming SSE) --------------------------------------

  const sendMessage = useCallback(
    async (message: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");
      setCitations(null);

      const optimisticUserMsg: AgentMessage = {
        id: `temp-${Date.now()}`,
        agent_id: agentId,
        session_id: currentSessionId ?? "",
        role: "user",
        content: message,
        channel: null,
        external_user_id: null,
        citations: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: currentSessionId || undefined,
              message,
            }),
            signal: controller.signal,
          },
        );

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
        let finalCitations: AgentCitation[] | null = null;
        let finalSessionId: string | null = null;
        let finalMessageId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
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
                  finalCitations =
                    (payload as { citations: AgentCitation[] }).citations ?? null;
                  setCitations(finalCitations);
                  break;
                }
                case "done": {
                  finalSessionId = (
                    payload as { sessionId: string; messageId: string }
                  ).sessionId;
                  finalMessageId = (
                    payload as { sessionId: string; messageId: string }
                  ).messageId;
                  break;
                }
                case "error": {
                  const errPayload = payload as {
                    error: string;
                    code: string;
                  };
                  setError(errPayload.error);
                  break;
                }
              }
            } catch {
              // Skip unparseable SSE data
            }
          }
        }

        // Flush remaining
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
                finalSessionId = (
                  payload as { sessionId: string; messageId: string }
                ).sessionId;
                finalMessageId = (
                  payload as { sessionId: string; messageId: string }
                ).messageId;
              }
            } catch {
              // skip
            }
          }
        }

        if (accumulatedContent && finalMessageId) {
          const assistantMsg: AgentMessage = {
            id: finalMessageId,
            agent_id: agentId,
            session_id: finalSessionId ?? currentSessionId ?? "",
            role: "assistant",
            content: accumulatedContent,
            channel: null,
            external_user_id: null,
            citations: finalCitations,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }

        if (finalSessionId && finalSessionId !== currentSessionId) {
          setCurrentSessionId(finalSessionId);
          refreshSessions();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // intentionally aborted
        } else if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError(
            err instanceof Error ? err.message : "Failed to send message.",
          );
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setCitations(null);
        abortRef.current = null;
      }
    },
    [agentId, currentSessionId, refreshSessions],
  );

  // Cleanup on unmount
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
