import { createHash } from "node:crypto";
import { z } from "zod";
import type { AIVerdict } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters of PDF text embedded in the AI prompt before truncation. */
const MAX_TEXT_LENGTH = 40_000;

/** Marker appended to truncated text so the AI knows it was cut off. */
const TRUNCATION_MARKER = "\n[TRUNCATED]";

// ---------------------------------------------------------------------------
// Zod schema for AI response validation
// ---------------------------------------------------------------------------

export const AIVerdictSchema = z.object({
  verdict: z.enum(["MATERIAL", "NOT_MATERIAL"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** SHA-256 of raw file bytes. Returns a 64-character lowercase hex string. */
export function computeBinaryHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** SHA-256 of the extracted text string. Returns a 64-character lowercase hex string. */
export function computeTextHash(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

/**
 * Extracts text from a PDF buffer using `unpdf`.
 *
 * Returns the full extracted text as a single string.  On corrupt, empty, or
 * unparseable PDFs this function returns an empty string — it never throws.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // `unpdf` is marked as a server-external package — it is loaded at runtime
    // in the Node.js server environment (route handlers).
    // unpdf v1.x exports `extractText`, which accepts ArrayBuffer.
    const { extractText } = await import("unpdf");
    const result = await extractText(buffer.buffer as ArrayBuffer, {
      mergePages: true,
    });
    // When mergePages: true, `text` is a single string per the contract.
    return result.text;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Prompt construction for DeepSeek AI compare
// ---------------------------------------------------------------------------

/** System prompt sent verbatim to the AI (per the API contract). */
const COMPARE_SYSTEM_PROMPT = `You are a document-integrity reviewer. Your job is to assess whether a change between two versions
of a document is MATERIAL or NOT_MATERIAL.

A MATERIAL change alters the meaning, value, legal obligations, named parties, dates, amounts,
or other substantive content of the document.

A NOT_MATERIAL change is purely cosmetic: whitespace, punctuation, reformatting, or rewording
that does not alter the substance.

You must respond with a JSON object matching this exact schema:
{
  "verdict": "MATERIAL" | "NOT_MATERIAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "<one to three sentences explaining the verdict>"
}

Do not include any text outside the JSON object.`;

/** User prompt template — TEXT_A and TEXT_B placeholders are replaced at call time. */
const COMPARE_USER_TEMPLATE = `## Document A (baseline)

{TEXT_A}

## Document B (new version)

{TEXT_B}

Assess whether the change from Document A to Document B is MATERIAL or NOT_MATERIAL.`;

/**
 * Builds the system + user prompts for the DeepSeek materiality call.
 *
 * If either text exceeds `MAX_TEXT_LENGTH` characters it is truncated before embedding.
 * A `[TRUNCATED]` marker is appended so the AI is aware of the truncation.
 */
export function buildComparePrompt(
  textA: string,
  textB: string,
): { system: string; user: string } {
  const truncatedA = truncateIfNeeded(textA);
  const truncatedB = truncateIfNeeded(textB);

  const user = COMPARE_USER_TEMPLATE.replace("{TEXT_A}", truncatedA).replace(
    "{TEXT_B}",
    truncatedB,
  );

  return { system: COMPARE_SYSTEM_PROMPT, user };
}

/** Truncate text to MAX_TEXT_LENGTH and append a marker if shortened. */
function truncateIfNeeded(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH) + TRUNCATION_MARKER;
  }
  return text;
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

/**
 * Validates and parses a raw JSON object from the DeepSeek API response.
 *
 * @throws {z.ZodError} if the response does not match the `AIVerdict` schema.
 */
export function parseAIResponse(raw: unknown): AIVerdict {
  return AIVerdictSchema.parse(raw) as AIVerdict;
}
