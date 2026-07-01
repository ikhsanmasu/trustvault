import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import { ingestDocument } from "@/lib/ai-assistant";
import type {
  IngestRequest,
  IngestResponse,
  ErrorResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DOCUMENT_IDS = 50;

/**
 * Converts a number array to the pgvector text format `[0.1,0.2,0.3]`.
 */
function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// ---------------------------------------------------------------------------
// POST /api/assistant/ingest
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IngestResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Parse & validate body ---------------------------------------------
  let body: IngestRequest;
  try {
    body = (await request.json()) as IngestRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_DOCUMENT_IDS" },
      { status: 400 },
    );
  }

  const { documentIds } = body;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json(
      {
        error: "documentIds must be a non-empty array",
        code: "INVALID_DOCUMENT_IDS",
      },
      { status: 400 },
    );
  }

  if (documentIds.length > MAX_DOCUMENT_IDS) {
    return NextResponse.json(
      {
        error: `documentIds must contain at most ${MAX_DOCUMENT_IDS} entries`,
        code: "INVALID_DOCUMENT_IDS",
      },
      { status: 400 },
    );
  }

  for (let i = 0; i < documentIds.length; i++) {
    if (typeof documentIds[i] !== "string" || !UUID_RE.test(documentIds[i])) {
      return NextResponse.json(
        {
          error: `Invalid UUID in documentIds at index ${i}: ${String(documentIds[i])}`,
          code: "INVALID_DOCUMENT_ID",
        },
        { status: 400 },
      );
    }
  }

  // -- 3. Process each document ---------------------------------------------
  let ingested = 0;
  let failed = 0;
  let totalChunks = 0;
  const errors: string[] = [];

  for (const documentId of documentIds) {
    try {
      // 3a. Fetch document (RLS ensures access)
      const { data: document, error: docError } = await supabase
        .from("documents")
        .select("id, project_id, extracted_text, name")
        .eq("id", documentId)
        .single();

      if (docError || !document) {
        failed++;
        errors.push(`Document ${documentId}: NOT_FOUND`);
        continue;
      }

      // 3b. Check if already chunked (idempotent skip)
      const { count: chunkCount } = await supabase
        .from("document_chunks")
        .select("*", { count: "exact", head: true })
        .eq("document_id", documentId);

      if (chunkCount && chunkCount > 0) {
        // Already ingested -- skip (not an error)
        ingested++;
        continue;
      }

      // 3c. Role check: must be admin or editor
      const roleCheck = await requireProjectRole(
        supabase,
        user.id,
        document.project_id as string,
        ["admin", "editor"],
      );
      if (!roleCheck.ok) {
        failed++;
        errors.push(`Document ${documentId}: FORBIDDEN`);
        continue;
      }

      // 3d. Check for empty text
      const extractedText = document.extracted_text as string;
      if (!extractedText || extractedText.trim().length === 0) {
        failed++;
        errors.push(`Document ${documentId}: EMPTY_TEXT`);
        continue;
      }

      // 3e. Chunk + embed via core library
      const chunkRecords = await ingestDocument(
        documentId,
        document.project_id as string,
        extractedText,
      );

      if (chunkRecords.length === 0) {
        failed++;
        errors.push(`Document ${documentId}: EMBEDDING_ERROR`);
        continue;
      }

      // 3f. Check if any embeddings failed
      const failedEmbeddings = chunkRecords.filter((c) => c.embedding === null);
      if (failedEmbeddings.length === chunkRecords.length) {
        // All embeddings failed
        failed++;
        errors.push(`Document ${documentId}: EMBEDDING_ERROR`);
        continue;
      }

      // 3g. Insert into document_chunks (skip chunks with null embeddings)
      const insertRecords = chunkRecords
        .filter((c) => c.embedding !== null)
        .map((c) => ({
          document_id: c.document_id,
          project_id: c.project_id,
          chunk_index: c.chunk_index,
          content: c.content,
          embedding: toPgVector(c.embedding!), // pgvector text format
          token_count: c.token_count,
        }));

      if (insertRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("document_chunks")
          .insert(insertRecords);

        if (insertError) {
          failed++;
          errors.push(`Document ${documentId}: DB_ERROR`);
          continue;
        }

        totalChunks += insertRecords.length;
      }

      ingested++;
    } catch {
      failed++;
      errors.push(`Document ${documentId}: INTERNAL_ERROR`);
    }
  }

  return NextResponse.json({
    ingested,
    failed,
    totalChunks,
    errors,
  });
}
