// ---------------------------------------------------------------------------
// TrustVault API client — thin typed wrappers around /api/* endpoints.
// Consumes the API contract in docs/api-spec.md exactly.
// ---------------------------------------------------------------------------

// ---- Shared types from api-spec.md -----------------------------------------

export interface Document {
  id: string;
  name: string;
  storage_path: string;
  binary_hash: string;
  text_hash: string;
  extracted_text: string;
  file_size_bytes: number;
  tenant_id: string | null;
  project_id: string | null;
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

export interface CompareRequest {
  docAId: string;
  docBId: string;
}

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

/**
 * POST /api/documents — upload a PDF.
 * Content-Type: multipart/form-data (set automatically by the browser).
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

export interface ListDocumentsParams {
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * GET /api/documents — list all documents (newest first), optional search + pagination.
 */
export async function listDocuments(
  params?: ListDocumentsParams,
): Promise<ListDocumentsResponse> {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));

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

/**
 * POST /api/compare — run the 3-step document comparison pipeline.
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
