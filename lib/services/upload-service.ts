// ---------------------------------------------------------------------------
// TrustVault — Document Upload Service
// ---------------------------------------------------------------------------
// Extracted from app/api/documents/route.ts (was 250+ lines).
// Each function has a single responsibility and is independently testable.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBinaryHash,
  extractFileText,
  computeTextHash,
  isAllowedMimeType,
  getFileExtension,
} from "@/lib/core";
import { checkUploadLimit, incrementUsage } from "@/lib/rate-limit";
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
  buffer: Buffer;
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

export interface StoredDocument {
  id: string;
  storagePath: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Step 1: Validate file (MIME type, size, name)
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
  if (trimmedName.length > MAX_NAME_LENGTH) {
    trimmedName = trimmedName.slice(0, MAX_NAME_LENGTH);
  }

  return { ok: true, mimeType: file.type, buffer: Buffer.alloc(0), name: trimmedName, originalFilename };
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

export function generateStoragePath(mimeType: string): string {
  const year = new Date().getUTCFullYear().toString();
  const fileUuid = randomUUID();
  const ext = getFileExtension(mimeType);
  return `uploads/${year}/${fileUuid}${ext}`;
}

export async function storeFile(
  supabase: SupabaseClient,
  buffer: ArrayBuffer,
  storagePath: string,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.storage
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
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return parseDocument(data);
}

// ════════════════════════════════════════════════════════════════════════════
// Step 5: Plan check + usage increment
// ════════════════════════════════════════════════════════════════════════════

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function enforceUploadPlan(
  supabase: SupabaseClient,
  tenantId: string,
  fileSize: number,
): Promise<PlanCheckResult> {
  const check = await checkUploadLimit(supabase, tenantId, fileSize);
  if (!check.allowed) return { allowed: false, reason: check.reason };

  await incrementUsage(supabase, tenantId, "documents", { amount: 1 });
  await incrementUsage(supabase, tenantId, "storage_bytes", { amount: fileSize });
  return { allowed: true };
}
