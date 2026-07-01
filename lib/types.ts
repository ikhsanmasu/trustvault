/** Shared TypeScript types for TrustVault P3. */

// ---------------------------------------------------------------------------
// Role type (RBAC)
// ---------------------------------------------------------------------------

export type Role = "admin" | "editor" | "viewer";

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
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Project Member
// ---------------------------------------------------------------------------

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Document (updated for P3 — file_type added)
// ---------------------------------------------------------------------------

export interface Document {
  id: string;
  name: string;
  storage_path: string;
  binary_hash: string;
  text_hash: string;
  extracted_text: string;
  file_size_bytes: number;
  file_type: string; // P3: tracked so downstream code knows the file format
  tenant_id: string;
  project_id: string;
  uploaded_by: string;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  // P5: blockchain anchoring (all nullable — only set after successful anchor)
  fingerprint?: string | null;  // 0x-prefixed keccak256 hash (66 chars)
  chain?: string | null;        // chain identifier (e.g. "anvil", "sepolia")
  tx_hash?: string | null;      // 0x-prefixed transaction hash (66 chars)
  anchored_at?: string | null;  // ISO 8601 timestamptz
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
  project_id: string;
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
}

export type BulkUploadResponse = BulkUploadResult;

// ---------------------------------------------------------------------------
// Dashboard (P3)
// ---------------------------------------------------------------------------

export interface DashboardStats {
  project_count: number;
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

export interface CreateProjectResponse {
  project: Project;
}

export interface ListProjectsResponse {
  projects: Project[];
  total: number;
}

export interface GetProjectResponse {
  project: Project;
}

export interface UpdateProjectResponse {
  project: Project;
}

export interface ListMembersResponse {
  members: ProjectMember[];
}

export interface AddMemberResponse {
  member: ProjectMember;
}

export interface UpdateMemberRoleResponse {
  member: ProjectMember;
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
  project_id: string;
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
  projectId: string;
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
  project_id: string;
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
  projectId: string;
  documentIds: string[];
  allowDownload: boolean;
  allowChat: boolean;
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
