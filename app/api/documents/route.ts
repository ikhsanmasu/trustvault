import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { computeBinaryHash, extractPdfText, computeTextHash } from "@/lib/core";
import { supabase } from "@/lib/supabase/client";
import type {
  UploadResponse,
  ListDocumentsResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 20_971_520; // 20 MB in bytes
const MAX_NAME_LENGTH = 255;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// POST /api/documents — Upload a PDF document
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<UploadResponse | ErrorResponse>> {
  // ── 1. Parse multipart form data ──────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data", code: "MISSING_FILE" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const name = formData.get("name");

  // ── 2. Validate file presence ─────────────────────────────────────────
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided", code: "MISSING_FILE" },
      { status: 400 },
    );
  }

  // ── 3. Validate file type ─────────────────────────────────────────────
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "File must be a PDF", code: "INVALID_FILE_TYPE" },
      { status: 415 },
    );
  }

  // ── 4. Validate file size ─────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 20 MB limit", code: "FILE_TOO_LARGE" },
      { status: 413 },
    );
  }

  // ── 5. Validate name ──────────────────────────────────────────────────
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Document name is required", code: "MISSING_NAME" },
      { status: 400 },
    );
  }

  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `Document name must be ${MAX_NAME_LENGTH} characters or fewer`,
        code: "NAME_TOO_LONG",
      },
      { status: 400 },
    );
  }

  // ── 6. Read file into buffer ──────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // ── 7–9. Compute hashes and extract text ──────────────────────────────
  const binaryHash = computeBinaryHash(buffer);
  const extractedText = await extractPdfText(buffer);
  const textHash = computeTextHash(extractedText);

  // ── 10. Generate storage path ─────────────────────────────────────────
  const year = new Date().getUTCFullYear().toString();
  const fileUuid = randomUUID();
  const storagePath = `uploads/${year}/${fileUuid}.pdf`;

  // ── 11. Upload to Supabase Storage ────────────────────────────────────
  const { error: storageError } = await supabase.storage
    .from("pdf-uploads")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json(
      { error: "Failed to store file", code: "STORAGE_ERROR" },
      { status: 500 },
    );
  }

  // ── 12. Insert database row ───────────────────────────────────────────
  const { data: document, error: dbError } = await supabase
    .from("documents")
    .insert({
      name: trimmedName,
      storage_path: storagePath,
      binary_hash: binaryHash,
      text_hash: textHash,
      extracted_text: extractedText,
      file_size_bytes: buffer.length,
    })
    .select("*")
    .single();

  if (dbError || !document) {
    return NextResponse.json(
      { error: "Failed to save document record", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { document: document as unknown as Document },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/documents — List documents
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListDocumentsResponse | ErrorResponse>> {
  const searchParams = request.nextUrl.searchParams;

  // ── Parse & validate query parameters ─────────────────────────────────
  const search = searchParams.get("search")?.trim() || undefined;

  const limitRaw = searchParams.get("limit") ?? String(DEFAULT_LIMIT);
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || !Number.isInteger(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer", code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }
  if (limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must not exceed ${MAX_LIMIT}`, code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }

  const offsetRaw = searchParams.get("offset") ?? "0";
  const offset = parseInt(offsetRaw, 10);
  if (isNaN(offset) || !Number.isInteger(offset) || offset < 0) {
    return NextResponse.json(
      {
        error: "offset must be a non-negative integer",
        code: "INVALID_OFFSET",
      },
      { status: 400 },
    );
  }

  // ── Build query ───────────────────────────────────────────────────────
  let query = supabase.from("documents").select("*", { count: "exact" });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch documents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documents: (data ?? []) as unknown as Document[],
    total: count ?? 0,
  });
}
