// ---------------------------------------------------------------------------
// TrustVault P6 — AI Vault Assistant API client
// Thin typed wrappers around /api/assistant/* endpoints.
// Follows the exact same patterns as lib/api-client.ts.
// ---------------------------------------------------------------------------

import { ApiClientError } from "@/lib/api-client";

// Re-export ApiClientError for convenience
export { ApiClientError };

// ---- P6 Types (from docs/api-spec.md P6 Endpoints) ------------------------

export interface Citation {
  document_id: string;
  document_name: string;
  chunk_index: number;
  snippet: string;
}

export interface ChatSession {
  id: string;
  project_id?: string | null;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface IngestRequest {
  documentIds: string[];
}

export interface IngestResponse {
  ingested: number;
  failed: number;
  totalChunks: number;
  errors: string[];
}

export interface ChatRequest {
  sessionId?: string;
  projectId?: string;
  message: string;
}

export interface ListSessionsResponse {
  sessions: ChatSession[];
}

export interface GetSessionResponse {
  session: ChatSession;
  messages: ChatMessage[];
}

// ---- SSE event payloads ----------------------------------------------------

export interface SSETokenPayload {
  token: string;
}

export interface SSECitationsPayload {
  citations: Citation[];
}

export interface SSEDonePayload {
  sessionId: string;
  messageId: string;
}

export interface SSEErrorPayload {
  error: string;
  code: string;
}

// ---- Helpers ---------------------------------------------------------------

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await response.json();
    } catch {
      // response body is not JSON
    }
    throw new ApiClientError(
      body.error || `HTTP ${response.status}`,
      response.status,
      body.code,
    );
  }
  return response.json() as Promise<T>;
}

// ---- API Functions ---------------------------------------------------------

/**
 * POST /api/assistant/ingest — ingest documents into the vector store.
 */
export async function ingestDocuments(
  documentIds: string[],
): Promise<IngestResponse> {
  const response = await fetch("/api/assistant/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  return handleResponse<IngestResponse>(response);
}

/**
 * GET /api/assistant/sessions — list chat sessions for a project.
 */
export async function listSessions(
  projectId?: string,
): Promise<ListSessionsResponse> {
  const params = projectId
    ? `?project_id=${encodeURIComponent(projectId)}`
    : "";
  const response = await fetch(`/api/assistant/sessions${params}`);
  return handleResponse<ListSessionsResponse>(response);
}

/**
 * GET /api/assistant/sessions/[id] — get session with messages.
 */
export async function getSession(id: string): Promise<GetSessionResponse> {
  const response = await fetch(`/api/assistant/sessions/${encodeURIComponent(id)}`);
  return handleResponse<GetSessionResponse>(response);
}

/**
 * DELETE /api/assistant/sessions/[id] — delete a session.
 */
export async function deleteSession(
  id: string,
): Promise<{ deleted: boolean }> {
  const response = await fetch(
    `/api/assistant/sessions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return handleResponse<{ deleted: boolean }>(response);
}
