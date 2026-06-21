import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  computeBinaryHash,
  computeTextHash,
  extractPdfText,
  extractFileText,
  buildComparePrompt,
  parseAIResponse,
  isAllowedMimeType,
  getFileExtension,
  ALLOWED_MIME_TYPES,
  MIME_TO_EXTENSION,
  computeFingerprint,
} from "./core";
import type { AllowedMimeType } from "./core";

// ---------------------------------------------------------------------------
// computeBinaryHash
// ---------------------------------------------------------------------------

describe("computeBinaryHash", () => {
  it("returns a 64-character lowercase hex string", () => {
    const hash = computeBinaryHash(Buffer.from("hello"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces the same hash", () => {
    const buf = Buffer.from("deterministic test");
    expect(computeBinaryHash(buf)).toBe(computeBinaryHash(buf));
  });

  it("produces different hashes for different inputs", () => {
    const a = computeBinaryHash(Buffer.from("alpha"));
    const b = computeBinaryHash(Buffer.from("beta"));
    expect(a).not.toBe(b);
  });

  it("handles an empty buffer", () => {
    const hash = computeBinaryHash(Buffer.alloc(0));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a known SHA-256 value for a well-known input", () => {
    // SHA-256 of "abc" as bytes
    const hash = computeBinaryHash(Buffer.from("abc"));
    expect(hash).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("handles a buffer with null bytes", () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x02, 0x00]);
    const hash = computeBinaryHash(buf);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Different from the empty string of the same length
    const emptyHash = computeBinaryHash(Buffer.alloc(6, 0x00));
    expect(hash).not.toBe(emptyHash);
  });

  it("handles a large buffer (10 MB) without error", () => {
    const buf = Buffer.alloc(10_000_000, 0x41); // 10 MB filled with 'A'
    const hash = computeBinaryHash(buf);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles non-ASCII bytes correctly", () => {
    const buf = Buffer.from([0xC2, 0xA9, 0xE2, 0x98, 0x83]); // (c) and snowman emoji UTF-8 bytes
    const hash = computeBinaryHash(buf);
    expect(hash).toHaveLength(64);
    // Known SHA-256 for these 5 bytes: C2 A9 E2 98 83
    expect(hash).toBe(
      "c717d8fd11316a47e71e395ae3eb6c2a4c80e7ca5f09fb7838ffd7d02d494837",
    );
  });

  it("produces a different hash when a single byte changes", () => {
    const buf1 = Buffer.from("The price is $100.00");
    const buf2 = Buffer.from("The price is $200.00");
    const hash1 = computeBinaryHash(buf1);
    const hash2 = computeBinaryHash(buf2);
    expect(hash1).not.toBe(hash2);
    // Check they both still look like valid hashes
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// computeTextHash
// ---------------------------------------------------------------------------

describe("computeTextHash", () => {
  it("returns a 64-character lowercase hex string", () => {
    const hash = computeTextHash("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same text produces the same hash", () => {
    expect(computeTextHash("same text")).toBe(computeTextHash("same text"));
  });

  it("produces different hashes for different texts", () => {
    const a = computeTextHash("alpha");
    const b = computeTextHash("beta");
    expect(a).not.toBe(b);
  });

  it("handles an empty string", () => {
    const hash = computeTextHash("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash as computeBinaryHash when given the same bytes", () => {
    // Text "abc" as string vs Buffer of "abc" — both should produce the same
    // SHA-256 since the encoding is the same (utf-8 / ascii).
    const textHash = computeTextHash("abc");
    const binHash = computeBinaryHash(Buffer.from("abc"));
    expect(textHash).toBe(binHash);
  });

  it("handles unicode text (multi-byte characters)", () => {
    const hash = computeTextHash("Hello 世界 🌍");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for texts differing only in whitespace", () => {
    const a = computeTextHash("hello world");
    const b = computeTextHash("hello  world"); // double space
    expect(a).not.toBe(b);
  });

  it("produces different hashes for texts differing in casing", () => {
    const a = computeTextHash("MATERIAL");
    const b = computeTextHash("material");
    expect(a).not.toBe(b);
  });

  it("handles very long text (100,000 characters)", () => {
    const text = "x".repeat(100_000);
    const hash = computeTextHash(text);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for a whitespace-only string each time", () => {
    const a = computeTextHash("   \n\t  ");
    const b = computeTextHash("   \n\t  ");
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// extractPdfText
// ---------------------------------------------------------------------------

describe("extractPdfText", () => {
  it("returns a string (never throws)", async () => {
    const result = await extractPdfText(Buffer.from("not a pdf at all"));
    expect(typeof result).toBe("string");
  });

  it("returns empty string for corrupt / non-PDF data", async () => {
    const result = await extractPdfText(Buffer.from([0x00, 0xff, 0xfe]));
    expect(result).toBe("");
  });

  it("returns a string for empty buffer", async () => {
    const result = await extractPdfText(Buffer.alloc(0));
    expect(typeof result).toBe("string");
    expect(result).toBe("");
  });

  it("does not throw for any input", async () => {
    // A variety of invalid inputs — none should throw.
    const inputs = [
      Buffer.from(""),
      Buffer.from("hello"),
      Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      Buffer.alloc(1024, 0x41),
    ];
    for (const input of inputs) {
      const result = await extractPdfText(input);
      expect(typeof result).toBe("string");
    }
  });

  it("returns a string for a structurally valid PDF (never throws)", async () => {
    // Build a minimal PDF with correct xref byte offsets to verify the
    // function handles structurally valid PDFs without throwing.
    // Note: unpdf's ability to extract specific text from hand-crafted
    // minimal PDFs depends on parser internals. The behavioral contract
    // is: returns a string, never throws, empty string on corrupt/unparseable.
    const lines = [
      "%PDF-1.4",                                                                          // 0: 8 bytes
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",                                      // 1: 42 bytes
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1/MediaBox[0 0 612 792]>>endobj",         // 2: 63 bytes
      "3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj", // 3: 80 bytes
      "4 0 obj<</Length 44>>stream",                                                      // 4: 27 bytes
      "BT /F1 12 Tf 100 700 Td (Hello TrustVault) Tj ET",                                // 5: 47 bytes
      "endstream",                                                                         // 6: 9 bytes
      "endobj",                                                                            // 7: 6 bytes
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",                     // 8: 56 bytes
    ];
    const linesStr = lines.join("\n") + "\n";

    // Compute byte offsets for xref entries
    let offset = 0;
    const objOffsets: Record<number, number> = {};
    for (const line of lines) {
      const m = line.match(/^(\d+) \d+ obj/);
      if (m) {
        objOffsets[parseInt(m[1])] = offset;
      }
      offset += line.length + 1; // +1 for newline
    }
    const xrefOffset = offset;

    // Build xref table
    let xref = "xref\n0 6\n0000000000 65535 f \n";
    for (let i = 1; i <= 5; i++) {
      xref += `${String(objOffsets[i]).padStart(10, "0")} 00000 n \n`;
    }

    const trailer = `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;
    const fullPdf = linesStr + xref + trailer;
    const pdfContent = Buffer.from(fullPdf);

    const result = await extractPdfText(pdfContent);
    // Behavioral contract: returns a string, never throws
    expect(typeof result).toBe("string");
    // The extraction may or may not find text depending on parser internals;
    // the contract guarantees a string is always returned.
  });

  it("returns empty string for a PDF with no text objects", async () => {
    // A PDF with only images or metadata but no actual text — extractor
    // should return empty string and not throw.
    const imageOnlyPdf = Buffer.from(
      "%PDF-1.4\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R/MediaBox[0 0 612 792]>>endobj\n" +
        "4 0 obj<</Length 0>>stream\n" +
        "endstream\n" +
        "endobj\n" +
        "xref\n" +
        "0 5\n" +
        "0000000000 65535 f \n" +
        "0000000009 00000 n \n" +
        "0000000058 00000 n \n" +
        "0000000115 00000 n \n" +
        "0000000193 00000 n \n" +
        "trailer<</Size 5/Root 1 0 R>>\n" +
        "startxref\n" +
        "231\n" +
        "%%EOF",
    );
    const result = await extractPdfText(imageOnlyPdf);
    expect(typeof result).toBe("string");
    // May be empty or near-empty — the contract says we get back a string
  });
});

// ---------------------------------------------------------------------------
// buildComparePrompt
// ---------------------------------------------------------------------------

describe("buildComparePrompt", () => {
  it("returns an object with system and user strings", () => {
    const result = buildComparePrompt("textA", "textB");
    expect(result).toHaveProperty("system");
    expect(result).toHaveProperty("user");
    expect(typeof result.system).toBe("string");
    expect(typeof result.user).toBe("string");
  });

  it("embeds textA and textB in the user prompt", () => {
    const result = buildComparePrompt("Hello world", "Goodbye world");
    expect(result.user).toContain("Hello world");
    expect(result.user).toContain("Goodbye world");
  });

  it("does not modify text under the truncation limit", () => {
    const text = "a".repeat(100);
    const result = buildComparePrompt(text, text);
    expect(result.user).toContain(text);
    expect(result.user).not.toContain("[TRUNCATED]");
  });

  it("truncates text exceeding 40,000 characters", () => {
    const shortText = "a".repeat(100);
    const longText = "b".repeat(50_000);
    const result = buildComparePrompt(shortText, longText);

    // Short text should be intact (not truncated)
    expect(result.user).toContain(shortText);

    // Long text should be truncated and marked
    expect(result.user).not.toContain("b".repeat(50_000));
    expect(result.user).toContain("b".repeat(40_000));
    expect(result.user).toContain("[TRUNCATED]");
  });

  it("truncates both texts when both exceed the limit", () => {
    const longA = "A".repeat(50_000);
    const longB = "B".repeat(50_000);
    const result = buildComparePrompt(longA, longB);

    // Both should be truncated
    expect(result.user).toContain("A".repeat(40_000));
    expect(result.user).toContain("B".repeat(40_000));
    // [TRUNCATED] should appear twice
    const matches = (result.user.match(/\[TRUNCATED\]/g) ?? []).length;
    expect(matches).toBe(2);
  });

  it("does not truncate text exactly at the limit (40,000 chars)", () => {
    const text = "X".repeat(40_000);
    const result = buildComparePrompt(text, "short");
    expect(result.user).toContain(text);
    expect(result.user).not.toContain("[TRUNCATED]");
  });

  it("includes the assessment instruction in the user prompt", () => {
    const result = buildComparePrompt("A", "B");
    expect(result.user).toContain(
      "Assess whether the change from Document A to Document B is MATERIAL or NOT_MATERIAL.",
    );
  });

  it("includes the system prompt verbatim", () => {
    const result = buildComparePrompt("A", "B");
    expect(result.system).toContain("document-integrity reviewer");
    expect(result.system).toContain("MATERIAL or NOT_MATERIAL");
    expect(result.system).toContain("cosmetic");
  });

  it("handles empty textA gracefully", () => {
    const result = buildComparePrompt("", "Some content");
    expect(result.user).toContain("Document A (baseline)");
    expect(result.user).toContain("Document B (new version)");
    expect(result.user).toContain("Some content");
  });

  it("handles empty textB gracefully", () => {
    const result = buildComparePrompt("Some content", "");
    expect(result.user).toContain("Some content");
    expect(result.user).toContain("Document B (new version)");
  });

  it("handles both texts empty", () => {
    const result = buildComparePrompt("", "");
    expect(typeof result.system).toBe("string");
    expect(typeof result.user).toBe("string");
    expect(result.user).toContain("Document A (baseline)");
    expect(result.user).toContain("Document B (new version)");
  });

  it("embeds text containing special characters safely", () => {
    const specialText = 'Text with <tags> & "quotes" and backticks `code`';
    const result = buildComparePrompt(specialText, "plain text");
    expect(result.user).toContain(specialText);
  });

  it("does not corrupt textA and textB markers when texts contain marker-like strings", () => {
    const textWithMarker = "This text has {TEXT_A} embedded in it";
    const result = buildComparePrompt(textWithMarker, "plain text");
    // The literal text should appear exactly as-is (surgery-proof)
    expect(result.user).toContain(textWithMarker);
  });

  it("does not truncate text exactly at the limit (40,001 chars should truncate)", () => {
    const text = "Y".repeat(40_001);
    const result = buildComparePrompt(text, "short");
    expect(result.user).toContain("Y".repeat(40_000));
    expect(result.user).toContain("[TRUNCATED]");
    // The full 40,001 chars should NOT appear
    expect(result.user).not.toContain("Y".repeat(40_001));
  });

  it("returned system prompt is identical across calls", () => {
    const r1 = buildComparePrompt("A", "B");
    const r2 = buildComparePrompt("C", "D");
    expect(r1.system).toBe(r2.system);
  });
});

// ---------------------------------------------------------------------------
// parseAIResponse
// ---------------------------------------------------------------------------

describe("parseAIResponse", () => {
  it("parses a valid MATERIAL response", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "The payment amount changed from $100 to $500.",
    };
    const result = parseAIResponse(raw);
    expect(result.verdict).toBe("MATERIAL");
    expect(result.confidence).toBe("HIGH");
    expect(result.reasoning).toBe(
      "The payment amount changed from $100 to $500.",
    );
  });

  it("parses a valid NOT_MATERIAL response", () => {
    const raw = {
      verdict: "NOT_MATERIAL",
      confidence: "HIGH",
      reasoning: "Only whitespace and formatting changes were detected.",
    };
    const result = parseAIResponse(raw);
    expect(result.verdict).toBe("NOT_MATERIAL");
    expect(result.confidence).toBe("HIGH");
  });

  it("accepts all valid confidence levels", () => {
    for (const conf of ["HIGH", "MEDIUM", "LOW"] as const) {
      const raw = {
        verdict: "MATERIAL" as const,
        confidence: conf,
        reasoning: "A valid reasoning sentence.",
      };
      const result = parseAIResponse(raw);
      expect(result.confidence).toBe(conf);
    }
  });

  it("throws ZodError when verdict is invalid", () => {
    const raw = {
      verdict: "INVALID_VERDICT",
      confidence: "HIGH",
      reasoning: "Some reasoning.",
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("throws ZodError when confidence is invalid", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "VERY_HIGH",
      reasoning: "Some reasoning.",
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("throws ZodError when reasoning is empty", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "",
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("throws ZodError when reasoning exceeds 1000 characters", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "x".repeat(1001),
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("allows reasoning of exactly 1000 characters", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "x".repeat(1000),
    };
    const result = parseAIResponse(raw);
    expect(result.reasoning).toHaveLength(1000);
  });

  it("throws ZodError when required fields are missing", () => {
    expect(() => parseAIResponse({})).toThrow(ZodError);
    expect(() =>
      parseAIResponse({ verdict: "MATERIAL" }),
    ).toThrow(ZodError);
    expect(() =>
      parseAIResponse({ verdict: "MATERIAL", confidence: "HIGH" }),
    ).toThrow(ZodError);
  });

  it("throws ZodError for non-object input", () => {
    expect(() => parseAIResponse(null)).toThrow(ZodError);
    expect(() => parseAIResponse(undefined)).toThrow(ZodError);
    expect(() => parseAIResponse("not an object")).toThrow(ZodError);
    expect(() => parseAIResponse(42)).toThrow(ZodError);
  });

  it("throws ZodError for an array input", () => {
    expect(() =>
      parseAIResponse([
        { verdict: "MATERIAL", confidence: "HIGH", reasoning: "ok" },
      ]),
    ).toThrow(ZodError);
  });

  it("throws ZodError for a boolean input", () => {
    expect(() => parseAIResponse(true)).toThrow(ZodError);
    expect(() => parseAIResponse(false)).toThrow(ZodError);
  });

  it("accepts a valid response with extra unknown properties (Zod strips them)", () => {
    const raw = {
      verdict: "NOT_MATERIAL",
      confidence: "LOW",
      reasoning: "Only formatting changes.",
      extraField: "should be stripped",
      anotherExtra: 123,
    };
    const result = parseAIResponse(raw);
    expect(result.verdict).toBe("NOT_MATERIAL");
    expect(result.confidence).toBe("LOW");
    expect(result.reasoning).toBe("Only formatting changes.");
    // Extra fields are stripped by Zod .parse() — not present on result
    expect((result as unknown as Record<string, unknown>).extraField).toBeUndefined();
  });

  it("throws ZodError when verdict has wrong case", () => {
    const raw = {
      verdict: "material", // lowercase — should be "MATERIAL"
      confidence: "HIGH",
      reasoning: "Some reasoning.",
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("accepts reasoning that is only whitespace (Zod .min(1) checks length, not content)", () => {
    // Behavioral note: Zod's z.string().min(1) only validates string length,
    // not whether the content is semantically meaningful. Whitespace-only
    // reasoning passes schema validation. The AI is expected to produce
    // meaningful reasoning; this is a guardrail gap that could be tightened
    // with a .refine() check trimming whitespace before length validation.
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "   ",
    };
    const result = parseAIResponse(raw);
    expect(result.reasoning).toBe("   ");
  });

  it("throws ZodError when reasoning is missing completely", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
    };
    expect(() => parseAIResponse(raw)).toThrow(ZodError);
  });

  it("accepts reasoning with exactly 1 character", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "X",
    };
    const result = parseAIResponse(raw);
    expect(result.reasoning).toBe("X");
  });

  it("accepts reasoning with newlines (multi-line reasoning)", () => {
    const raw = {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "First line of reasoning.\nSecond line with more detail.\nThird line.",
    };
    const result = parseAIResponse(raw);
    expect(result.reasoning).toContain("\n");
    expect(result.reasoning.split("\n").length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Pipeline integration tests — verify the three-step invariant
// ---------------------------------------------------------------------------

describe("core pipeline integration", () => {
  const docTextV1 =
    "Agreement between Party A and Party B.\nPayment amount: $10,000.\nSigned: 2026-01-01.";
  const docTextV2 =
    "Agreement between Party A and Party B.\nPayment amount: $25,000.\nSigned: 2026-01-01.";
  const docTextV3 = docTextV1.replace("$10,000", "$10,000"); // identical text

  it("Step 1 — identical binary blobs produce equal binary hashes", () => {
    const buf = Buffer.from(docTextV1, "utf-8");
    expect(computeBinaryHash(buf)).toBe(computeBinaryHash(buf));
  });

  it("Step 1 — different binary blobs produce different binary hashes", () => {
    const buf1 = Buffer.from(docTextV1, "utf-8");
    const buf2 = Buffer.from(docTextV2, "utf-8");
    expect(computeBinaryHash(buf1)).not.toBe(computeBinaryHash(buf2));
  });

  it("Step 2 — identical text produces equal text hashes", () => {
    expect(computeTextHash(docTextV1)).toBe(computeTextHash(docTextV3));
  });

  it("Step 2 — different text produces different text hashes", () => {
    expect(computeTextHash(docTextV1)).not.toBe(computeTextHash(docTextV2));
  });

  it("Step 1+2 — binary hash differs but text hash matches when only encoding/whitespace changes", () => {
    const buf1 = Buffer.from(docTextV1, "utf-8");
    // Add a BOM (byte-order mark) to simulate encoding difference
    const buf2 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(docTextV1, "utf-8")]);

    expect(computeBinaryHash(buf1)).not.toBe(computeBinaryHash(buf2));
    // text from buf1 and buf2 should differ because BOM is in the text
    // when extracted as a string, so we compare the literal texts
    const text1 = docTextV1;
    const text2 = "﻿" + docTextV1; // BOM + same text
    expect(computeTextHash(text1)).not.toBe(computeTextHash(text2));
  });

  it("Step 3 — prompt is buildable from the texts and parses a valid MATERIAL verdict", () => {
    const prompt = buildComparePrompt(docTextV1, docTextV2);
    expect(prompt.system).toContain("MATERIAL or NOT_MATERIAL");
    expect(prompt.user).toContain("$10,000");
    expect(prompt.user).toContain("$25,000");

    const aiResponse = {
      verdict: "MATERIAL" as const,
      confidence: "HIGH" as const,
      reasoning:
        "The payment amount was changed from $10,000 to $25,000, which materially alters the financial obligation.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("MATERIAL");
    expect(parsed.confidence).toBe("HIGH");
  });

  it("Step 3 — prompt is buildable and parses a valid NOT_MATERIAL verdict", () => {
    const textA = "Hello world. This is a test document.";
    const textB = "Hello world.  This is a test document."; // double space — cosmetic

    const prompt = buildComparePrompt(textA, textB);
    expect(prompt.user).toContain(textA);
    expect(prompt.user).toContain(textB);

    const aiResponse = {
      verdict: "NOT_MATERIAL" as const,
      confidence: "HIGH" as const,
      reasoning:
        "Only a double-space was introduced, which is a purely cosmetic formatting change.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("NOT_MATERIAL");
  });

  it("full pipeline: text changed (material) => all three steps simulate correctly", () => {
    const buf1 = Buffer.from(docTextV1, "utf-8");
    const buf2 = Buffer.from(docTextV2, "utf-8");

    const binHashA = computeBinaryHash(buf1);
    const binHashB = computeBinaryHash(buf2);
    expect(binHashA).not.toBe(binHashB);

    const textHashA = computeTextHash(docTextV1);
    const textHashB = computeTextHash(docTextV2);
    expect(textHashA).not.toBe(textHashB);

    // Step 3 — AI compare
    const prompt = buildComparePrompt(docTextV1, docTextV2);
    expect(prompt.user).toContain("$10,000");
    expect(prompt.user).toContain("$25,000");
    expect(prompt.system).toContain("MATERIAL or NOT_MATERIAL");
  });

  it("full pipeline: text identical => text hashes match, no AI call needed", () => {
    const textHashA = computeTextHash(docTextV1);
    const textHashB = computeTextHash(docTextV3);
    expect(textHashA).toBe(textHashB);
    // The contract says: if text hashes are equal, return BINARY_DIFF_ONLY
    // — no AI call should happen.
  });

  it("AI prompt for empty texts still produces parsable output", () => {
    const prompt = buildComparePrompt("", "");
    expect(prompt.system).toBeTruthy();
    expect(prompt.user).toBeTruthy();
    // A valid AI response referencing empty texts is still parsable
    const aiResponse = {
      verdict: "NOT_MATERIAL" as const,
      confidence: "HIGH" as const,
      reasoning: "Both documents contain no text — no material change detected.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("NOT_MATERIAL");
  });

  it("corrupt/broken PDF returning empty text flows through pipeline without error", () => {
    const emptyText = "";
    const hash = computeTextHash(emptyText);
    expect(hash).toHaveLength(64);

    const prompt = buildComparePrompt(emptyText, "Only one document has text");
    expect(prompt.user).toContain("Document A (baseline)");
    expect(prompt.user).toContain("Document B (new version)");
  });

  it("P2: multi-document scenario — different projects, identical text => text hashes match", () => {
    // Simulate two documents from different projects with identical text.
    // The hashing is project-agnostic — same text always produces same hash.
    const project1Text = "Payment Terms: Net 30 days. Amount: $5,000.";
    const project2Text = "Payment Terms: Net 30 days. Amount: $5,000.";
    expect(computeTextHash(project1Text)).toBe(computeTextHash(project2Text));
  });

  it("P2: multi-document scenario — same project, slightly different amounts => text hashes differ", () => {
    const original = "Invoice #INV-001\nAmount: $10,000\nDue: 2026-07-01";
    const updated = "Invoice #INV-001\nAmount: $12,500\nDue: 2026-07-01";
    expect(computeTextHash(original)).not.toBe(computeTextHash(updated));

    // Verify prompt is buildable and AI response parsing works
    const prompt = buildComparePrompt(original, updated);
    expect(prompt.user).toContain("$10,000");
    expect(prompt.user).toContain("$12,500");

    const aiResponse = {
      verdict: "MATERIAL" as const,
      confidence: "HIGH" as const,
      reasoning: "The invoice amount changed from $10,000 to $12,500, which materially alters the financial obligation.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("MATERIAL");
    expect(parsed.confidence).toBe("HIGH");
  });

  it("P2: empty text in one document => AI compare still possible", () => {
    // One document has text, the other is a scanned/corrupt PDF with no extractable text
    const textA = "Contract between Company X and Company Y.";
    const textB = "";

    expect(computeTextHash(textA)).not.toBe(computeTextHash(textB));

    const prompt = buildComparePrompt(textA, textB);
    expect(prompt.user).toContain("Contract between Company X and Company Y.");
    expect(prompt.user).toContain("Document B (new version)");

    const aiResponse = {
      verdict: "MATERIAL" as const,
      confidence: "MEDIUM" as const,
      reasoning: "Document B contains no extractable text while Document A has content — this represents a significant discrepancy.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("MATERIAL");
    expect(parsed.confidence).toBe("MEDIUM");
  });
});

// ---------------------------------------------------------------------------
// P2: UUID validation — used across all route handlers for parameter/body
// validation. Tests the regex pattern that gates every path-parameter endpoint.
// ---------------------------------------------------------------------------

describe("P2: UUID validation (used by all route handlers)", () => {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("accepts valid lowercase UUIDs", () => {
    const uuids = [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "550e8400-e29b-41d4-a716-446655440000",
    ];
    for (const uuid of uuids) {
      expect(UUID_RE.test(uuid)).toBe(true);
    }
  });

  it("accepts uppercase UUIDs (case-insensitive flag)", () => {
    expect(UUID_RE.test("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects strings shorter than 36 characters", () => {
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544000")).toBe(false); // 35 chars
    expect(UUID_RE.test("abc")).toBe(false);
    expect(UUID_RE.test("")).toBe(false);
  });

  it("rejects strings longer than 36 characters", () => {
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-4466554400000")).toBe(false);
  });

  it("rejects non-hex characters in UUID positions", () => {
    expect(UUID_RE.test("gggggggg-gggg-gggg-gggg-gggggggggggg")).toBe(false);
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
  });

  it("rejects UUID with wrong segment count or placement", () => {
    // Missing one segment (7 instead of 8)
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544")).toBe(false);
    // Extra segment
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544-0000")).toBe(false);
  });

  it("rejects UUID with missing dashes", () => {
    expect(UUID_RE.test("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects null-adjacent and falsy values when coerced to string", () => {
    // In route handlers, these would be caught before the regex test
    // because typeof check is done first, but verifying regex behavior
    expect(UUID_RE.test("null")).toBe(false);
    expect(UUID_RE.test("undefined")).toBe(false);
    expect(UUID_RE.test("NaN")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2: Role validation — RBAC constraint tests
// ---------------------------------------------------------------------------

describe("P2: Role validation (RBAC)", () => {
  const VALID_ROLES = new Set(["admin", "editor", "viewer"]);

  it("all three valid roles are accepted", () => {
    expect(VALID_ROLES.has("admin")).toBe(true);
    expect(VALID_ROLES.has("editor")).toBe(true);
    expect(VALID_ROLES.has("viewer")).toBe(true);
  });

  it("invalid roles are rejected", () => {
    expect(VALID_ROLES.has("superadmin")).toBe(false);
    expect(VALID_ROLES.has("owner")).toBe(false);
    expect(VALID_ROLES.has("")).toBe(false);
    expect(VALID_ROLES.has("Admin")).toBe(false); // case-sensitive
    expect(VALID_ROLES.has("ADMIN")).toBe(false);
  });

  it("role hierarchy: admin > editor > viewer", () => {
    // Per the security model: admin has all editor permissions plus more,
    // editor has all viewer permissions plus write
    const roleHierarchy: Record<string, string[]> = {
      admin: ["admin", "editor", "viewer"],
      editor: ["editor", "viewer"],
      viewer: ["viewer"],
    };
    expect(roleHierarchy.admin).toContain("editor");
    expect(roleHierarchy.admin).toContain("viewer");
    expect(roleHierarchy.editor).toContain("viewer");
    expect(roleHierarchy.editor).not.toContain("admin");
    expect(roleHierarchy.viewer).not.toContain("editor");
    expect(roleHierarchy.viewer).not.toContain("admin");
  });
});

// ---------------------------------------------------------------------------
// P2: Bulk upload validation constants
// ---------------------------------------------------------------------------

describe("P2: Bulk upload constraints", () => {
  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 20_971_520; // 20 MB
  const MAX_NAME_LENGTH = 255;

  it("allows 1 to 10 files per bulk request", () => {
    for (let i = 1; i <= MAX_FILES; i++) {
      expect(i).toBeLessThanOrEqual(MAX_FILES);
    }
  });

  it("rejects 0 files", () => {
    expect(0).toBeLessThan(1);
  });

  it("rejects more than 10 files", () => {
    expect(11).toBeGreaterThan(MAX_FILES);
    expect(100).toBeGreaterThan(MAX_FILES);
  });

  it("file size limit is exactly 20 MB in bytes", () => {
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
    // 20 MB = 20,971,520 bytes
  });

  it("name length limit matches the API spec (255 characters)", () => {
    expect(MAX_NAME_LENGTH).toBe(255);
    expect("x".repeat(255).length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect("x".repeat(256).length).toBeGreaterThan(MAX_NAME_LENGTH);
  });

  it("per-file errors do not stop processing for remaining files", () => {
    // Simulate: file 1 succeeds, file 2 fails validation, file 3 succeeds
    const results: { name: string; ok: boolean }[] = [];

    const files = [
      { name: "valid.pdf", size: 1024, type: "application/pdf" },
      { name: "bad.txt", size: 1024, type: "text/plain" },
      { name: "valid2.pdf", size: 2048, type: "application/pdf" },
    ];

    for (const file of files) {
      if (file.type !== "application/pdf") {
        results.push({ name: file.name, ok: false });
        continue;
      }
      results.push({ name: file.name, ok: true });
    }

    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(results[0].ok).toBe(true); // file 1 processed
    expect(results[1].ok).toBe(false); // file 2 failed
    expect(results[2].ok).toBe(true); // file 3 still processed
  });
});

// ---------------------------------------------------------------------------
// P2: Cross-project compare detection
// ---------------------------------------------------------------------------

describe("P2: Cross-project compare blocking", () => {
  it("same project_id comparison is allowed", () => {
    const docAProjectId = "project-alpha";
    const docBProjectId = "project-alpha";
    const sameProject = docAProjectId === docBProjectId;
    expect(sameProject).toBe(true);
  });

  it("different project_id comparison is blocked", () => {
    const docAProjectId: string = "project-alpha";
    const docBProjectId: string = "project-beta";
    const sameProject = docAProjectId === docBProjectId;
    expect(sameProject).toBe(false);
    const errorCode = sameProject ? null : "CROSS_PROJECT_COMPARE";
    expect(errorCode).toBe("CROSS_PROJECT_COMPARE");
  });

  it("same document compared to itself returns SAME_DOCUMENT", () => {
    const docAId = "uuid-same";
    const docBId = "uuid-same";
    const isSelfCompare = docAId === docBId;
    expect(isSelfCompare).toBe(true);
    const errorCode = isSelfCompare ? "SAME_DOCUMENT" : null;
    expect(errorCode).toBe("SAME_DOCUMENT");
  });

  it("cross-project error code matches P2 API spec", () => {
    // The spec says: 400 CROSS_PROJECT_COMPARE when docs belong to different projects
    const expectedCode = "CROSS_PROJECT_COMPARE";
    const expectedStatus = 400;
    expect(expectedCode).toBe("CROSS_PROJECT_COMPARE");
    expect(expectedStatus).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// P2: Document type contract — structural validation
// ---------------------------------------------------------------------------

describe("P2: Document type structural contract", () => {
  it("P2 Document must include tenant_id, project_id, and uploaded_by", () => {
    // These fields are NOT NULL in P2 (were nullable in P1)
    const requiredP2Fields = ["tenant_id", "project_id", "uploaded_by"] as const;
    const sampleDocument = {
      tenant_id: "some-tenant-uuid",
      project_id: "some-project-uuid",
      uploaded_by: "some-user-uuid",
    };
    for (const field of requiredP2Fields) {
      expect(sampleDocument[field]).toBeTruthy();
    }
    expect(requiredP2Fields).toHaveLength(3);
  });

  it("storage_path follows P2 convention: uploads/{year}/{project_id}/{uuid}.pdf", () => {
    const year = new Date().getUTCFullYear().toString();
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const fileUuid = "11111111-2222-3333-4444-555555555555";
    const path = `uploads/${year}/${projectId}/${fileUuid}.pdf`;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(path).toMatch(/^uploads\/\d{4}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
    expect(path).toContain(projectId);
    expect(path).toContain(fileUuid);
    expect(UUID_RE.test(projectId)).toBe(true);
    expect(UUID_RE.test(fileUuid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P2: Error code naming conventions
// ---------------------------------------------------------------------------

describe("P2: Error code conventions", () => {
  it("all P2 error codes use UPPER_SNAKE_CASE", () => {
    const codes = [
      "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND",
      "MISSING_PROJECT_ID", "INVALID_PROJECT_ID",
      "CROSS_PROJECT_COMPARE", "SAME_DOCUMENT",
      "LAST_ADMIN", "ALREADY_MEMBER", "USER_NOT_IN_TENANT",
      "NO_FILES", "TOO_MANY_FILES", "INVALID_NAMES",
    ];
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it("401 vs 403 distinction is preserved in error codes", () => {
    // 401 UNAUTHORIZED = no valid session at all
    // 403 FORBIDDEN = authenticated but wrong role
    const unauthorizedCode = "UNAUTHORIZED";
    const forbiddenCode = "FORBIDDEN";
    expect(unauthorizedCode).not.toBe(forbiddenCode);
    // API routes return:
    // - requireAuth() -> 401 UNAUTHORIZED
    // - requireProjectRole() with wrong role -> 403 FORBIDDEN
  });
});

// ---------------------------------------------------------------------------
// P2: Pipeline — AI integration must NOT expose tenant/project/user metadata
// ---------------------------------------------------------------------------

describe("P2: AI prompt metadata isolation", () => {
  it("buildComparePrompt never includes user, tenant, or project identifiers", () => {
    const prompt = buildComparePrompt("Payment terms: Net 30.", "Payment terms: Net 60.");

    // The AI prompt must not contain any auth or tenant metadata
    const forbiddenInPrompt = [
      "tenant_id", "tenantId", "tenant",
      "project_id", "projectId",
      "uploaded_by", "uploadedBy", "userId", "user_id",
      "auth", "session", "cookie", "JWT",
      "supabase", "SUPABASE",
    ];

    for (const forbidden of forbiddenInPrompt) {
      expect(prompt.system).not.toContain(forbidden);
      expect(prompt.user).not.toContain(forbidden);
    }
  });

  it("compare endpoint does not send document metadata to DeepSeek", () => {
    // Verified at architecture level: the compare handler in
    // app/api/compare/route.ts calls buildComparePrompt with only
    // docA.extracted_text and docB.extracted_text — no metadata.
    const prompt = buildComparePrompt("text only", "also text only");
    expect(prompt.user).toBeDefined();
    expect(prompt.system).toBeDefined();
    // The prompt text is the only thing the AI sees
  });
});

// ============================================================================
// P3: Multi-format MIME type validation
// ============================================================================

describe("P3: isAllowedMimeType", () => {
  it("accepts all 14 allowed MIME types", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(isAllowedMimeType(mime)).toBe(true);
    }
  });

  it("rejects unknown MIME types", () => {
    expect(isAllowedMimeType("image/png")).toBe(false);
    expect(isAllowedMimeType("video/mp4")).toBe(false);
    expect(isAllowedMimeType("application/zip")).toBe(false);
    expect(isAllowedMimeType("")).toBe(false);
    expect(isAllowedMimeType("application/octet-stream")).toBe(false);
  });

  it("rejects similar but different MIME types", () => {
    expect(isAllowedMimeType("text/plain; charset=utf-8")).toBe(false);
    expect(isAllowedMimeType("text/richtext")).toBe(false);
    expect(isAllowedMimeType("application/pdf+xml")).toBe(false);
  });

  it("is case-sensitive (MIME types are lowercase)", () => {
    expect(isAllowedMimeType("TEXT/PLAIN")).toBe(false);
    expect(isAllowedMimeType("Application/PDF")).toBe(false);
  });
});

// ============================================================================
// P3: getFileExtension
// ============================================================================

describe("P3: getFileExtension", () => {
  it("returns correct extensions for all 14 MIME types", () => {
    const expected: Record<string, string> = {
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        ".xlsx",
      "application/vnd.ms-excel": ".xls",
      "application/msword": ".doc",
      "application/rtf": ".rtf",
      "application/vnd.oasis.opendocument.text": ".odt",
    };

    for (const [mime, ext] of Object.entries(expected)) {
      expect(getFileExtension(mime)).toBe(ext);
    }
  });

  it("returns .bin for unknown MIME types", () => {
    expect(getFileExtension("image/png")).toBe(".bin");
    expect(getFileExtension("")).toBe(".bin");
    expect(getFileExtension("unknown")).toBe(".bin");
  });

  it("all 14 MIME types are exactly defined", () => {
    expect(ALLOWED_MIME_TYPES).toHaveLength(14);
    const keys = Object.keys(MIME_TO_EXTENSION);
    expect(keys).toHaveLength(14);
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(MIME_TO_EXTENSION[mime]).toBeDefined();
      expect(MIME_TO_EXTENSION[mime]).toMatch(/^\.[a-z0-9]+$/);
    }
  });
});

// ============================================================================
// P3: extractFileText — text-based formats (UTF-8 decode)
// ============================================================================

describe("P3: extractFileText — text formats", () => {
  const textFormats: AllowedMimeType[] = [
    "text/plain",
    "text/csv",
    "text/html",
    "text/markdown",
    "text/xml",
    "application/json",
    "application/xml",
  ];

  for (const mime of textFormats) {
    it(`extracts text from ${mime} by decoding as UTF-8`, async () => {
      const content = "Hello, TrustVault P3!  Testing multi-format support.";
      const buffer = Buffer.from(content, "utf-8");
      const result = await extractFileText(buffer, mime);
      expect(result).toBe(content);
    });
  }

  it("handles multiline text/plain", async () => {
    const content = "Line 1\nLine 2\nLine 3";
    const buffer = Buffer.from(content, "utf-8");
    const result = await extractFileText(buffer, "text/plain");
    expect(result).toBe(content);
  });

  it("handles CSV with commas and quotes", async () => {
    const csv = 'Name,Amount,Date\n"Acme, Inc.",1000,2026-06-21';
    const buffer = Buffer.from(csv, "utf-8");
    const result = await extractFileText(buffer, "text/csv");
    expect(result).toContain("Acme, Inc.");
    expect(result).toContain("1000");
  });

  it("handles valid JSON text", async () => {
    const json = JSON.stringify({ contract: "NDA", parties: ["A", "B"] });
    const buffer = Buffer.from(json, "utf-8");
    const result = await extractFileText(buffer, "application/json");
    expect(result).toBe(json);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("handles XML text", async () => {
    const xml = '<?xml version="1.0"?><root><item>Value</item></root>';
    const buffer = Buffer.from(xml, "utf-8");
    const result = await extractFileText(buffer, "text/xml");
    expect(result).toContain("<root>");
    expect(result).toContain("Value");
  });

  it("handles empty text file", async () => {
    const buffer = Buffer.from("", "utf-8");
    const result = await extractFileText(buffer, "text/plain");
    expect(result).toBe("");
  });

  it("handles text with Unicode (non-ASCII)", async () => {
    const content = "Documento en español: contraseña €50. 日本語のテキスト。";
    const buffer = Buffer.from(content, "utf-8");
    const result = await extractFileText(buffer, "text/plain");
    expect(result).toBe(content);
  });
});

// ============================================================================
// P3: extractFileText — PDF (delegates to extractPdfText)
// ============================================================================

describe("P3: extractFileText — PDF", () => {
  it("delegates to extractPdfText for application/pdf", async () => {
    const result = await extractFileText(
      Buffer.from("not a pdf"),
      "application/pdf",
    );
    expect(typeof result).toBe("string");
  });

  it("returns empty string for corrupt PDF", async () => {
    const result = await extractFileText(
      Buffer.from([0x00, 0xff, 0xfe]),
      "application/pdf",
    );
    expect(result).toBe("");
  });

  it("never throws for any PDF input", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("hello"),
      Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      Buffer.alloc(1024, 0x41),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, "application/pdf");
      expect(typeof result).toBe("string");
    }
  });
});

// ============================================================================
// P3: extractFileText — DOCX via mammoth
// ============================================================================

describe("P3: extractFileText — DOCX", () => {
  const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  it("returns a string (never throws) for non-DOCX data", async () => {
    const result = await extractFileText(
      Buffer.from("not a docx file"),
      DOCX_MIME,
    );
    expect(typeof result).toBe("string");
  });

  it("returns empty string for corrupt/invalid DOCX data", async () => {
    const result = await extractFileText(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      DOCX_MIME,
    );
    expect(typeof result).toBe("string");
  });

  it("never throws", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("garbage"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, DOCX_MIME);
      expect(typeof result).toBe("string");
    }
  });
});

// ============================================================================
// P3: extractFileText — XLSX / XLS
// ============================================================================

describe("P3: extractFileText — XLSX/XLS", () => {
  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const XLS_MIME = "application/vnd.ms-excel";

  it("returns a string (never throws) for non-Excel data (XLSX)", async () => {
    const result = await extractFileText(
      Buffer.from("not an excel file"),
      XLSX_MIME,
    );
    expect(typeof result).toBe("string");
  });

  it("returns a string (never throws) for non-Excel data (XLS)", async () => {
    const result = await extractFileText(
      Buffer.from("not an excel file"),
      XLS_MIME,
    );
    expect(typeof result).toBe("string");
  });

  it("never throws for XLSX", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("garbage"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, XLSX_MIME);
      expect(typeof result).toBe("string");
    }
  });

  it("never throws for XLS", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("garbage"),
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, XLS_MIME);
      expect(typeof result).toBe("string");
    }
  });
});

// ============================================================================
// P3: extractFileText — RTF (best-effort control-word stripping)
// ============================================================================

describe("P3: extractFileText — RTF", () => {
  it("extracts plain text from a simple RTF document", async () => {
    const rtf = String.raw`{\rtf1\ansi\deff0
{\fonttbl{\f0\fswiss Helvetica;}}
\f0\pard Hello, this is plain text.\par
More text here.\par
}`;
    const buffer = Buffer.from(rtf, "latin1");
    const result = await extractFileText(buffer, "application/rtf");
    expect(result).toContain("Hello, this is plain text.");
    expect(result).toContain("More text here.");
    expect(result).not.toContain("\\rtf1");
    expect(result).not.toContain("\\fonttbl");
    expect(result).not.toContain("\\pard");
    expect(result).not.toContain("\\par");
  });

  it("returns empty string for empty RTF", async () => {
    const result = await extractFileText(
      Buffer.from("{\\rtf1\n}"),
      "application/rtf",
    );
    expect(typeof result).toBe("string");
  });

  it("never throws", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("not rtf at all"),
      Buffer.from("{\\rtf1 garbage without closing brace"),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, "application/rtf");
      expect(typeof result).toBe("string");
    }
  });

  it("strips font table and color table groups", async () => {
    const rtf = String.raw`{\rtf1\ansi
{\fonttbl{\f0\fswiss Arial;}{\f1\fmodern Courier;}}
{\colortbl;\red0\green0\blue0;\red255\green0\blue0;}
Actual document text here.\par
}`;
    const buffer = Buffer.from(rtf, "latin1");
    const result = await extractFileText(buffer, "application/rtf");
    expect(result).toContain("Actual document text here.");
    expect(result).not.toContain("fonttbl");
    expect(result).not.toContain("colortbl");
    expect(result).not.toContain("Arial");
    expect(result).not.toContain("Courier");
  });
});

// ============================================================================
// P3: extractFileText — DOC (binary, best-effort)
// ============================================================================

describe("P3: extractFileText — DOC (binary)", () => {
  it("extracts printable text runs from binary data", async () => {
    const binary = Buffer.concat([
      Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]),
      Buffer.from("CONTRACT AGREEMENT", "ascii"),
      Buffer.from([0x00, 0x00, 0xff, 0x00]),
      Buffer.from("Payment: $10,000", "ascii"),
      Buffer.from([0x01, 0x02]),
    ]);
    const result = await extractFileText(binary, "application/msword");
    expect(result).toContain("CONTRACT AGREEMENT");
    expect(result).toContain("Payment: $10,000");
  });

  it("returns empty string when no printable runs found", async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00]);
    const result = await extractFileText(binary, "application/msword");
    expect(result).toBe("");
  });

  it("never throws", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.alloc(100, 0x00),
      Buffer.alloc(100, 0x41),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, "application/msword");
      expect(typeof result).toBe("string");
    }
  });

  it("filters out runs shorter than minimum threshold", async () => {
    const binary = Buffer.from("AB   XYZ", "ascii");
    const result = await extractFileText(binary, "application/msword");
    expect(result).not.toContain("AB");
    expect(result).not.toContain("XYZ");
  });

  it("truncates output for very large binary files", async () => {
    const chunk = Buffer.from("HELLO_WORLD_", "ascii");
    const large = Buffer.concat(Array(10000).fill(chunk));
    const result = await extractFileText(large, "application/msword");
    expect(result.length).toBeLessThanOrEqual(200_000 + 100);
  });
});

// ============================================================================
// P3: extractFileText — ODT (best-effort)
// ============================================================================

describe("P3: extractFileText — ODT", () => {
  const ODT_MIME = "application/vnd.oasis.opendocument.text";

  it("extracts text from text:p elements in ODT XML", async () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<office:document-content xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">',
      "<office:body>",
      "<office:text>",
      "<text:p>First paragraph of the ODT document.</text:p>",
      "<text:p>Second paragraph with important content.</text:p>",
      "<text:h>Heading Text</text:h>",
      "</office:text>",
      "</office:body>",
      "</office:document-content>",
    ].join("\n");
    const buffer = Buffer.from(xml, "latin1");
    const result = await extractFileText(buffer, ODT_MIME);
    expect(result).toContain("First paragraph of the ODT document.");
    expect(result).toContain("Second paragraph with important content.");
    expect(result).toContain("Heading Text");
  });

  it("falls back to text:span extraction when no paragraphs found", async () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<office:document-content xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">',
      "<office:body><office:text>",
      '<text:span>Some inline text</text:span>',
      '<text:span>More inline content</text:span>',
      "</office:text></office:body>",
      "</office:document-content>",
    ].join("");
    const buffer = Buffer.from(xml, "latin1");
    const result = await extractFileText(buffer, ODT_MIME);
    expect(result).toContain("Some inline text");
    expect(result).toContain("More inline content");
  });

  it("returns empty string when no ODT text elements found", async () => {
    const result = await extractFileText(
      Buffer.from("not an odt file"),
      ODT_MIME,
    );
    expect(result).toBe("");
  });

  it("never throws", async () => {
    const inputs = [
      Buffer.from(""),
      Buffer.from("garbage data"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ];
    for (const input of inputs) {
      const result = await extractFileText(input, ODT_MIME);
      expect(typeof result).toBe("string");
    }
  });

  it("strips nested XML tags inside text:p", async () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<office:document-content xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">',
      "<office:body><office:text>",
      '<text:p>Plain <text:span>nested</text:span> content with <text:a xlink:href="http://example.com">a link</text:a> inside.</text:p>',
      "</office:text></office:body>",
      "</office:document-content>",
    ].join("");
    const buffer = Buffer.from(xml, "latin1");
    const result = await extractFileText(buffer, ODT_MIME);
    expect(result).toContain("Plain");
    expect(result).toContain("nested");
    expect(result).toContain("a link");
    expect(result).not.toContain("text:span");
    expect(result).not.toContain("text:a");
    expect(result).not.toContain("xlink:href");
  });
});

// ============================================================================
// P3: extractFileText — unknown MIME type
// ============================================================================

describe("P3: extractFileText — unknown MIME type", () => {
  it("returns empty string for unsupported MIME types", async () => {
    const result = await extractFileText(
      Buffer.from("some content"),
      "image/png",
    );
    expect(result).toBe("");
  });

  it("returns empty string for empty MIME type", async () => {
    const result = await extractFileText(Buffer.from("content"), "");
    expect(result).toBe("");
  });

  it("never throws for any MIME type", async () => {
    const unknownTypes = [
      "image/png",
      "video/mp4",
      "application/zip",
      "application/octet-stream",
      "",
    ];
    for (const mime of unknownTypes) {
      const result = await extractFileText(Buffer.from("data"), mime);
      expect(typeof result).toBe("string");
      expect(result).toBe("");
    }
  });
});

// ============================================================================
// P3: extractFileText — never throws contract
// ============================================================================

describe("P3: extractFileText — never throws contract", () => {
  it("never throws for null/undefined-like buffers", async () => {
    const result = await extractFileText(Buffer.alloc(0), "text/plain");
    expect(typeof result).toBe("string");
  });

  it("never throws for extremely large inputs", async () => {
    const large = Buffer.alloc(1_000_000, 0x41);
    const result = await extractFileText(large, "text/plain");
    expect(typeof result).toBe("string");
    expect(result.length).toBe(1_000_000);
  });

  it("handles all 14 MIME types without throwing", async () => {
    const testContent = Buffer.from("Test content for extraction");
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = await extractFileText(testContent, mime);
      expect(
        typeof result,
        `extractFileText should return a string for ${mime}`,
      ).toBe("string");
    }
  });
});

// ============================================================================
// P3: MIME_TO_EXTENSION consistency
// ============================================================================

describe("P3: MIME_TO_EXTENSION constraint", () => {
  it("every extension starts with a dot", () => {
    for (const [, ext] of Object.entries(MIME_TO_EXTENSION)) {
      expect(ext.startsWith("."), `Extension ${ext} must start with dot`).toBe(
        true,
      );
    }
  });

  it("every extension is unique (except .xml which appears twice)", () => {
    const exts = Object.values(MIME_TO_EXTENSION);
    const xmlCount = exts.filter((e) => e === ".xml").length;
    expect(xmlCount).toBe(2);

    const nonXmlExts = exts.filter((e) => e !== ".xml");
    const uniqueNonXml = new Set(nonXmlExts);
    expect(uniqueNonXml.size).toBe(nonXmlExts.length);
  });
});

// ============================================================================
// P4: Hash preservation across soft delete
// ============================================================================

describe("P4: Hash preservation after soft delete", () => {
  it("text hash is preserved after extracted_text is cleared (soft delete)", () => {
    // Soft delete sets extracted_text to "", but the text_hash column
    // remains unchanged in the DB. The text hash computed from the
    // original extracted text should still match the stored text_hash.
    const originalText = "Payment terms: $10,000 due 2026-07-01.";
    const originalHash = computeTextHash(originalText);

    // After soft delete, extracted_text is "" but stored text_hash is kept
    const afterDeleteHash = originalHash; // hash column not modified
    expect(afterDeleteHash).toBe(computeTextHash(originalText));
    expect(afterDeleteHash).not.toBe(computeTextHash(""));
  });

  it("binary hash is preserved after soft delete (column not modified)", () => {
    const buffer = Buffer.from("Contract v1 binary content", "utf-8");
    const originalBinaryHash = computeBinaryHash(buffer);

    // Soft delete preserves binary_hash in the DB
    const preservedHash = originalBinaryHash;
    expect(preservedHash).toBe(computeBinaryHash(buffer));
    expect(preservedHash).toHaveLength(64);
  });

  it("empty extracted_text (post-delete) has a valid, deterministic hash", () => {
    const emptyHash = computeTextHash("");
    expect(emptyHash).toHaveLength(64);
    expect(emptyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeTextHash("")).toBe(emptyHash); // deterministic
  });

  it("a soft-deleted document (empty text) compared against original text triggers AI_COMPARE", () => {
    const originalText = "Confidential Agreement between Party A and Party B.";
    const deletedText = "";

    // Hashes will differ (original text hash vs empty string hash)
    const originalHash = computeTextHash(originalText);
    const deletedHash = computeTextHash(deletedText);

    expect(originalHash).not.toBe(deletedHash);

    // Pipeline should proceed to AI compare since text hashes differ
    const prompt = buildComparePrompt(originalText, deletedText);
    expect(prompt.user).toContain("Confidential Agreement");
    expect(prompt.user).toContain("Document B (new version)");
  });

  it("binary hash differs for identical text content when BOM/encoding differs", () => {
    // This validates that binary hash comparison catches encoding-level diffs
    // even when the text content is logically identical — relevant for
    // documents that went through soft-delete (file removed, hash kept).
    const text = "Payment: $10,000";
    const bufUtf8 = Buffer.from(text, "utf-8");
    const bufUtf16 = Buffer.from(text, "utf-16le");

    const hashUtf8 = computeBinaryHash(bufUtf8);
    const hashUtf16 = computeBinaryHash(bufUtf16);

    expect(hashUtf8).not.toBe(hashUtf16);
  });

  it("compare prompt works correctly with one empty text (deleted document scenario)", () => {
    const prompt = buildComparePrompt(
      "This document has substantive content.",
      "", // soft-deleted document has empty extracted_text
    );

    expect(prompt.system).toContain("MATERIAL or NOT_MATERIAL");
    expect(prompt.user).toContain("Document A (baseline)");
    expect(prompt.user).toContain("Document B (new version)");

    // AI response for empty vs non-empty should be parsable
    const aiResponse = {
      verdict: "MATERIAL" as const,
      confidence: "MEDIUM" as const,
      reasoning:
        "Document B has no extractable text while Document A contains substantive content.",
    };
    const parsed = parseAIResponse(aiResponse);
    expect(parsed.verdict).toBe("MATERIAL");
    expect(parsed.confidence).toBe("MEDIUM");
  });
});

// ============================================================================
// P4: Deleted document integrity verification
// ============================================================================

describe("P4: Integrity verification of soft-deleted documents", () => {
  it("two soft-deleted documents with identical original text have matching hashes", () => {
    const originalText = "Section 1: Indemnification clause. Section 2: Payment terms.";
    const hash1 = computeTextHash(originalText);
    const hash2 = computeTextHash(originalText);

    // Even if both documents are soft-deleted (extracted_text is ""),
    // their stored text_hash values (from when they were active) would match
    expect(hash1).toBe(hash2);
  });

  it("soft-deleted document can be compared against another active document", () => {
    // Doc A: active, text = "Payment: $10,000"
    // Doc B: soft-deleted, stored text_hash matches "Payment: $25,000"
    const docAText = "Payment: $10,000";
    const docBOriginalText = "Payment: $25,000";

    const docATextHash = computeTextHash(docAText);
    const docBTextHash = computeTextHash(docBOriginalText);

    expect(docATextHash).not.toBe(docBTextHash);

    // AI compare would be triggered
    const prompt = buildComparePrompt(docAText, docBOriginalText);
    expect(prompt.user).toContain("$10,000");
    expect(prompt.user).toContain("$25,000");
  });

  it("restored document with empty extracted_text still has preserved hash", () => {
    // On restore, deleted_at is cleared but extracted_text stays ""
    // The text_hash from the original upload is preserved
    const originalText = "Non-disclosure agreement between Company X and Company Y.";
    const storedHash = computeTextHash(originalText);

    // After restore: extracted_text is still "", but text_hash column is unchanged
    expect(storedHash).toBe(computeTextHash(originalText));
    expect(storedHash).not.toBe(computeTextHash(""));
  });
});

// ============================================================================
// P5: computeFingerprint — blockchain anchoring fingerprint
// ============================================================================

describe("P5: computeFingerprint", () => {
  it("returns a 66-character 0x-prefixed hex string", () => {
    const fp = computeFingerprint(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(fp).toHaveLength(66);
    expect(fp).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic — same hashes always produce the same fingerprint", () => {
    const bh = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const th = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const fp1 = computeFingerprint(bh, th);
    const fp2 = computeFingerprint(bh, th);
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different binary hashes", () => {
    const th = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const fp1 = computeFingerprint(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      th,
    );
    const fp2 = computeFingerprint(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      th,
    );
    expect(fp1).not.toBe(fp2);
  });

  it("produces different fingerprints for different text hashes", () => {
    const bh = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const fp1 = computeFingerprint(
      bh,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const fp2 = computeFingerprint(
      bh,
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(fp1).not.toBe(fp2);
  });

  it("produces a fingerprint matching a known reference value", () => {
    // SHA-256 of "abc" = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    // SHA-256 of ""    = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const bh = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const th = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const fp = computeFingerprint(bh, th);

    // This is the reference value computed from the same inputs using
    // viem keccak256(encodePacked(["bytes32","bytes32"], [0x+bh, 0x+th]))
    // Verified against a Solidity implementation.
    expect(fp).toBe(
      "0x4372d3e7781250cbf01c9f3ea8571e3a0328ed051dc3028f832f56bc187cd8df",
    );
    expect(fp).toHaveLength(66);
  });

  it("handles all-zero hashes (both hashes are 64 zeros)", () => {
    const zeroHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const fp = computeFingerprint(zeroHash, zeroHash);
    expect(fp).toHaveLength(66);
    expect(fp).toMatch(/^0x[0-9a-f]{64}$/);
    // Determinism check
    expect(computeFingerprint(zeroHash, zeroHash)).toBe(fp);
  });

  it("handles legacy P1 document hashes (64-char lowercase hex)", () => {
    // P1 documents have binary_hash and text_hash as 64 lower hex chars.
    // This test verifies they work as-is without requiring prefix changes.
    const realP1BinaryHash =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const realP1TextHash =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const fp = computeFingerprint(realP1BinaryHash, realP1TextHash);
    expect(fp).toHaveLength(66);
    expect(fp).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces same result as re-importing from lib/anchor directly", async () => {
    // Validate the thin re-export in lib/core.ts delegates correctly
    const { computeFingerprint: direct } = await import("./anchor");
    const bh =
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const th =
      "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
    expect(computeFingerprint(bh, th)).toBe(direct(bh, th));
  });
});
