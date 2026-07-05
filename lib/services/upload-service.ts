// ---------------------------------------------------------------------------
// TrustVault — Document Upload Service
// ---------------------------------------------------------------------------
// The single upload pipeline shared by POST /api/documents and
// POST /api/documents/bulk. Each step is a small exported function
// (independently testable); `uploadDocument` composes them.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBinaryHash,
  extractFileText,
  computeTextHash,
  isAllowedMimeType,
  getFileExtension,
  validateFileSignature,
} from "@/lib/core";
import { consumeUsage, releaseUsage } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/client";
import { ingestDocument } from "@/lib/ai-assistant";
import { parseDocument } from "@/lib/db-schemas";

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface UploadFileInput {
  file: File;
  name?: string | null;
}

export type UploadValidationResult = {
  ok: true;
  mimeType: string;
  name: string;
  originalFilename: string;
} | {
  ok: false;
  error: string;
  code: string;
  status: number;
};

export interface DocumentHashes {
  binaryHash: string;
  textHash: string;
  extractedText: string;
}

export interface IngestionResult {
  status: string;
  chunks?: number;
  error?: string;
}

export type UploadedDocument = ReturnType<typeof parseDocument>;

export type UploadPipelineResult = {
  ok: true;
  document: UploadedDocument;
  ingestion: IngestionResult;
} | {
  ok: false;
  error: string;
  code: string;
  status: number;
};

// ════════════════════════════════════════════════════════════════════════════
// Step 1: Validate file metadata (MIME type, size, name)
// ════════════════════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 20_971_520; // 20 MB
const MAX_NAME_LENGTH = 255;

export function validateUpload(input: UploadFileInput): UploadValidationResult {
  const { file, name } = input;

  // MIME type
  if (!isAllowedMimeType(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type}`,
      code: "INVALID_FILE_TYPE",
      status: 415,
    };
  }

  // Size
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "File exceeds 20 MB limit", code: "FILE_TOO_LARGE", status: 413 };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty", code: "EMPTY_FILE", status: 400 };
  }

  // Name
  const originalFilename = file.name;
  const providedName = name && typeof name === "string" ? name.trim() : "";
  let trimmedName: string;
  if (providedName.length > 0) {
    trimmedName = providedName;
  } else {
    const dotIndex = originalFilename.lastIndexOf(".");
    trimmedName = dotIndex > 0 ? originalFilename.slice(0, dotIndex) : originalFilename;
  }
  if (trimmedName.length === 0) {
    return { ok: false, error: "Document name is empty", code: "MISSING_NAME", status: 400 };
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    trimmedName = trimmedName.slice(0, MAX_NAME_LENGTH);
  }

  return { ok: true, mimeType: file.type, name: trimmedName, originalFilename };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 2: Compute document hashes (binary + text)
// ════════════════════════════════════════════════════════════════════════════

export async function computeDocumentHashes(
  buffer: Buffer,
  mimeType: string,
): Promise<DocumentHashes> {
  const binaryHash = computeBinaryHash(buffer);
  const extractedText = await extractFileText(buffer, mimeType);
  const textHash = computeTextHash(extractedText);
  return { binaryHash, textHash, extractedText };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 3: Store file in Supabase Storage
// ════════════════════════════════════════════════════════════════════════════

/**
 * New uploads are tenant-prefixed (`uploads/{tenantId}/{year}/{uuid}{ext}`)
 * so path-scoped storage policies become possible later. Objects from before
 * P21 keep their `uploads/{year}/…` paths; lookups always go through the
 * `storage_path` column, so both layouts coexist.
 */
export function generateStoragePath(mimeType: string, tenantId?: string): string {
  const year = new Date().getUTCFullYear().toString();
  const fileUuid = randomUUID();
  const ext = getFileExtension(mimeType);
  return tenantId
    ? `uploads/${tenantId}/${year}/${fileUuid}${ext}`
    : `uploads/${year}/${fileUuid}${ext}`;
}

/**
 * Uploads via the service-role client: the storage bucket is locked to the
 * service role (P21), so this must only be called after the route has
 * verified auth, role, and tenant membership.
 */
export async function storeFile(
  buffer: ArrayBuffer,
  storagePath: string,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createServiceClient().storage
    .from("pdf-uploads")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (error) return { ok: false, error: "Failed to store file" };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Step 4: Insert document row
// ════════════════════════════════════════════════════════════════════════════

export interface InsertDocumentParams {
  supabase: SupabaseClient;
  name: string;
  originalFilename: string;
  storagePath: string;
  binaryHash: string;
  textHash: string;
  extractedText: string;
  fileSizeBytes: number;
  mimeType: string;
  tenantId: string;
  uploadedBy: string;
  description?: string;
}

export async function insertDocumentRecord(params: InsertDocumentParams) {
  const { data, error } = await params.supabase
    .from("documents")
    .insert({
      name: params.name,
      original_filename: params.originalFilename,
      storage_path: params.storagePath,
      binary_hash: params.binaryHash,
      text_hash: params.textHash,
      extracted_text: params.extractedText,
      file_size_bytes: params.fileSizeBytes,
      file_type: params.mimeType,
      tenant_id: params.tenantId,
      uploaded_by: params.uploadedBy,
      ...(params.description ? { description: params.description } : {}),
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return parseDocument(data);
}

// ════════════════════════════════════════════════════════════════════════════
// Step 5: Ingest for RAG (best-effort — never fails the upload)
// ════════════════════════════════════════════════════════════════════════════

export async function ingestUploadedDocument(
  supabase: SupabaseClient,
  documentId: string,
  extractedText: string,
): Promise<IngestionResult> {
  try {
    if (extractedText.trim().length === 0) {
      return { status: "empty_text", chunks: 0 };
    }

    const records = await ingestDocument(documentId, extractedText);
    if (records.length === 0) {
      return { status: "no_chunks", chunks: 0 };
    }

    const { error } = await supabase.from("document_chunks").insert(
      records.map((r) => ({
        document_id: r.document_id,
        chunk_index: r.chunk_index,
        content: r.content,
        embedding: r.embedding ? `[${r.embedding.join(",")}]` : null,
        token_count: r.token_count,
      })),
    );
    if (error) {
      return { status: "insert_error", error: JSON.stringify(error) };
    }

    return { status: "ok", chunks: records.length };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Full pipeline
// ════════════════════════════════════════════════════════════════════════════

export interface UploadPipelineParams {
  /** User-scoped client — DB writes stay under RLS. */
  supabase: SupabaseClient;
  file: File;
  name?: string | null;
  description?: string;
  tenantId: string;
  userId: string;
}

/**
 * Runs the complete upload pipeline for one file:
 *
 * 1. Metadata validation (MIME type, size, name)
 * 2. Magic-byte validation (content must match the declared MIME type)
 * 3. Atomic quota consumption (document count + storage bytes) — reserved
 *    up front so concurrent uploads cannot race past plan limits; released
 *    again if a later step fails
 * 4. Hashing + text extraction
 * 5. Storage upload (service role — bucket is locked down)
 * 6. Document row insert (user-scoped — RLS enforced)
 * 7. RAG ingestion (best-effort)
 *
 * The caller is responsible for auth, role, and tenant checks.
 */
export async function uploadDocument(
  params: UploadPipelineParams,
): Promise<UploadPipelineResult> {
  const { supabase, file, name, description, tenantId, userId } = params;

  // -- 1. Metadata validation ------------------------------------------------
  const validation = validateUpload({ file, name });
  if (!validation.ok) return validation;
  const { mimeType } = validation;

  // -- 2. Read bytes + magic-byte validation ----------------------------------
  const raw = await file.arrayBuffer();
  const buffer = Buffer.from(raw.slice(0));

  if (!validateFileSignature(buffer, mimeType)) {
    return {
      ok: false,
      error: `File content does not match the declared type (${mimeType})`,
      code: "INVALID_FILE_CONTENT",
      status: 415,
    };
  }

  // -- 3. Atomic quota reservation --------------------------------------------
  const usage = { documents: 1, storageBytes: buffer.length };
  const quota = await consumeUsage(supabase, tenantId, usage);
  if (!quota.allowed) {
    return {
      ok: false,
      error: quota.reason ?? "Plan limit reached",
      code: "PLAN_LIMIT_REACHED",
      status: 403,
    };
  }

  // -- 4. Hashing + extraction -----------------------------------------------
  const { binaryHash, textHash, extractedText } = await computeDocumentHashes(
    buffer,
    mimeType,
  );

  // -- 5. Storage upload -------------------------------------------------------
  const storagePath = generateStoragePath(mimeType, tenantId);
  const stored = await storeFile(raw, storagePath, mimeType);
  if (!stored.ok) {
    await releaseUsage(tenantId, usage);
    return { ok: false, error: stored.error, code: "STORAGE_ERROR", status: 500 };
  }

  // -- 6. Document row ---------------------------------------------------------
  const document = await insertDocumentRecord({
    supabase,
    name: validation.name,
    originalFilename: validation.originalFilename,
    storagePath,
    binaryHash,
    textHash,
    extractedText,
    fileSizeBytes: buffer.length,
    mimeType,
    tenantId,
    uploadedBy: userId,
    description,
  });

  if (!document) {
    await createServiceClient().storage.from("pdf-uploads").remove([storagePath]);
    await releaseUsage(tenantId, usage);
    return {
      ok: false,
      error: "Failed to save document record",
      code: "DB_ERROR",
      status: 500,
    };
  }

  // -- 7. RAG ingestion (best-effort) ------------------------------------------
  const ingestion = await ingestUploadedDocument(
    supabase,
    (document as { id: string }).id,
    extractedText,
  );

  return { ok: true, document, ingestion };
}
