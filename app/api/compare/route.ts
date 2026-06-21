import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ZodError } from "zod";
import { buildComparePrompt, parseAIResponse } from "@/lib/core";
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
// POST /api/compare (P2: auth required + cross-project block)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CompareResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // ── 2. Parse request body ──────────────────────────────────────────────
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

  // ── 3. Validate docAId ─────────────────────────────────────────────────
  if (!docAId || typeof docAId !== "string" || !UUID_RE.test(docAId)) {
    return NextResponse.json(
      { error: "docAId must be a valid UUID", code: "INVALID_DOC_A_ID" },
      { status: 400 },
    );
  }

  // ── 4. Validate docBId ─────────────────────────────────────────────────
  if (!docBId || typeof docBId !== "string" || !UUID_RE.test(docBId)) {
    return NextResponse.json(
      { error: "docBId must be a valid UUID", code: "INVALID_DOC_B_ID" },
      { status: 400 },
    );
  }

  // ── 5. Check for same document ─────────────────────────────────────────
  if (docAId === docBId) {
    return NextResponse.json(
      {
        error: "Cannot compare a document to itself",
        code: "SAME_DOCUMENT",
      },
      { status: 400 },
    );
  }

  // ── 6. Fetch document A (user-scoped client, RLS-enforced) ─────────────
  const { data: rowA, error: errorA } = await supabase
    .from("documents")
    .select("*")
    .eq("id", docAId)
    .single();

  if (errorA || !rowA) {
    return NextResponse.json(
      { error: `Document A not found: ${docAId}`, code: "DOC_A_NOT_FOUND" },
      { status: 404 },
    );
  }
  const docA = rowA as unknown as Document;

  // ── 7. Fetch document B (user-scoped client, RLS-enforced) ─────────────
  const { data: rowB, error: errorB } = await supabase
    .from("documents")
    .select("*")
    .eq("id", docBId)
    .single();

  if (errorB || !rowB) {
    return NextResponse.json(
      { error: `Document B not found: ${docBId}`, code: "DOC_B_NOT_FOUND" },
      { status: 404 },
    );
  }
  const docB = rowB as unknown as Document;

  // ── 8. Cross-project check (P2: both docs must be in the same project) ─
  if (docA.project_id !== docB.project_id) {
    return NextResponse.json(
      {
        error: "Documents belong to different projects — cross-project comparison is not supported",
        code: "CROSS_PROJECT_COMPARE",
      },
      { status: 400 },
    );
  }

  // ── Step 1: Binary hash check ──────────────────────────────────────────
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

  // ── Step 2: Text hash check ────────────────────────────────────────────
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

  // ── Step 3: AI compare (only reachable if text hashes differ) ──────────
  const prompt = buildComparePrompt(docA.extracted_text, docB.extracted_text);

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

  // ── Extract content from the response ──────────────────────────────────
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "AI returned an empty response", code: "AI_PARSE_ERROR" },
      { status: 500 },
    );
  }

  // ── Parse and validate the JSON response ───────────────────────────────
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
        { error: "AI response did not match expected schema", code: "AI_PARSE_ERROR" },
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
