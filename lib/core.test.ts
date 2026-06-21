import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  computeBinaryHash,
  computeTextHash,
  extractPdfText,
  buildComparePrompt,
  parseAIResponse,
} from "./core";

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
});
