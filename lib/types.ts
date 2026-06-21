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
