import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ZodError } from "zod";
import {
  buildComparePrompt,
  parseAIResponse,
  computeBinaryHash,
  computeTextHash,
  extractFileText,
  isAllowedMimeType,
} from "@/lib/core";
import { requireAuth } from "@/lib/supabase/auth";
import { checkLLMLimit, incrementUsage } from "@/lib/rate-limit";
import { safeError } from "@/lib/utils";
import { parseDocument } from "@/lib/db-schemas";
import type {
  CompareRequest,
  CompareResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loosely validates that a string looks like a UUID. */

// ---------------------------------------------------------------------------
// DeepSeek client (lazily initialized on first use)
// ---------------------------------------------------------------------------

let _deepseek: OpenAI | null = null;
function getDeepSeekClient(): OpenAI {
  if (!_deepseek) {
    _deepseek = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return _deepseek;
}

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
    completion = await getDeepSeekClient().chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: safeError("AI service unavailable", err), code: "AI_API_ERROR" },
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
    return NextResponse.json(
      { error: safeError("AI service error", err), code: "AI_API_ERROR" },
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
    if (!docAId || typeof docAId !== "string" || !isValidUUID(docAId)) {
      return NextResponse.json(
        { error: "docAId must be a valid UUID", code: "INVALID_DOC_A_ID" },
        { status: 400 },
      );
    }

    // -- Validate docBId ---------------------------------------------------
    if (!docBId || typeof docBId !== "string" || !isValidUUID(docBId)) {
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
    const docA = parseDocument(rowA);

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
    const docB = parseDocument(rowB);

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
    // P17: Check LLM limit for the tenant
    if (docA.tenant_id) {
      const llmCheck = await checkLLMLimit(supabase, docA.tenant_id);
      if (!llmCheck.allowed) {
        return NextResponse.json(
          { error: llmCheck.reason ?? "LLM call limit reached", code: "PLAN_LIMIT_REACHED" },
          { status: 403 },
        );
      }
      await incrementUsage(supabase, docA.tenant_id, "llm_calls", {
        endpoint: "compare",
        tokens: 0,
      });
    }
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
      !isValidUUID(docIdRaw.trim())
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

    if (!isAllowedMimeType(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}`, code: "INVALID_CONTENT_TYPE" },
        { status: 415 },
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
    const storedDoc = parseDocument(row);

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
    // P17: Check LLM limit for the tenant
    if (storedDoc.tenant_id) {
      const llmCheckB = await checkLLMLimit(supabase, storedDoc.tenant_id);
      if (!llmCheckB.allowed) {
        return NextResponse.json(
          { error: llmCheckB.reason ?? "LLM call limit reached", code: "PLAN_LIMIT_REACHED" },
          { status: 403 },
        );
      }
      await incrementUsage(supabase, storedDoc.tenant_id, "llm_calls", {
        endpoint: "compare",
        tokens: 0,
      });
    }
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
