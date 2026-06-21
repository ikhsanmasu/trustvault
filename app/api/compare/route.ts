import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ZodError } from "zod";
import {
  buildComparePrompt,
  parseAIResponse,
  computeBinaryHash,
  computeTextHash,
  extractFileText,
} from "@/lib/core";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  CompareRequest,
  CompareResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loosely validates that a string looks like a UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// DeepSeek client (pointed at DeepSeek base URL)
// ---------------------------------------------------------------------------

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// ---------------------------------------------------------------------------
// AI call helper — shared by both compare flows
// ---------------------------------------------------------------------------

async function callAICompare(
  docAId: string,
  docBId: string,
  textA: string,
  textB: string,
): Promise<NextResponse<CompareResponse | ErrorResponse>> {
  const prompt = buildComparePrompt(textA, textB);

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "DeepSeek API request failed";
    return NextResponse.json(
      { error: message, code: "AI_API_ERROR" },
      { status: 500 },
    );
  }

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "AI returned an empty response", code: "AI_PARSE_ERROR" },
      { status: 500 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return NextResponse.json(
      { error: "AI response was not valid JSON", code: "AI_PARSE_ERROR" },
      { status: 500 },
    );
  }

  try {
    const aiVerdict = parseAIResponse(parsed);
    return NextResponse.json({
      docAId,
      docBId,
      stage: "AI_COMPARE",
      verdict: aiVerdict.verdict,
      confidence: aiVerdict.confidence,
      reasoning: aiVerdict.reasoning,
    } satisfies CompareResponse);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: "AI response did not match expected schema",
          code: "AI_PARSE_ERROR",
        },
        { status: 500 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Unexpected error in AI response";
    return NextResponse.json(
      { error: message, code: "AI_API_ERROR" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/compare
//
// Supports TWO flows (P3):
//
// Flow A (P1/P2 — persisted):  Content-Type: application/json
//   Body: { docAId: UUID, docBId: UUID }
//   Both documents must exist in the database and belong to the same project.
//
// Flow B (P3 — ephemeral):    Content-Type: multipart/form-data
//   Fields: docId (UUID), file (File)
//   The uploaded file is compared against the stored document WITHOUT being
//   persisted. The file is hashed and its text extracted in-memory only.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CompareResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const contentType = request.headers.get("content-type") ?? "";

  // =========================================================================
  // FLOW A: JSON body — compare two stored documents (P1/P2)
  // =========================================================================
  if (contentType.includes("application/json")) {
    let body: CompareRequest;
    try {
      body = (await request.json()) as CompareRequest;
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { docAId, docBId } = body;

    // -- Validate docAId ---------------------------------------------------
    if (!docAId || typeof docAId !== "string" || !UUID_RE.test(docAId)) {
      return NextResponse.json(
        { error: "docAId must be a valid UUID", code: "INVALID_DOC_A_ID" },
        { status: 400 },
      );
    }

    // -- Validate docBId ---------------------------------------------------
    if (!docBId || typeof docBId !== "string" || !UUID_RE.test(docBId)) {
      return NextResponse.json(
        { error: "docBId must be a valid UUID", code: "INVALID_DOC_B_ID" },
        { status: 400 },
      );
    }

    // -- Check for same document --------------------------------------------
    if (docAId === docBId) {
      return NextResponse.json(
        { error: "Cannot compare a document to itself", code: "SAME_DOCUMENT" },
        { status: 400 },
      );
    }

    // -- Fetch document A (user-scoped, RLS-enforced) -----------------------
    const { data: rowA, error: errorA } = await supabase
      .from("documents")
      .select("*")
      .eq("id", docAId)
      .single();

    if (errorA || !rowA) {
      return NextResponse.json(
        {
          error: `Document A not found: ${docAId}`,
          code: "DOC_A_NOT_FOUND",
        },
        { status: 404 },
      );
    }
    const docA = rowA as unknown as Document;

    // -- Fetch document B (user-scoped, RLS-enforced) -----------------------
    const { data: rowB, error: errorB } = await supabase
      .from("documents")
      .select("*")
      .eq("id", docBId)
      .single();

    if (errorB || !rowB) {
      return NextResponse.json(
        {
          error: `Document B not found: ${docBId}`,
          code: "DOC_B_NOT_FOUND",
        },
        { status: 404 },
      );
    }
    const docB = rowB as unknown as Document;

    // -- Cross-project check ------------------------------------------------
    if (docA.project_id !== docB.project_id) {
      return NextResponse.json(
        {
          error:
            "Documents belong to different projects -- cross-project comparison is not supported",
          code: "CROSS_PROJECT_COMPARE",
        },
        { status: 400 },
      );
    }

    // -- Step 1: Binary hash ------------------------------------------------
    if (docA.binary_hash === docB.binary_hash) {
      return NextResponse.json({
        docAId,
        docBId,
        stage: "BINARY_MATCH",
        verdict: "IDENTICAL",
        confidence: null,
        reasoning: null,
      } satisfies CompareResponse);
    }

    // -- Step 2: Text hash --------------------------------------------------
    if (docA.text_hash === docB.text_hash) {
      return NextResponse.json({
        docAId,
        docBId,
        stage: "TEXT_MATCH",
        verdict: "BINARY_DIFF_ONLY",
        confidence: null,
        reasoning: null,
      } satisfies CompareResponse);
    }

    // -- Step 3: AI compare -------------------------------------------------
    return callAICompare(
      docAId,
      docBId,
      docA.extracted_text,
      docB.extracted_text,
    );
  }

  // =========================================================================
  // FLOW B: multipart — ephemeral file compare against stored doc (P3)
  // =========================================================================
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const docIdRaw = formData.get("docId");
    const file = formData.get("file");

    // -- Validate docId ----------------------------------------------------
    if (
      !docIdRaw ||
      typeof docIdRaw !== "string" ||
      !UUID_RE.test(docIdRaw.trim())
    ) {
      return NextResponse.json(
        {
          error: "docId must be a valid UUID",
          code: "INVALID_DOC_ID",
        },
        { status: 400 },
      );
    }
    const docId = docIdRaw.trim();

    // -- Validate file ------------------------------------------------------
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided for comparison", code: "MISSING_FILE" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty", code: "EMPTY_FILE" },
        { status: 400 },
      );
    }

    const MAX_EPHEMERAL_SIZE = 20_971_520; // 20 MB
    if (file.size > MAX_EPHEMERAL_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 20 MB limit", code: "FILE_TOO_LARGE" },
        { status: 413 },
      );
    }

    // -- Fetch stored document (user-scoped, RLS-enforced) ------------------
    const { data: row, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", docId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { error: `Document not found: ${docId}`, code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    const storedDoc = row as unknown as Document;

    // -- Process the ephemeral file (in-memory only, never persisted) -------
    const raw = await file.arrayBuffer();
    const buffer = Buffer.from(raw as ArrayBuffer);

    const ephemeralBinaryHash = computeBinaryHash(buffer);
    const ephemeralText = await extractFileText(buffer, file.type);
    const ephemeralTextHash = computeTextHash(ephemeralText);

    // Use a sentinel ID for the ephemeral document in the response
    const ephemeralId = "ephemeral";

    // -- Step 1: Binary hash ------------------------------------------------
    if (storedDoc.binary_hash === ephemeralBinaryHash) {
      return NextResponse.json({
        docAId: docId,
        docBId: ephemeralId,
        stage: "BINARY_MATCH",
        verdict: "IDENTICAL",
        confidence: null,
        reasoning: null,
      } satisfies CompareResponse);
    }

    // -- Step 2: Text hash --------------------------------------------------
    if (storedDoc.text_hash === ephemeralTextHash) {
      return NextResponse.json({
        docAId: docId,
        docBId: ephemeralId,
        stage: "TEXT_MATCH",
        verdict: "BINARY_DIFF_ONLY",
        confidence: null,
        reasoning: null,
      } satisfies CompareResponse);
    }

    // -- Step 3: AI compare -------------------------------------------------
    return callAICompare(
      docId,
      ephemeralId,
      storedDoc.extracted_text,
      ephemeralText,
    );
  }

  // -- Unsupported content type -----------------------------------------------
  return NextResponse.json(
    {
      error:
        "Unsupported Content-Type. Use application/json (compare two stored documents) or multipart/form-data (ephemeral compare against stored document).",
      code: "INVALID_CONTENT_TYPE",
    },
    { status: 415 },
  );
}
