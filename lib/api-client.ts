// ---------------------------------------------------------------------------
// TrustVault API client — thin typed wrappers around /api/* endpoints.
// Consumes the API contract in docs/api-spec.md exactly.
// P2: Updated with auth types, projects, bulk upload, and project-scoped docs.
// ---------------------------------------------------------------------------

// ---- Shared types from api-spec.md (P2) ------------------------------------

export interface Profile {
  id: string;
  tenant_id: string;
  display_name: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  created_at: string;
}

export type MemberRole = "admin" | "editor" | "viewer";

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
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
  tenant_id: string;
  project_id: string;
  uploaded_by: string;
  created_at: string;
}

export interface CompareResponse {
  docAId: string;
  docBId: string;
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
  project_id: string;
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
}

// ---- Request types ---------------------------------------------------------

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface AddMemberRequest {
  user_id: string;
  role: MemberRole;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

export interface CompareRequest {
  docAId: string;
  docBId: string;
}

// ---- Response types --------------------------------------------------------

export interface GetProfileResponse {
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

// ===== Profile =====

/**
 * GET /api/profile — get current user's profile.
 */
export async function getProfile(): Promise<GetProfileResponse> {
  const response = await fetch("/api/profile");
  return handleResponse<GetProfileResponse>(response);
}

// ===== Projects =====

/**
 * POST /api/projects — create a new project.
 */
export async function createProject(
  data: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<CreateProjectResponse>(response);
}

export interface ListProjectsParams {
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * GET /api/projects — list user's projects.
 */
export async function listProjects(
  params?: ListProjectsParams,
): Promise<ListProjectsResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));

  const qs = sp.toString();
  const url = `/api/projects${qs ? `?${qs}` : ""}`;

  const response = await fetch(url);
  return handleResponse<ListProjectsResponse>(response);
}

/**
 * GET /api/projects/[id] — get project details.
 */
export async function getProject(id: string): Promise<GetProjectResponse> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  return handleResponse<GetProjectResponse>(response);
}

/**
 * PATCH /api/projects/[id] — update project name/description.
 */
export async function updateProject(
  id: string,
  data: UpdateProjectRequest,
): Promise<UpdateProjectResponse> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<UpdateProjectResponse>(response);
}

/**
 * DELETE /api/projects/[id] — delete a project.
 */
export async function deleteProject(id: string): Promise<{ deleted: boolean }> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return handleResponse<{ deleted: boolean }>(response);
}

// ===== Project Members =====

/**
 * GET /api/projects/[id]/members — list project members.
 */
export async function listMembers(
  projectId: string,
): Promise<ListMembersResponse> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/members`,
  );
  return handleResponse<ListMembersResponse>(response);
}

/**
 * POST /api/projects/[id]/members — add a member to project.
 */
export async function addMember(
  projectId: string,
  data: AddMemberRequest,
): Promise<AddMemberResponse> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return handleResponse<AddMemberResponse>(response);
}

/**
 * PATCH /api/projects/[id]/members/[userId] — update a member's role.
 */
export async function updateMemberRole(
  projectId: string,
  userId: string,
  data: UpdateMemberRoleRequest,
): Promise<UpdateMemberRoleResponse> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  return handleResponse<UpdateMemberRoleResponse>(response);
}

/**
 * DELETE /api/projects/[id]/members/[userId] — remove a member.
 */
export async function removeMember(
  projectId: string,
  userId: string,
): Promise<{ removed: boolean }> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    },
  );
  return handleResponse<{ removed: boolean }>(response);
}

// ===== Documents =====

/**
 * POST /api/documents — upload a single PDF.
 * P2: Requires project_id.
 */
export async function uploadDocument(
  file: File,
  name: string,
  projectId: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  formData.append("project_id", projectId);

  const response = await fetch("/api/documents", {
    method: "POST",
    body: formData,
  });

  return handleResponse<UploadResponse>(response);
}

export interface ListDocumentsParams {
  project_id: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * GET /api/documents — list documents. P2: Requires project_id.
 */
export async function listDocuments(
  params: ListDocumentsParams,
): Promise<ListDocumentsResponse> {
  const sp = new URLSearchParams();
  sp.set("project_id", params.project_id);
  if (params.search) sp.set("search", params.search);
  if (params.limit !== undefined) sp.set("limit", String(params.limit));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));

  const url = `/api/documents?${sp.toString()}`;

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
 * POST /api/documents/bulk — upload multiple PDFs to a project.
 */
export async function bulkUploadDocuments(
  files: File[],
  names: string[],
  projectId: string,
): Promise<BulkUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("names", JSON.stringify(names));
  formData.append("project_id", projectId);

  const response = await fetch("/api/documents/bulk", {
    method: "POST",
    body: formData,
  });

  return handleResponse<BulkUploadResponse>(response);
}

// ===== Compare =====

/**
 * POST /api/compare — run the 3-step document comparison pipeline.
 * P2: Both documents must belong to the same project (enforced server-side).
 */
export async function compareDocuments(
  docAId: string,
  docBId: string,
): Promise<CompareResponse> {
  const response = await fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docAId, docBId } satisfies CompareRequest),
  });

  return handleResponse<CompareResponse>(response);
}
