/** Shared TypeScript types for TrustVault P14. */

// ---------------------------------------------------------------------------
// Role type (RBAC)
// ---------------------------------------------------------------------------

export type Role = "admin" | "editor" | "viewer";

// P14: Tenant-level role hierarchy: owner > admin > editor > viewer
export type TenantRole = "owner" | "admin" | "editor" | "viewer";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  tenant_id: string;
  display_name: string | null;
  role: TenantRole; // P14: tenant-level RBAC role
  created_at: string;
}

/** P3: request body for updating the current user's profile. */
export interface UpdateProfileRequest {
  display_name?: string | null;
}

// ---------------------------------------------------------------------------
// Tenant (P3)
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

/** P3: request body for updating the tenant name. */
export interface UpdateTenantRequest {
  name: string;
}

// ---------------------------------------------------------------------------
// Password (P3)
// ---------------------------------------------------------------------------

/** P3: request body for changing the user's password. */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

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
  // P9: user-editable metadata
  description?: string;
  notes?: string;
  // P5: blockchain anchoring (all nullable — only set after successful anchor)
  fingerprint?: string | null;  // 0x-prefixed keccak256 hash (66 chars)
  chain?: string | null;        // chain identifier (e.g. "anvil", "sepolia")
  tx_hash?: string | null;      // 0x-prefixed transaction hash (66 chars)
  anchored_at?: string | null;  // ISO 8601 timestamptz
}

// ---------------------------------------------------------------------------
// Project (P2 — kept for backward compat with eval tests)
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

// ---------------------------------------------------------------------------
// AI Verdict (P1 — unchanged)
// ---------------------------------------------------------------------------

export interface AIVerdict {
  verdict: "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export interface CompareRequest {
  docAId: string;
  docBId: string;
}

export interface CompareResponse {
  docAId: string;
  docBId: string;
  stage: "BINARY_MATCH" | "TEXT_MATCH" | "AI_COMPARE";
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reasoning: string | null;
}

// ---------------------------------------------------------------------------
// Bulk Upload
// ---------------------------------------------------------------------------

export interface BulkUploadItem {
  status: "ok" | "error";
  document?: Document;
  error?: string;
  code?: string;
  name?: string;
  ingestion?: { status: string; chunks?: number; error?: string };
}

export interface BulkUploadResult {
  project_id?: string | null;
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
}

export type BulkUploadResponse = BulkUploadResult;

// ---------------------------------------------------------------------------
// Dashboard (P3)
// ---------------------------------------------------------------------------

export interface DashboardStats {
  document_count: number;
  total_storage_bytes: number;
  recent_documents: Document[];
  // P7: Enhanced analytics (optional for backward compat with existing code)
  total_users?: number;
  anchored_count?: number;
  active_shares?: number;
  documents_by_type?: {
    type: string;
    count: number;
  }[];
  documents_by_month?: {
    month: string; // "2026-07"
    count: number;
  }[];
  total_chunks?: number;
}

// ---------------------------------------------------------------------------
// Generic response wrappers
// ---------------------------------------------------------------------------

export interface ErrorResponse {
  error: string;
  code?: string;
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

export interface GetProfileResponse {
  profile: Profile;
}

export interface UpdateProfileResponse {
  profile: Profile;
}

// -- P3 response types --

export interface DashboardResponse {
  stats: DashboardStats;
}

export interface GetTenantResponse {
  tenant: Tenant;
}

export interface UpdateTenantResponse {
  tenant: Tenant;
}

export interface ChangePasswordResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// P5: Blockchain Anchoring
// ---------------------------------------------------------------------------

export interface AnchorRequest {
  documentId: string;
}

export interface AnchorResponse {
  documentId: string;
  fingerprint: string;   // 0x-prefixed keccak256 hash (66 chars)
  chain: string;          // chain identifier (e.g. "anvil", "sepolia")
  txHash: string;         // 0x-prefixed transaction hash (66 chars)
  anchoredAt: number;     // unix timestamp (seconds) from the block
  verified: boolean;      // always true on successful anchor
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
  anchoredAt: number | null;    // unix timestamp from chain
  txHash: string | null;
  chain: string | null;
}

// ---------------------------------------------------------------------------
// P6: AI Vault Assistant
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// P8: Document Sharing
// ---------------------------------------------------------------------------

export interface SharedLink {
  id: string;
  project_id?: string | null;
  document_ids: string[];
  token: string;
  created_by: string;
  allow_download: boolean;
  allow_chat: boolean;
  title: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export interface CreateShareRequest {
  projectId?: string | null;
  documentIds: string[];
  allowDownload: boolean;
  allowChat: boolean;
  allowAnchor?: boolean;
  allowCompare?: boolean;
  title?: string;
}

export interface CreateShareResponse {
  share: SharedLink;
  url: string;
}

export interface ListSharesResponse {
  shares: SharedLink[];
}

export interface PublicShareResponse {
  share: SharedLink;
  documents: Document[];
}

export interface PublicChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface RevokeShareResponse {
  revoked: boolean;
}

// ---------------------------------------------------------------------------
// P14: Tenant-Level RBAC + Invitations
// ---------------------------------------------------------------------------

/** A member of the tenant, as returned by GET /api/tenant/members. */
export interface TenantMember {
  id: string; // auth.users.id
  email: string; // from auth.users
  display_name: string | null;
  role: TenantRole;
  created_at: string; // ISO 8601 UTC
}

/** An invitation to join a tenant. */
export interface Invitation {
  id: string; // UUID
  tenant_id: string; // UUID
  email: string;
  role: "admin" | "editor" | "viewer"; // owner not allowed via invitation
  created_by: string; // UUID of auth.users who sent the invite
  created_at: string; // ISO 8601 UTC
  expires_at: string; // ISO 8601 UTC (7 days after created_at)
  accepted_at: string | null; // ISO 8601 UTC, null if pending
}

/** Request body for POST /api/tenant/invite. */
export interface InviteRequest {
  email: string;
  role: "admin" | "editor" | "viewer"; // cannot be owner
}

/** Response for POST /api/tenant/invite. */
export interface InviteResponse {
  invitation: Invitation;
}

/** Request body for PATCH /api/tenant/members/[userId]. */
export interface UpdateMemberRoleRequest {
  role: "admin" | "editor" | "viewer"; // cannot set to owner
}

/** Response for PATCH /api/tenant/members/[userId]. */
export interface UpdateMemberRoleResponse {
  member: TenantMember;
}

/** Response for DELETE /api/tenant/members/[userId]. */
export interface RemoveMemberResponse {
  removed: true;
}

/** Response for GET /api/tenant/members. */
export interface ListMembersResponse {
  members: TenantMember[];
  total: number;
}

/** Response for GET /api/tenant/join. */
export interface JoinResponse {
  tenant_id: string; // UUID of the tenant the user joined
  role: string; // the role assigned
}

// ---------------------------------------------------------------------------
// P16: Custom AI Agents + Multi-Channel Integration
// ---------------------------------------------------------------------------

/** An AI agent created by a tenant member. */
export interface Agent {
  id: string;              // UUID
  tenant_id: string;       // UUID
  name: string;            // display name (1-255 chars)
  system_prompt: string;   // persona-defining system prompt
  created_by: string;      // UUID of auth.users
  is_active: boolean;      // whether the agent is active
  created_at: string;      // ISO 8601 UTC
  updated_at: string;      // ISO 8601 UTC
}

/** Agent with its knowledge-base documents and connected channels. */
export interface AgentWithDetails extends Agent {
  documents: Document[];
  channels: AgentChannel[];
}

/** A messaging channel connected to an agent. */
export interface AgentChannel {
  id: string;                   // UUID
  agent_id: string;             // UUID
  channel_type: "whatsapp" | "telegram";
  config: Record<string, unknown>;  // channel-specific config (secrets redacted)
  is_active: boolean;
  created_at: string;           // ISO 8601 UTC
}

/** A chat session for the agent playground. */
export interface AgentSession {
  id: string;              // UUID
  agent_id: string;        // UUID
  user_id: string;         // UUID of auth.users
  title: string;           // session display title
  created_at: string;      // ISO 8601 UTC
  updated_at: string;      // ISO 8601 UTC
}

/** A message within an agent session. */
export interface AgentMessage {
  id: string;                       // UUID
  agent_id: string;                 // UUID
  session_id: string;               // UUID
  role: "user" | "assistant";
  content: string;
  channel: string | null;           // null for playground, 'whatsapp', 'telegram'
  external_user_id: string | null;  // WhatsApp number or Telegram user ID
  citations: Citation[] | null;     // same shape as P6 Citation
  created_at: string;               // ISO 8601 UTC
}

/** Request body for POST /api/agents. */
export interface CreateAgentRequest {
  name: string;                // 1-255 chars
  system_prompt: string;       // 1-10000 chars
  document_ids: string[];      // UUIDs of knowledge-base documents (0-100)
}

/** Request body for PATCH /api/agents/[id]. */
export interface UpdateAgentRequest {
  name?: string;
  system_prompt?: string;
  document_ids?: string[];     // replaces entire knowledge base
  is_active?: boolean;
}

/** Request body for POST /api/agents/[id]/channels. */
export interface AddChannelRequest {
  channel_type: "whatsapp" | "telegram";
  config: Record<string, unknown>;
}

/** Request body for POST /api/agents/[id]/telegram/connect. */
export interface TelegramConnectRequest {
  bot_token: string;
}

/** Request body for POST /api/agents/[id]/chat. */
export interface AgentChatRequest {
  session_id?: string;     // existing session UUID; omit to create new
  message: string;         // user's question (1-4000 characters)
}

// ---- P16 Response Types ----

/** Response for POST /api/agents. */
export interface CreateAgentResponse {
  agent: AgentWithDetails;
}

/** Response for GET /api/agents. */
export interface ListAgentsResponse {
  agents: Agent[];
  total: number;
}

/** Response for GET /api/agents/[id]. */
export interface GetAgentResponse {
  agent: AgentWithDetails;
}

/** Response for PATCH /api/agents/[id]. */
export interface UpdateAgentResponse {
  agent: AgentWithDetails;
}

/** Response for DELETE /api/agents/[id]. */
export interface DeleteAgentResponse {
  deleted: true;
}

/** Response for POST /api/agents/[id]/channels. */
export interface AddChannelResponse {
  channel: AgentChannel;
}

/** Response for DELETE /api/agents/[id]/channels/[channelId]. */
export interface DeleteChannelResponse {
  deleted: true;
}

/** Request body for POST /api/agents/[id]/whatsapp/connect (Meta Cloud API). */
export interface WhatsAppConnectRequest {
  phoneNumberId: string;
  accessToken: string;
}

/** Response for POST /api/agents/[id]/whatsapp/connect. */
export interface WhatsAppConnectResponse {
  status: "connected";
  phoneNumberId: string;
}

/** Response for GET /api/agents/[id]/whatsapp/status. */
export interface WhatsAppStatusResponse {
  status: "connected" | "disconnected";
  phoneNumberId: string | null;
}

/** Response for POST /api/agents/[id]/whatsapp/disconnect. */
export interface WhatsAppDisconnectResponse {
  status: "disconnected";
}

/** Response for POST /api/agents/[id]/telegram/connect. */
export interface TelegramConnectResponse {
  channel_id: string;
  bot_username: string;        // from getMe()
  webhook_url: string;         // registered webhook URL
}

/** Response for POST /api/agents/[id]/telegram/disconnect. */
export interface TelegramDisconnectResponse {
  disconnected: true;
}

/** Response for GET /api/agents/[id]/chat/sessions. */
export interface ListAgentSessionsResponse {
  sessions: AgentSession[];
}

/** Response for GET /api/agents/[id]/chat/sessions/[sessionId]. */
export interface GetAgentSessionResponse {
  session: AgentSession;
  messages: AgentMessage[];
}

/** Response for DELETE /api/agents/[id]/chat/sessions/[sessionId]. */
export interface DeleteAgentSessionResponse {
  deleted: true;
}

/** Response for POST /api/webhook/telegram/[agentId]. */
export interface WebhookResponse {
  ok: boolean;
  error?: string;
}
