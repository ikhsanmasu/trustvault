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
  original_filename?: string | null;  // P18: original uploaded filename
  storage_path: string;
  binary_hash: string;
  text_hash: string;
  extracted_text: string;
  file_size_bytes: number;
  file_type: string;
  tenant_id: string;
  project_id?: string | null; // deprecated — column dropped in P12, kept for backward compat
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
  project_id: string; // deprecated
  id: string;
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
  project_id?: string | null; // deprecated
  status: "ok" | "error";
  document?: Document;
  error?: string;
  code?: string;
  name?: string;
  ingestion?: { status: string; chunks?: number; error?: string };
}

export interface BulkUploadResult {
  project_id?: string | null; // deprecated
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
// P17: Usage Tracking + Billing
// ---------------------------------------------------------------------------

/** The plan tier assigned to a tenant. */
export type PlanType = "free" | "pro" | "enterprise";

/** Per-plan limits (mirrors the PLAN_LIMITS config in lib/rate-limit.ts). */
export interface PlanLimits {
  maxDocs: number;
  maxFileSize: number;   // bytes
  maxLlmCalls: number;
}

/** Usage statistics for the current billing period. */
export interface UsageStats {
  plan: PlanType;
  documents_used: number;
  documents_limit: number | null;   // null = unlimited
  llm_calls_used: number;
  llm_calls_limit: number | null;   // null = unlimited
  storage_bytes_used: number;
  storage_bytes_limit: number | null; // null = unlimited (no per-plan storage cap currently)
  usage_reset_at: string | null;    // ISO 8601 UTC, null if never reset
}

/** Response for GET /api/usage. */
export interface GetUsageResponse {
  usage: UsageStats;
}

// ---------------------------------------------------------------------------
// P23: Stripe Payment Integration
// ---------------------------------------------------------------------------

/** Request body for POST /api/stripe/checkout. */
export interface CreateCheckoutRequest {
  priceId: string;
}

/** Response for POST /api/stripe/checkout. */
export interface CreateCheckoutResponse {
  url: string;
}

/** Response for POST /api/stripe/billing. */
export interface CreateBillingResponse {
  url: string;
}

/** Subscription status derived from Stripe data. */
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing"
  | "none";

/** Billing info for the authenticated tenant. */
export interface BillingInfo {
  plan: PlanType;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null; // ISO 8601 UTC — when the current billing period ends
  cancelAtPeriodEnd: boolean;
}

/** Response for GET /api/stripe/billing (returns billing info for the tenant). */
export interface GetBillingResponse {
  billing: BillingInfo;
}
