// ---------------------------------------------------------------------------
// TrustVault API client — thin typed wrappers around /api/* endpoints.
// Consumes the API contract in docs/api-spec.md exactly.
// P3: Updated with new compare flow, dashboard, tenant, settings, multi-format.
// ---------------------------------------------------------------------------

// ---- Shared types from api-spec.md (P3) ------------------------------------

export type TenantRole = "owner" | "admin" | "editor" | "viewer";

export interface Profile {
  id: string;
  tenant_id: string;
  display_name: string | null;
  role: TenantRole;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

export interface Document {
  id: string;
  name: string;
  storage_path: string;
  binary_hash: string;
  text_hash: string;
  extracted_text: string;
  file_size_bytes: number;
  file_type: string;
  tenant_id: string;
  project_id?: string | null;
  uploaded_by: string;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  description?: string | null;
  notes?: string | null;
  // P5: Blockchain anchoring fields
  fingerprint?: string | null;
  chain?: string | null;
  tx_hash?: string | null;
  anchored_at?: string | null;
}

export interface CompareResult {
  docId: string;
  uploadedFileName: string;
  stage: "BINARY_MATCH" | "TEXT_MATCH" | "AI_COMPARE";
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reasoning: string | null;
}

export interface BulkUploadItem {
  status: "ok" | "error";
  document?: Document;
  error?: string;
  code?: string;
  name?: string;
}

export interface BulkUploadResult {
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
}

// Matches backend GET /api/dashboard response
export interface DashboardStats {
  document_count: number;
  total_storage_bytes: number;
  recent_documents: Document[];
  // P7: Enhanced analytics
  total_users: number;
  anchored_count: number;
  active_shares: number;
  documents_by_type: { type: string; count: number }[];
  documents_by_month: { month: string; count: number }[];
  total_chunks: number;
}

export interface UpdateProfileRequest {
  display_name: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UpdateTenantRequest {
  name: string;
}

// ---- Response types --------------------------------------------------------

export interface GetProfileResponse {
  profile: Profile;
}

export interface UpdateProfileResponse {
  profile: Profile;
}

export interface GetTenantResponse {
  tenant: Tenant;
}

export interface UpdateTenantResponse {
  tenant: Tenant;
}

export interface DashboardResponse {
  stats: DashboardStats;
}

export interface UploadResponse {
  document: Document;
}

export interface ListDocumentsResponse {
  documents: Document[];
  total: number;
}

export interface GetDocumentResponse {
  document: Document;
}

export type BulkUploadResponse = BulkUploadResult;

// ---- Error type ------------------------------------------------------------

export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await response.json();
    } catch {
      // response body is not JSON — fall through
    }
    throw new ApiClientError(
      body.error || `HTTP ${response.status}`,
      response.status,
      body.code,
    );
  }
  return response.json();
}

// ---- API functions ---------------------------------------------------------

// ===== Tenant =====

/**
 * GET /api/tenant — get current user's tenant.
 */
export async function getTenant(): Promise<GetTenantResponse> {
  const response = await fetch("/api/tenant");
  return handleResponse<GetTenantResponse>(response);
}

/**
 * PATCH /api/tenant — update tenant name.
 */
export async function updateTenant(
  data: UpdateTenantRequest,
): Promise<UpdateTenantResponse> {
  const response = await fetch("/api/tenant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<UpdateTenantResponse>(response);
}

// ===== Profile =====

/**
 * GET /api/profile — get current user's profile.
 */
export async function getProfile(): Promise<GetProfileResponse> {
  const response = await fetch("/api/profile");
  return handleResponse<GetProfileResponse>(response);
}

/**
 * PATCH /api/profile — update display_name.
 */
export async function updateProfile(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<UpdateProfileResponse>(response);
}

/**
 * PATCH /api/password — change password.
 */
export async function changePassword(
  data: ChangePasswordRequest,
): Promise<{ updated: boolean }> {
  const response = await fetch("/api/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<{ updated: boolean }>(response);
}

// ===== Dashboard =====

/**
 * GET /api/dashboard — get aggregate stats for the tenant.
 */
export async function getDashboard(): Promise<DashboardResponse> {
  const response = await fetch("/api/dashboard");
  return handleResponse<DashboardResponse>(response);
}

// ===== Documents =====

export interface ListDocumentsParams {
  file_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
  include_deleted?: boolean;
}

/**
 * POST /api/documents — upload a document.
 */
export async function uploadDocument(
  file: File,
  name: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);

  const response = await fetch("/api/documents", {
    method: "POST",
    body: formData,
  });

  return handleResponse<UploadResponse>(response);
}

/**
 * GET /api/documents — list documents. P3: project_id is optional, file_type filter added.
 */
export async function listDocuments(
  params?: ListDocumentsParams,
): Promise<ListDocumentsResponse> {
  const sp = new URLSearchParams();
  if (params?.file_type) sp.set("file_type", params.file_type);
  if (params?.search) sp.set("search", params.search);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  if (params?.include_deleted) sp.set("include_deleted", "true");

  const qs = sp.toString();
  const url = `/api/documents${qs ? `?${qs}` : ""}`;

  const response = await fetch(url);
  return handleResponse<ListDocumentsResponse>(response);
}

/**
 * GET /api/documents/[id] — fetch a single document by UUID.
 */
export async function getDocument(
  id: string,
): Promise<GetDocumentResponse> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`);
  return handleResponse<GetDocumentResponse>(response);
}

// ===== Bulk Upload =====

/**
 * POST /api/documents/bulk — upload multiple files to a project.
 */
export async function bulkUploadDocuments(
  files: File[],
  names: string[],
  description?: string,
): Promise<BulkUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("names", JSON.stringify(names));
  if (description) {
    formData.append("description", description);
  }

  const response = await fetch("/api/documents/bulk", {
    method: "POST",
    body: formData,
  });

  return handleResponse<BulkUploadResponse>(response);
}

// ===== Compare =====

/**
 * POST /api/compare — P3: compare stored doc vs ephemeral uploaded file.
 * Sends docId + file as multipart/form-data.
 */
export async function compareWithFile(
  docId: string,
  file: File,
): Promise<CompareResult> {
  const formData = new FormData();
  formData.append("docId", docId);
  formData.append("file", file);

  const response = await fetch("/api/compare", {
    method: "POST",
    body: formData,
  });

  return handleResponse<CompareResult>(response);
}

// ---- Backward compatibility (P2 consumers) ----------------------------------

/** @deprecated Use CompareResult from P3 endpoint. */
export type CompareResponse = CompareResult;

/** @deprecated Use compareWithFile. Sends P2-compatible JSON compare request (still supported by backend). */
export async function compareDocuments(
  docAId: string,
  docBId: string,
): Promise<CompareResult> {
  const response = await fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docAId, docBId }),
  });
  return handleResponse<CompareResult>(response);
}

/** PATCH /api/documents/:id — soft-delete a document. */
export async function deleteDocument(id: string): Promise<{ document: Document }> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete" }),
  });
  return handleResponse<{ document: Document }>(response);
}

/** PATCH /api/anchor/batch — anchor all eligible un-anchored documents. */
export async function anchorAllDocuments(): Promise<{ anchored: number; skipped: number; failed: number; errors: string[] }> {
  const response = await fetch("/api/anchor/batch", { method: "PATCH" });
  return handleResponse(response);
}

/** PATCH /api/documents/:id — restore a soft-deleted document. */
export async function restoreDocument(id: string): Promise<{ document: Document }> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restore" }),
  });
  return handleResponse<{ document: Document }>(response);
}

/** PATCH /api/documents/:id — edit document metadata (description, notes). */
export async function editDocument(
  id: string,
  data: { description?: string; notes?: string },
): Promise<{ document: Document }> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "edit", ...data }),
  });
  return handleResponse<{ document: Document }>(response);
}

// ===== P5: Blockchain Anchoring =====

export interface AnchorRequest {
  documentId: string;
}

export interface AnchorResponse {
  documentId: string;
  fingerprint: string;
  chain: string;
  txHash: string;
  anchoredAt: number;
  verified: boolean;
}

export interface VerifyRequest {
  documentId: string;
}

export interface VerifyResponse {
  documentId: string;
  intact: boolean;
  reason: "ok" | "not_anchored" | "hash_mismatch" | "not_on_chain";
  storedFingerprint: string | null;
  recomputedFingerprint: string;
  anchoredAt: number | null;
  txHash: string | null;
  chain: string | null;
}

/**
 * POST /api/anchor — anchor a document's fingerprint on-chain.
 */
export async function anchorDocument(
  documentId: string,
): Promise<AnchorResponse> {
  const response = await fetch("/api/anchor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  return handleResponse<AnchorResponse>(response);
}

/**
 * POST /api/verify — verify a document's on-chain anchoring status.
 */
export async function verifyDocument(
  documentId: string,
): Promise<VerifyResponse> {
  const response = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  return handleResponse<VerifyResponse>(response);
}

// ===== P8: Document Sharing =====

// Backend DB shape (shared with lib/types.ts)
export interface SharedLink {
  id: string;
  project_id?: string | null;
  document_ids: string[];
  token: string;
  created_by: string;
  allow_download: boolean;
  allow_chat: boolean;
  allow_anchor: boolean;
  allow_compare: boolean;
  title: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

// Frontend-compatible alias (kept for backward compat with components/hooks)
/** @deprecated Use SharedLink instead */
export type ShareLink = SharedLink;

/** @deprecated Use CreateShareRequest instead — kept for backward compat with share-modal */
export interface CreateShareRequestCompat {
  project_id?: string | null;
  title: string;
  document_ids: string[];
  allow_download: boolean;
  allow_chat: boolean;
  allow_anchor: boolean;
  allow_compare: boolean;
}

// New canonical request type (matches backend POST /api/share)
export interface CreateShareRequest {
  projectId?: string | null;
  documentIds: string[];
  allowDownload: boolean;
  allowChat: boolean;
  allowAnchor: boolean;
  allowCompare: boolean;
  title?: string;
}

export interface CreateShareResponse {
  share: SharedLink;
  url: string;
}

export interface ListSharesResponse {
  shares: SharedLink[];
}

// Frontend expects this shape from the public share page
export interface SharePublicData {
  share: {
    id: string;
    token: string;
    project_id?: string | null;
    document_ids: string[];
    title: string;
    allow_download: boolean;
    allow_chat: boolean;
    allow_anchor: boolean;
    allow_compare: boolean;
    is_active: boolean;
    created_at: string;
    expires_at: string | null;
  };
  documents: Document[];
}

/**
 * POST /api/share — create a share link.
 * Accepts both new (camelCase) and legacy (snake_case) request shapes.
 */
export async function createShare(
  data: CreateShareRequest | CreateShareRequestCompat,
): Promise<CreateShareResponse> {
  // Normalize legacy shape to canonical shape
  const body = "projectId" in data
    ? data
    : {
        projectId: (data as CreateShareRequestCompat).project_id,
        documentIds: (data as CreateShareRequestCompat).document_ids,
        allowDownload: (data as CreateShareRequestCompat).allow_download,
        allowChat: (data as CreateShareRequestCompat).allow_chat,
        allowAnchor: (data as CreateShareRequestCompat).allow_anchor ?? false,
        allowCompare: (data as CreateShareRequestCompat).allow_compare ?? false,
        title: (data as CreateShareRequestCompat).title,
      };
  const response = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<CreateShareResponse>(response);
}

/**
 * GET /api/share — list all share links.
 */
export async function listShares(): Promise<ListSharesResponse> {
  const response = await fetch("/api/share");
  return handleResponse<ListSharesResponse>(response);
}

/**
 * DELETE /api/share/[tokenOrId] — revoke a share link.
 * Accepts either the share's UUID id or its hex token.
 */
export async function revokeShare(tokenOrId: string): Promise<{ revoked: boolean }> {
  const response = await fetch(`/api/share/${encodeURIComponent(tokenOrId)}`, {
    method: "DELETE",
  });
  return handleResponse<{ revoked: boolean }>(response);
}

/**
 * GET /api/share/[token] — get public share details + documents (no auth required).
 */
export async function getShareByToken(
  token: string,
): Promise<SharePublicData> {
  const response = await fetch(`/api/share/${encodeURIComponent(token)}`);
  const raw = await handleResponse<{
    share: SharedLink;
    documents: Document[];
  }>(response);
  return raw;
}

// Also export under the spec name for direct use
export { getShareByToken as getPublicShare };

/**
 * POST /api/share/[token]/chat — chat with shared documents via SSE (no auth required).
 */
export function shareChat(
  token: string,
  message: string,
  {
    onToken,
    onDone,
    onError,
  }: {
    onToken: (token: string) => void;
    onDone: (sessionId: string, messageId: string) => void;
    onError: (error: string, code?: string) => void;
  },
): AbortController {
  const controller = new AbortController();

  fetch(`/api/share/${encodeURIComponent(token)}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        let body: { error?: string; code?: string } = {};
        try { body = await response.json(); } catch { /* ignore */ }
        onError(body.error || `HTTP ${response.status}`, body.code);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { onError("No response body"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // event type header — data follows
            continue;
          } else if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.token) onToken(payload.token);
              else if (payload.complete !== undefined) {
                // Public chat has no session/message persistence;
                // send placeholder IDs the frontend can use
                onDone("public-share", `msg-${Date.now()}`);
              } else if (payload.error) onError(payload.error, payload.code);
            } catch { /* ignore malformed */ }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const dataLine = buffer.split("\n").find((l) => l.startsWith("data: "));
        if (dataLine) {
          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (payload.complete !== undefined) {
              onDone("public-share", `msg-${Date.now()}`);
            } else if (payload.error) onError(payload.error, payload.code);
          } catch { /* ignore */ }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message || "Network error");
      }
    });

  return controller;
}

// ===== P14: Tenant-Level RBAC + Invitations =====

export interface TenantMember {
  id: string;
  email: string;
  display_name: string | null;
  role: TenantRole;
  created_at: string;
}

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface ListMembersResponse {
  members: TenantMember[];
  total: number;
}

export interface UpdateMemberRoleRequest {
  role: "admin" | "editor" | "viewer";
}

export interface UpdateMemberRoleResponse {
  member: TenantMember;
}

export interface InviteRequest {
  email: string;
  role: "admin" | "editor" | "viewer";
}

export interface InviteResponse {
  invitation: Invitation;
}

export interface JoinResponse {
  tenant_id: string;
  role: string;
}

export interface RemoveMemberResponse {
  removed: true;
}

/**
 * GET /api/tenant/members — list all members of the current user's tenant.
 */
export async function getTenantMembers(
  params?: { search?: string; limit?: number; offset?: number },
): Promise<ListMembersResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  const url = `/api/tenant/members${qs ? `?${qs}` : ""}`;
  const response = await fetch(url);
  return handleResponse<ListMembersResponse>(response);
}

/**
 * PATCH /api/tenant/members/[userId] — update a member's role.
 */
export async function updateMemberRole(
  userId: string,
  role: "admin" | "editor" | "viewer",
): Promise<UpdateMemberRoleResponse> {
  const response = await fetch(
    `/api/tenant/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  return handleResponse<UpdateMemberRoleResponse>(response);
}

/**
 * DELETE /api/tenant/members/[userId] — remove a member from the tenant.
 */
export async function removeMember(
  userId: string,
): Promise<RemoveMemberResponse> {
  const response = await fetch(
    `/api/tenant/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  return handleResponse<RemoveMemberResponse>(response);
}

/**
 * POST /api/tenant/invite — send an invitation to join the tenant.
 */
export async function inviteMember(
  data: InviteRequest,
): Promise<InviteResponse> {
  const response = await fetch("/api/tenant/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<InviteResponse>(response);
}

/**
 * GET /api/tenant/join — accept an invitation to join a tenant.
 */
export async function acceptInvitation(
  token: string,
): Promise<JoinResponse> {
  const response = await fetch(
    `/api/tenant/join?token=${encodeURIComponent(token)}`,
  );
  return handleResponse<JoinResponse>(response);
}

// ===== P16: Custom AI Agents + Multi-Channel =====

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  system_prompt: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentChannel {
  id: string;
  agent_id: string;
  channel_type: "whatsapp" | "telegram";
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface AgentWithDetails extends Agent {
  documents: Document[];
  channels: AgentChannel[];
}

export interface AgentSession {
  id: string;
  agent_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AgentCitation {
  document_id: string;
  document_name: string;
  chunk_index: number;
  snippet: string;
}

export interface AgentMessage {
  id: string;
  agent_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  channel: string | null;
  external_user_id: string | null;
  citations: AgentCitation[] | null;
  created_at: string;
}

export interface CreateAgentRequest {
  name: string;
  system_prompt: string;
  document_ids: string[];
}

export interface UpdateAgentRequest {
  name?: string;
  system_prompt?: string;
  document_ids?: string[];
  is_active?: boolean;
}

export interface AddChannelRequest {
  channel_type: "whatsapp" | "telegram";
  config: Record<string, unknown>;
}

export interface WhatsAppConnectResponse {
  status: "connected";
  phoneNumberId: string;
}

export interface WhatsAppStatusResponse {
  status: "connected" | "disconnected";
  phoneNumberId: string | null;
}

export interface TelegramConnectRequest {
  bot_token: string;
}

export interface TelegramConnectResponse {
  channel_id: string;
  bot_username: string;
  webhook_url: string;
}

export interface AgentChatRequest {
  session_id?: string;
  message: string;
}

export interface CreateAgentResponse {
  agent: AgentWithDetails;
}

export interface ListAgentsResponse {
  agents: Agent[];
  total: number;
}

export interface GetAgentResponse {
  agent: AgentWithDetails;
}

export interface UpdateAgentResponse {
  agent: AgentWithDetails;
}

export interface AddChannelResponse {
  channel: AgentChannel;
}

export interface ListAgentSessionsResponse {
  sessions: AgentSession[];
}

export interface GetAgentSessionResponse {
  session: AgentSession;
  messages: AgentMessage[];
}

/**
 * POST /api/agents — create a new custom AI agent.
 */
export async function createAgent(
  data: CreateAgentRequest,
): Promise<CreateAgentResponse> {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<CreateAgentResponse>(response);
}

/**
 * GET /api/agents — list all agents in the tenant.
 */
export async function listAgents(): Promise<ListAgentsResponse> {
  const response = await fetch("/api/agents");
  return handleResponse<ListAgentsResponse>(response);
}

/**
 * GET /api/agents/[id] — get full agent details with channels and documents.
 */
export async function getAgent(id: string): Promise<GetAgentResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(id)}`);
  return handleResponse<GetAgentResponse>(response);
}

/**
 * PATCH /api/agents/[id] — update agent (name, prompt, documents, active status).
 */
export async function updateAgent(
  id: string,
  data: UpdateAgentRequest,
): Promise<UpdateAgentResponse> {
  const response = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<UpdateAgentResponse>(response);
}

/**
 * DELETE /api/agents/[id] — delete an agent and all associated data.
 */
export async function deleteAgent(
  id: string,
): Promise<{ deleted: boolean }> {
  const response = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return handleResponse<{ deleted: boolean }>(response);
}

/**
 * POST /api/agents/[id]/channels — add a messaging channel to the agent.
 */
export async function addAgentChannel(
  agentId: string,
  data: AddChannelRequest,
): Promise<AddChannelResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/channels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return handleResponse<AddChannelResponse>(response);
}

/**
 * DELETE /api/agents/[id]/channels/[channelId] — remove a channel.
 */
export async function removeAgentChannel(
  agentId: string,
  channelId: string,
): Promise<{ deleted: boolean }> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/channels/${encodeURIComponent(channelId)}`,
    { method: "DELETE" },
  );
  return handleResponse<{ deleted: boolean }>(response);
}

/**
 * POST /api/agents/[id]/whatsapp/connect — connect via Meta Cloud API.
 */
export async function connectWhatsApp(
  agentId: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<WhatsAppConnectResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/whatsapp/connect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId, accessToken }),
    },
  );
  return handleResponse<WhatsAppConnectResponse>(response);
}

/**
 * POST /api/agents/[id]/whatsapp/disconnect — disconnect WhatsApp.
 */
export async function disconnectWhatsApp(
  agentId: string,
): Promise<{ status: string }> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/whatsapp/disconnect`,
    { method: "POST" },
  );
  return handleResponse<{ status: string }>(response);
}

/**
 * GET /api/agents/[id]/whatsapp/status — get WhatsApp connection status.
 */
export async function getWhatsAppStatus(
  agentId: string,
): Promise<WhatsAppStatusResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/whatsapp/status`,
  );
  return handleResponse<WhatsAppStatusResponse>(response);
}

/**
 * POST /api/agents/[id]/telegram/connect — connect Telegram bot.
 */
export async function connectTelegram(
  agentId: string,
  botToken: string,
): Promise<TelegramConnectResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/telegram/connect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_token: botToken }),
    },
  );
  return handleResponse<TelegramConnectResponse>(response);
}

/**
 * POST /api/agents/[id]/telegram/disconnect — disconnect Telegram bot.
 */
export async function disconnectTelegram(
  agentId: string,
): Promise<{ disconnected: boolean }> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/telegram/disconnect`,
    { method: "POST" },
  );
  return handleResponse<{ disconnected: boolean }>(response);
}

/**
 * GET /api/agents/[id]/chat/sessions — list playground sessions for an agent.
 */
export async function listAgentSessions(
  agentId: string,
): Promise<ListAgentSessionsResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/chat/sessions`,
  );
  return handleResponse<ListAgentSessionsResponse>(response);
}

/**
 * GET /api/agents/[id]/chat/sessions/[sessionId] — get a session with messages.
 */
export async function getAgentSession(
  agentId: string,
  sessionId: string,
): Promise<GetAgentSessionResponse> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/chat/sessions/${encodeURIComponent(sessionId)}`,
  );
  return handleResponse<GetAgentSessionResponse>(response);
}

/**
 * DELETE /api/agents/[id]/chat/sessions/[sessionId] — delete a session.
 */
export async function deleteAgentSession(
  agentId: string,
  sessionId: string,
): Promise<{ deleted: boolean }> {
  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/chat/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
  return handleResponse<{ deleted: boolean }>(response);
}

// ===== P17: Usage Tracking + Billing =====

export type PlanType = "free" | "pro" | "enterprise";

export interface UsageStats {
  plan: PlanType;
  documents_used: number;
  documents_limit: number | null;
  llm_calls_used: number;
  llm_calls_limit: number | null;
  storage_bytes_used: number;
  storage_bytes_limit: number | null;
  usage_reset_at: string | null;
}

export interface GetUsageResponse {
  usage: UsageStats;
}

/**
 * GET /api/usage — get usage stats for the current tenant.
 */
export async function getUsage(): Promise<GetUsageResponse> {
  const response = await fetch("/api/usage");
  return handleResponse<GetUsageResponse>(response);
}
