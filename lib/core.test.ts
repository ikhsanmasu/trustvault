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
      await expect(extractPdfText(input)).resolves.toBeDefined();
    }
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
});
