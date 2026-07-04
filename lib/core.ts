import { createHash } from "node:crypto";
import { z } from "zod";
import type { AIVerdict } from "./types";

// P5: blockchain fingerprint — thin re-export from lib/anchor.ts
export { computeFingerprint } from "./anchor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters of document text embedded in the AI prompt before truncation. */
const MAX_TEXT_LENGTH = 40_000;

/** Maximum file size (bytes) accepted for text extraction. Larger files are rejected. */
const MAX_EXTRACTION_SIZE = 50 * 1024 * 1024; // 50 MB

/** Marker appended to truncated text so the AI knows it was cut off. */
const TRUNCATION_MARKER = "\n[TRUNCATED]";

/**
 * All MIME types accepted for upload and text extraction (P3: 14 types).
 *
 * Newly accepted in P3 beyond application/pdf:
 * - Plain text formats: text/plain, text/csv, text/html, text/markdown
 * - Data formats: application/json, text/xml, application/xml
 * - Office Open XML: docx, xlsx
 * - Legacy Office: doc, xls
 * - Rich text: application/rtf
 * - OpenDocument: odt
 */
export const ALLOWED_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/xml",
  "application/json",
  "application/xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Maps each allowed MIME type to its file extension (including the dot). */
export const MIME_TO_EXTENSION: Record<AllowedMimeType, string> = {
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/markdown": ".md",
  "text/xml": ".xml",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/msword": ".doc",
  "application/rtf": ".rtf",
  "application/vnd.oasis.opendocument.text": ".odt",
};

/**
 * Returns true if `mimeType` is one of the 14 allowed MIME types (P3).
 */
export function isAllowedMimeType(
  mimeType: string,
): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Returns the file extension for a known MIME type, or ".bin" for unknown types.
 */
export function getFileExtension(mimeType: string): string {
  return (MIME_TO_EXTENSION as Record<string, string>)[mimeType] ?? ".bin";
}

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
// P3: Multi-format text extraction (14 MIME types)
// ---------------------------------------------------------------------------

/**
 * Extracts text from a file buffer based on its MIME type.
 *
 * - Text-based formats (plain, csv, html, markdown, xml, json): decoded as UTF-8.
 * - PDF: extracted via `unpdf`.
 * - DOCX: extracted via `mammoth`.
 * - XLSX / XLS: extracted via the `xlsx` library.
 * - RTF: best-effort RST control-word stripping.
 * - DOC, ODT: best-effort printable-text scan (no dedicated parser available).
 *
 * **Contract:** Returns a string (possibly empty) and never throws.  An empty
 * string means the file had no extractable text or the format is unsupported.
 */
export async function extractFileText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  // -- Guard: reject files larger than MAX_EXTRACTION_SIZE -----------------
  if (buffer.length > MAX_EXTRACTION_SIZE) {
    return "";
  }

  try {
    switch (mimeType) {
      // -- text-based: decode as UTF-8 ---------------------------------------
      case "text/plain":
      case "text/csv":
      case "text/html":
      case "text/markdown":
      case "text/xml":
      case "application/json":
      case "application/xml":
        return buffer.toString("utf-8");

      // -- PDF via unpdf ----------------------------------------------------
      case "application/pdf":
        return await extractPdfTextUnpdf(buffer);

      // -- DOCX via mammoth -------------------------------------------------
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractDocxTextMammoth(buffer);

      // -- XLSX / XLS via SheetJS -------------------------------------------
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      case "application/vnd.ms-excel":
        return extractExcelText(buffer as unknown as Uint8Array);

      // -- RTF: best-effort control-word stripping ---------------------------
      case "application/rtf":
        return extractRtfText(buffer);

      // -- Legacy DOC, ODT: best-effort printable-text scan ------------------
      case "application/msword":
        return extractBinaryPrintableText(buffer);
      case "application/vnd.oasis.opendocument.text":
        return extractOdtText(buffer);

      default:
        // Unknown / unsupported: return empty (never throw)
        return "";
    }
  } catch {
    return "";
  }
}

// -- PDF (unpdf) ---------------------------------------------------------------

async function extractPdfTextUnpdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(buffer.buffer as ArrayBuffer, {
    mergePages: true,
  });
  return result.text;
}

// -- DOCX (mammoth) ------------------------------------------------------------

async function extractDocxTextMammoth(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// -- XLSX / XLS (SheetJS) ------------------------------------------------------

function extractExcelText(buffer: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name: string) => {
    const sheet = workbook.Sheets[name];
    return XLSX.utils.sheet_to_csv(sheet, { forceQuotes: false });
  })
    .join("\n\n")
    .trim();
}

// -- RTF -----------------------------------------------------------------------

/**
 * Strips RTF control words and groups, keeping only plain-text content.
 *
 * This is a lossy best-effort parser. It removes:
 * - Known header groups (fonttbl, colortbl, stylesheet, etc.) using
 *   brace-matching to handle nested braces.
 * - Control words: backslash + letters + optional space/digit/negate
 * - Control symbols: backslash + single non-letter
 * - Escapes: \\', \\-, \\_, etc.
 *
 * The result is a plain string suitable for hashing and AI comparison.
 */
function extractRtfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");

  // -- Step 1: Remove known header groups with proper brace matching ---------

  // Regex to find the start of a header group: {\fonttbl or {\*\fonttbl
  // The \* (ignore-if-unknown marker) and its trailing backslash are optional.
  const HEADER_GROUP_RE =
    /\{\\(?:\*\\)?(fonttbl|colortbl|stylesheet|pntext|pntxtb|listtable|listoverridetable|revtbl|rsidtbl|generator|info|header|footer|headerf|footerf|headerl|headerr|header[flr]?|footer[flr]?)\b/gi;

  // Find all header group spans and remove them (with nested brace matching)
  const spansToRemove: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(HEADER_GROUP_RE.source, "gi");

  while ((m = re.exec(raw)) !== null) {
    const openBrace = m.index; // position of the opening {
    // Count braces to find the matching closing }
    let depth = 0;
    let closeBrace = -1;
    for (let i = openBrace; i < raw.length; i++) {
      if (raw[i] === "{") {
        // Only count if not escaped (preceded by backslash)
        if (i === 0 || raw[i - 1] !== "\\") {
          depth++;
        }
      } else if (raw[i] === "}") {
        if (i === 0 || raw[i - 1] !== "\\") {
          depth--;
          if (depth === 0) {
            closeBrace = i;
            break;
          }
        }
      }
    }
    if (closeBrace !== -1) {
      spansToRemove.push({ start: openBrace, end: closeBrace + 1 });
    }
  }

  // Sort by start position descending so we can splice without invalidating indices
  spansToRemove.sort((a, b) => b.start - a.start);

  let stripped = raw;
  for (const span of spansToRemove) {
    stripped = stripped.slice(0, span.start) + stripped.slice(span.end);
  }

  // -- Step 2: Replace paragraph/section markers with newlines ---------------
  stripped = stripped.replace(
    /\\(?:par|pard|sect|sectd|line|page|cell|row|softline|softpage)\b/gi,
    "\n",
  );

  // -- Step 3: \tab → tab ---------------------------------------------------
  stripped = stripped.replace(/\\tab\b/gi, "\t");

  // -- Step 4: Remove remaining control words: \word or \wordNNN -------------
  stripped = stripped.replace(/\\[a-zA-Z]+-?\d*\s?/g, "");

  // -- Step 5: Remove control symbols ----------------------------------------
  stripped = stripped.replace(/\\'[0-9a-fA-F]{2}/g, "");
  stripped = stripped.replace(/\\[-_~:|#]/g, "");

  // -- Step 6: Remove remaining { and } braces -------------------------------
  stripped = stripped.replace(/[{}]/g, "");

  // -- Step 7: Collapse multiple newlines ------------------------------------
  stripped = stripped.replace(/\n{3,}/g, "\n\n");

  // -- Step 8: Decode any remaining \\'XX hex-char sequences -----------------
  const decoded = stripped.replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return decoded.trim();
}

// -- ODT (OpenDocument Text) ---------------------------------------------------

/**
 * Best-effort text extraction from ODT files.
 *
 * ODT files are ZIP archives. Without a dedicated unzip library we attempt to
 * recover text from the raw byte stream. The ODF specification recommends
 * storing `content.xml` and `styles.xml` uncompressed (STORE method), which
 * means the XML content is often visible in the raw bytes as latin1 text.
 * We scan for text between known ODF paragraph/heading tags.
 */
function extractOdtText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");

  // Find text between <text:p ...> and </text:p> or <text:h ...> and </text:h>
  const textContent: string[] = [];

  // Match <text:p ...>...</text:p>  and  <text:h ...>...</text:h>
  const paraRegex =
    /<(?:text:p|text:h)\b[^>]*>(.*?)<\/(?:text:p|text:h)>/gi;
  let match: RegExpExecArray | null;

  while ((match = paraRegex.exec(raw)) !== null) {
    // Strip any remaining XML tags from the inner content
    const inner = match[1].replace(/<[^>]+>/g, "").trim();
    if (inner.length > 0) {
      textContent.push(inner);
    }
  }

  if (textContent.length > 0) {
    return textContent.join("\n");
  }

  // Fallback: if no paragraphs/h2 found, try scanning for text between any
  // text:* tags (more lenient).
  const spanRegex =
    /<(?:text:span|text:a|text:note|text:tab)[^>]*>([^<]*)<\/(?:text:span|text:a|text:note|text:tab)>/gi;
  const spanContent: string[] = [];

  while ((match = spanRegex.exec(raw)) !== null) {
    const inner = match[1].trim();
    if (inner.length > 0) {
      spanContent.push(inner);
    }
  }

  return spanContent.length > 0 ? spanContent.join(" ") : "";
}

// -- Legacy binary (DOC) -------------------------------------------------------

/**
 * Scans binary data for runs of printable characters and returns the
 * concatenated result.  This is a best-effort fallback for legacy binary
 * formats (e.g. .doc) that do not have a dedicated text extractor.
 *
 * A "printable run" is at least `MIN_RUN` consecutive characters in the
 * printable ASCII range (0x20-0x7E), horizontal tab (0x09), line-feed (0x0A),
 * or carriage-return (0x0D).
 */
function extractBinaryPrintableText(buffer: Buffer): string {
  const MIN_RUN = 6;
  const chunks: string[] = [];
  let run = "";

  const len = buffer.length;
  if (len > 5_000_000) return ""; // too large for this naive scan

  for (let i = 0; i < len; i++) {
    const b = buffer[i];
    if (
      (b >= 0x20 && b <= 0x7e) || // printable ASCII
      b === 0x09 || // tab
      b === 0x0a || // line-feed
      b === 0x0d // carriage-return
    ) {
      run += String.fromCharCode(b);
    } else {
      if (run.length >= MIN_RUN) {
        chunks.push(run);
      }
      run = "";
    }
  }
  if (run.length >= MIN_RUN) {
    chunks.push(run);
  }

  const result = chunks.join("\n");
  // Limit output size to something reasonable for hashing / AI comparison
  return result.length > 200_000 ? result.slice(0, 200_000) + "\n[TRUNCATED]" : result;
}

// ---------------------------------------------------------------------------
// Backwards-compatible PDF-only extraction (kept for existing code paths)
// ---------------------------------------------------------------------------

/**
 * Extracts text from a PDF buffer using `unpdf`.
 *
 * **Deprecated in P3** — prefer `extractFileText(buffer, "application/pdf")`.
 * Kept for backwards compatibility with existing route handlers and tests.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  return extractFileText(buffer, "application/pdf");
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

/** User prompt template -- TEXT_A and TEXT_B placeholders are replaced at call time. */
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
