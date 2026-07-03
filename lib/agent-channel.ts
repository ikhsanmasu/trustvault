// ---------------------------------------------------------------------------
// TrustVault P16 — Agent Channel Manager
// ---------------------------------------------------------------------------
// In-memory channel pools (WhatsApp clients, Telegram bots), channel config
// encryption (AES-256-GCM), and the core message handler that runs the RAG
// pipeline and calls DeepSeek with an agent's system prompt + knowledge base.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/client";
import type { Citation } from "@/lib/types";
import {
  generateEmbedding,
  buildRAGPrompt,
  chatCompletionStream,
  chatCompletion,
  extractCitations,
  type RetrievalResult,
  type ChatMessage,
} from "@/lib/ai-assistant";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppStatus {
  status: "disconnected" | "qr_pending" | "connecting" | "connected";
  qrCode?: string;
  phoneNumber?: string;
}

export interface TelegramStatus {
  status: "disconnected" | "connected";
  botUsername?: string;
}

/** Decrypted (plaintext) WhatsApp channel config. */
export interface WhatsAppPlainConfig {
  phone_number?: string;
  client_state?: unknown;
  qr_code?: string;
}

/** Decrypted (plaintext) Telegram channel config. */
export interface TelegramPlainConfig {
  bot_token?: string;
  bot_username?: string;
  webhook_url?: string;
}

// ---------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM)
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const keyB64 = process.env.AGENT_CHANNEL_ENCRYPTION_KEY;
  if (!keyB64) {
    // Dev fallback: use a fixed dev key (NOT for production!)
    if (process.env.NODE_ENV === "production") {
      throw new Error("AGENT_CHANNEL_ENCRYPTION_KEY is not set");
    }
    console.warn(
      "[agent-channel] AGENT_CHANNEL_ENCRYPTION_KEY not set — using dev fallback key. DO NOT use in production.",
    );
    return crypto.scryptSync("trustvault-p16-dev-fallback-key", "salt", 32);
  }
  return Buffer.from(keyB64, "base64");
}

/**
 * Encrypts a plaintext JSON-serializable value using AES-256-GCM.
 * Returns a base64-encoded string in the format: `iv:ciphertext:authTag`
 * (each component separately base64-encoded, joined by colons).
 */
export function encryptConfig(plaintext: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(plaintext);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a ciphertext produced by `encryptConfig`.
 * Returns the parsed plaintext object.
 */
export function decryptConfig<T = unknown>(ciphertext: string): T {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted config format — expected iv:ciphertext:authTag",
    );
  }

  const iv = Buffer.from(parts[0], "base64");
  const encrypted = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

/**
 * Encrypts a config object and wraps it as a JSONB-safe structure for storage.
 * Returns `{ encrypted: string }` suitable for the `config` column.
 */
export function encryptChannelConfig(
  plaintext: Record<string, unknown>,
): Record<string, unknown> {
  const encrypted = encryptConfig(plaintext);
  return { encrypted, _encrypted: true };
}

/**
 * Decrypts a stored channel config. If the config is not encrypted
 * (legacy or plaintext), returns it as-is.
 */
export function decryptChannelConfig<T = Record<string, unknown>>(
  stored: Record<string, unknown> | null | undefined,
): T {
  if (!stored || typeof stored !== "object") return {} as T;
  if (stored._encrypted && typeof stored.encrypted === "string") {
    return decryptConfig<T>(stored.encrypted as string);
  }
  // Not encrypted — return as-is
  return stored as unknown as T;
}

/**
 * Redacts sensitive fields from a stored channel config for API responses.
 * For WhatsApp: only returns `phone_number`.
 * For Telegram: only returns `bot_username`.
 */
export function redactChannelConfig(
  channelType: string,
  stored: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  let plain: Record<string, unknown> = {};
  try {
    plain = decryptChannelConfig(stored);
  } catch {
    // If decryption fails, return empty (don't leak ciphertext)
    return {};
  }

  if (channelType === "whatsapp") {
    return { phone_number: plain.phone_number ?? null };
  }
  if (channelType === "telegram") {
    return { bot_username: plain.bot_username ?? null };
  }
  return {};
}

// ---------------------------------------------------------------------------
// In-memory WhatsApp client pool
// ---------------------------------------------------------------------------

interface WhatsAppClientState {
  status: WhatsAppStatus["status"];
  qrCode?: string;
  phoneNumber?: string;
  client?: unknown; // whatsapp-web.js Client instance
}

const whatsappPool = new Map<string, WhatsAppClientState>();

function getWhatsAppState(agentId: string): WhatsAppClientState {
  if (!whatsappPool.has(agentId)) {
    whatsappPool.set(agentId, { status: "disconnected" });
  }
  return whatsappPool.get(agentId)!;
}

export function getWhatsAppStatus(agentId: string): WhatsAppStatus {
  const state = getWhatsAppState(agentId);
  return {
    status: state.status,
    qrCode: state.qrCode,
    phoneNumber: state.phoneNumber,
  };
}

export function setWhatsAppQRCode(agentId: string, qrCode: string): void {
  const state = getWhatsAppState(agentId);
  state.status = "qr_pending";
  state.qrCode = qrCode;
}

export function setWhatsAppConnecting(agentId: string): void {
  const state = getWhatsAppState(agentId);
  state.status = "connecting";
  state.qrCode = undefined;
}

export function setWhatsAppConnected(agentId: string, phoneNumber: string): void {
  const state = getWhatsAppState(agentId);
  state.status = "connected";
  state.phoneNumber = phoneNumber;
  state.qrCode = undefined;
}

export function setWhatsAppDisconnected(agentId: string): void {
  const state = getWhatsAppState(agentId);
  state.status = "disconnected";
  state.qrCode = undefined;
  state.phoneNumber = undefined;
}

export function getWhatsAppClient(agentId: string): unknown | undefined {
  return whatsappPool.get(agentId)?.client;
}

export function setWhatsAppClient(agentId: string, client: unknown): void {
  const state = getWhatsAppState(agentId);
  state.client = client;
}

export function destroyWhatsAppClient(agentId: string): void {
  const state = whatsappPool.get(agentId);
  if (state?.client) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.client as any).destroy?.();
    } catch {
      // Ignore destroy errors
    }
  }
  whatsappPool.delete(agentId);
}

// ---------------------------------------------------------------------------
// In-memory Telegram bot registry
// ---------------------------------------------------------------------------

interface TelegramBotState {
  botUsername?: string;
  botToken?: string; // encrypted at rest, held in memory during active connection
  status: "disconnected" | "connected";
}

const telegramPool = new Map<string, TelegramBotState>();

function getTelegramState(agentId: string): TelegramBotState {
  if (!telegramPool.has(agentId)) {
    telegramPool.set(agentId, { status: "disconnected" });
  }
  return telegramPool.get(agentId)!;
}

export function getTelegramStatus(agentId: string): TelegramStatus {
  const state = getTelegramState(agentId);
  return {
    status: state.status,
    botUsername: state.botUsername,
  };
}

export function setTelegramConnected(
  agentId: string,
  botUsername: string,
  botToken: string,
): void {
  const state = getTelegramState(agentId);
  state.status = "connected";
  state.botUsername = botUsername;
  state.botToken = botToken;
}

export function setTelegramDisconnected(agentId: string): void {
  const state = telegramPool.get(agentId);
  if (state) {
    telegramPool.delete(agentId);
  }
}

export function getTelegramBotToken(agentId: string): string | undefined {
  return telegramPool.get(agentId)?.botToken;
}

// ---------------------------------------------------------------------------
// Agent-scoped RAG retrieval
// ---------------------------------------------------------------------------

const MAX_RETRIEVED_CHUNKS = 5;

/**
 * Parses an embedding value from the DB (may be string or array).
 */
function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Computes cosine similarity between two vectors of equal length.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

/**
 * Retrieves relevant document chunks scoped to an agent's knowledge-base documents.
 * Uses the service-role client because channel messages arrive without a user session.
 */
export async function retrieveAgentContext(
  agentId: string,
  question: string,
): Promise<RetrievalResult[]> {
  const supabaseService = createServiceClient();

  // 1. Get agent's knowledge-base document IDs
  const { data: agentDocs } = await supabaseService
    .from("agent_documents")
    .select("document_id")
    .eq("agent_id", agentId);

  if (!agentDocs || agentDocs.length === 0) {
    return [];
  }

  const docIds = agentDocs.map((d) => d.document_id as string);

  // 2. Generate embedding for the question
  const questionEmbedding = await generateEmbedding(question);
  if (!questionEmbedding) {
    return [];
  }

  // 3. Fetch chunks for the agent's documents
  const { data: chunks, error } = await supabaseService
    .from("document_chunks")
    .select("id, document_id, chunk_index, content, embedding")
    .in("document_id", docIds);

  if (error || !chunks) {
    return [];
  }

  // 4. Compute similarity and rank
  const scored = chunks
    .map((chunk) => {
      const emb = parseEmbedding(chunk.embedding);
      if (!emb) return null;
      return {
        chunk_id: chunk.id as string,
        document_id: chunk.document_id as string,
        chunk_index: chunk.chunk_index as number,
        content: chunk.content as string,
        similarity: cosineSimilarity(questionEmbedding, emb),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_RETRIEVED_CHUNKS);

  // 5. Fetch document names
  const uniqueDocIds = [...new Set(scored.map((c) => c.document_id))];
  const docNameMap = new Map<string, string>();
  if (uniqueDocIds.length > 0) {
    const { data: docs } = await supabaseService
      .from("documents")
      .select("id, name")
      .in("id", uniqueDocIds);
    for (const doc of docs ?? []) {
      docNameMap.set(doc.id as string, doc.name as string);
    }
  }

  return scored.map((s) => ({
    ...s,
    document_name: docNameMap.get(s.document_id) ?? "Unknown Document",
  }));
}

/**
 * Fetches the conversation history for a session.
 */
async function getSessionHistory(
  sessionId: string,
  limit = 10,
): Promise<ChatMessage[]> {
  const supabaseService = createServiceClient();
  const { data: messages } = await supabaseService
    .from("agent_messages")
    .select("role, content, citations")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((messages ?? []) as Array<{
    role: string;
    content: string;
    citations: Citation[] | null;
  }>)
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      citations: m.citations,
    }));
}

// ---------------------------------------------------------------------------
// Agent response handler — called from all channel handlers
// ---------------------------------------------------------------------------

export interface AgentResponseResult {
  sessionId: string;
  messageId: string;
  response: string;
  citations: Citation[];
}

/**
 * Core message handler: runs the agent's RAG pipeline and returns the AI response.
 * Used by channel handlers (WhatsApp, Telegram) and the playground chat.
 *
 * This function:
 * 1. Fetches the agent's system prompt
 * 2. Retrieves relevant chunks from the agent's knowledge base
 * 3. Builds the RAG prompt with history
 * 4. Calls DeepSeek for a non-streaming completion
 * 5. Inserts the assistant message into agent_messages
 * 6. Returns the full response
 */
export async function handleAgentMessage(
  agentId: string,
  sessionId: string,
  userMessage: string,
  channelType: string | null,
  externalUserId: string | null,
): Promise<AgentResponseResult> {
  const supabaseService = createServiceClient();

  // 1. Fetch agent info
  const { data: agent } = await supabaseService
    .from("agents")
    .select("system_prompt, is_active, tenant_id")
    .eq("id", agentId)
    .single();

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // 2. Insert user message
  const { data: userMsg } = await supabaseService
    .from("agent_messages")
    .insert({
      agent_id: agentId,
      session_id: sessionId,
      role: "user",
      content: userMessage,
      channel: channelType,
      external_user_id: externalUserId,
    })
    .select("id")
    .single();

  // 3. RAG retrieval
  const retrievalResults = await retrieveAgentContext(agentId, userMessage);

  // 4. Fetch conversation history
  const history = await getSessionHistory(sessionId);

  // 5. Build prompt with agent's system prompt
  const { system, user } = buildAgentPrompt(
    agent.system_prompt as string,
    retrievalResults,
    history,
    userMessage,
  );

  // 6. Call DeepSeek (non-streaming for channel messages)
  const response = await chatCompletion(system, user);
  if (!response) {
    throw new Error("DeepSeek API returned no response");
  }

  // 7. Extract citations
  const citations = extractCitations(response, retrievalResults);

  // 8. Insert assistant message
  const { data: assistantMsg } = await supabaseService
    .from("agent_messages")
    .insert({
      agent_id: agentId,
      session_id: sessionId,
      role: "assistant",
      content: response,
      channel: channelType,
      external_user_id: externalUserId,
      citations: citations.length > 0 ? citations : null,
    })
    .select("id")
    .single();

  // 9. Update session updated_at
  await supabaseService
    .from("agent_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return {
    sessionId,
    messageId: assistantMsg?.id as string ?? "",
    response,
    citations,
  };
}

/**
 * Builds the system + user prompts for an agent chat completion.
 * Uses the agent's custom system prompt instead of the default assistant prompt.
 */
export function buildAgentPrompt(
  systemPrompt: string,
  contextChunks: RetrievalResult[],
  history: ChatMessage[],
  question: string,
): { system: string; user: string } {
  const { user } = buildRAGPrompt(contextChunks, history, question);
  return {
    system: systemPrompt,
    user,
  };
}

/**
 * Finds or creates an agent session for a channel user.
 */
export async function findOrCreateChannelSession(
  agentId: string,
  externalUserId: string,
  title: string,
): Promise<string> {
  const supabaseService = createServiceClient();

  // Look for existing session for this agent + external user
  const { data: existing } = await supabaseService
    .from("agent_messages")
    .select("session_id")
    .eq("agent_id", agentId)
    .eq("external_user_id", externalUserId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].session_id as string;
  }

  // Find the agent's creator to set as user_id on the session
  const { data: agent } = await supabaseService
    .from("agents")
    .select("created_by")
    .eq("id", agentId)
    .single();

  const userId = agent?.created_by as string;

  // Create a new session
  const { data: newSession } = await supabaseService
    .from("agent_sessions")
    .insert({
      agent_id: agentId,
      user_id: userId,
      title: title.slice(0, 100),
    })
    .select("id")
    .single();

  if (!newSession) {
    throw new Error("Failed to create agent session");
  }

  return newSession.id as string;
}

/**
 * Streaming handler for playground chat.
 * Reuses the assistant's SSE pattern but with agent-specific scoping.
 */
export async function streamAgentChat(
  agentId: string,
  sessionId: string,
  userMessage: string,
  userId: string,
  callbacks: {
    onToken: (token: string) => void;
    onComplete: (fullResponse: string) => void;
    onError: (error: Error) => void;
  },
): Promise<void> {
  let fullResponse = "";

  try {
    const supabaseService = createServiceClient();

    // 1. Fetch agent info
    const { data: agent } = await supabaseService
      .from("agents")
      .select("system_prompt, is_active")
      .eq("id", agentId)
      .single();

    if (!agent) {
      callbacks.onError(new Error(`Agent not found: ${agentId}`));
      return;
    }

    // 2. RAG retrieval
    const retrievalResults = await retrieveAgentContext(agentId, userMessage);

    // 3. Fetch conversation history
    const history = await getSessionHistory(sessionId);

    // 4. Build prompt
    const { system, user } = buildAgentPrompt(
      agent.system_prompt as string,
      retrievalResults,
      history,
      userMessage,
    );

    // 5. Stream response
    await chatCompletionStream(system, user, {
      onToken: (token: string) => {
        fullResponse += token;
        callbacks.onToken(token);
      },
      onComplete: async () => {
        try {
          // Extract citations
          const citations = extractCitations(fullResponse, retrievalResults);

          // Save assistant message
          const { data: assistantMsg } = await supabaseService
            .from("agent_messages")
            .insert({
              agent_id: agentId,
              session_id: sessionId,
              role: "assistant",
              content: fullResponse,
              channel: null,
              external_user_id: null,
              citations: citations.length > 0 ? citations : null,
            })
            .select("id")
            .single();

          // Update session
          await supabaseService
            .from("agent_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);

          callbacks.onComplete(fullResponse);
        } catch {
          callbacks.onComplete(fullResponse);
        }
      },
      onError: callbacks.onError,
    });
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

export { chatCompletionStream };
